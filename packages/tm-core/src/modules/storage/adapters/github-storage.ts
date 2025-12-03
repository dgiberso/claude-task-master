/**
 * @fileoverview GitHub Issues storage implementation
 * This provides storage via GitHub Issues as a backend
 */

import { Octokit } from '@octokit/rest';
import {
	ERROR_CODES,
	TaskMasterError
} from '../../../common/errors/task-master-error.js';
import type {
	IStorage,
	LoadTasksOptions,
	StorageStats,
	TagInfo,
	TagsWithStatsResult,
	UpdateStatusResult
} from '../../../common/interfaces/storage.interface.js';
import { getLogger } from '../../../common/logger/factory.js';
import type {
	Task,
	TaskMetadata,
	TaskStatus
} from '../../../common/types/index.js';
import type { ExpandTaskResult } from '../../integration/services/task-expansion.service.js';

/**
 * GitHub storage configuration
 */
export interface GitHubStorageConfig {
	/** GitHub access token */
	token: string;
	/** Repository owner */
	owner: string;
	/** Repository name */
	repo: string;
	/** Default labels to apply to issues */
	defaultLabels?: string[];
	/** Project path for context */
	projectPath?: string;
}

/**
 * GitHub storage implementation using GitHub Issues as backend
 */
export class GitHubStorage implements IStorage {
	private readonly octokit: Octokit;
	private readonly owner: string;
	private readonly repo: string;
	private readonly defaultLabels: string[];
	private readonly projectPath: string;
	private readonly logger = getLogger('GitHubStorage');
	private initialized = false;

	constructor(config: GitHubStorageConfig) {
		this.validateConfig(config);

		this.octokit = new Octokit({
			auth: config.token
		});

		this.owner = config.owner;
		this.repo = config.repo;
		this.defaultLabels = config.defaultLabels || ['taskmaster'];
		this.projectPath = config.projectPath || process.cwd();
	}

	/**
	 * Validate GitHub storage configuration
	 */
	private validateConfig(config: GitHubStorageConfig): void {
		if (!config.token) {
			throw new TaskMasterError(
				'GitHub token is required for GitHub storage',
				ERROR_CODES.MISSING_CONFIGURATION
			);
		}

		if (!config.owner) {
			throw new TaskMasterError(
				'GitHub repository owner is required',
				ERROR_CODES.MISSING_CONFIGURATION
			);
		}

		if (!config.repo) {
			throw new TaskMasterError(
				'GitHub repository name is required',
				ERROR_CODES.MISSING_CONFIGURATION
			);
		}
	}

	/**
	 * Initialize the GitHub storage
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Verify authentication and repository access
			await this.octokit.repos.get({
				owner: this.owner,
				repo: this.repo
			});

			this.initialized = true;
			this.logger.debug('GitHub storage initialized successfully');
		} catch (error: any) {
			if (error.status === 401) {
				throw new TaskMasterError(
					'GitHub authentication failed. Please check your token.',
					ERROR_CODES.AUTHENTICATION_ERROR,
					{ operation: 'initialize' },
					error
				);
			}
			if (error.status === 404) {
				throw new TaskMasterError(
					`Repository ${this.owner}/${this.repo} not found or no access`,
					ERROR_CODES.STORAGE_ERROR,
					{ operation: 'initialize' },
					error
				);
			}
			throw new TaskMasterError(
				'Failed to initialize GitHub storage',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'initialize' },
				error
			);
		}
	}

	/**
	 * Get the storage type
	 */
	getStorageType(): 'github' {
		return 'github';
	}

	/**
	 * Get the current brief name (not applicable for GitHub storage)
	 */
	getCurrentBriefName(): string | null {
		return null;
	}

	/**
	 * Close storage connections
	 */
	async close(): Promise<void> {
		// No persistent connections to close
		this.initialized = false;
	}

	/**
	 * Convert GitHub Issue to Task
	 */
	private issueToTask(issue: any, tag?: string): Task {
		// Extract task ID from title [Task X]
		const taskIdMatch = issue.title.match(/^\[Task (\d+(?:\.\d+)?)\]/);
		const taskId = taskIdMatch ? taskIdMatch[1] : issue.number.toString();

		// Parse issue body for TaskMaster-specific data
		const body = issue.body || '';
		const sections = this.parseIssueBody(body);

		// Extract priority from labels
		const priorityLabel = issue.labels.find((l: any) =>
			l.name.startsWith('priority:')
		);
		const priority = priorityLabel
			? priorityLabel.name.split(':')[1]
			: 'medium';

		// Map status from issue state and labels
		const status = this.mapIssueStateToTaskStatus(issue.state, issue.labels);

		return {
			id: taskId,
			title: issue.title.replace(/^\[Task \d+(?:\.\d+)?\]\s*/, ''),
			description: sections.description || issue.title,
			status,
			priority,
			dependencies: sections.dependencies || [],
			details: sections.details || '',
			testStrategy: sections.testStrategy || '',
			subtasks: sections.subtasks || [],
			createdAt: issue.created_at,
			updatedAt: issue.updated_at,
			// Store GitHub-specific metadata
			databaseId: issue.number.toString()
		};
	}

	/**
	 * Parse issue body to extract TaskMaster sections
	 */
	private parseIssueBody(body: string): {
		description?: string;
		details?: string;
		testStrategy?: string;
		dependencies?: string[];
		subtasks?: any[];
	} {
		const sections: any = {};

		// Extract description (first paragraph before any headers)
		const descMatch = body.match(/^([^\n#]+)/);
		sections.description = descMatch ? descMatch[1].trim() : '';

		// Extract details section
		const detailsMatch = body.match(/## Details\s+([\s\S]*?)(?=\n##|\n$|$)/i);
		sections.details = detailsMatch ? detailsMatch[1].trim() : '';

		// Extract test strategy
		const testMatch = body.match(
			/## Test Strategy\s+([\s\S]*?)(?=\n##|\n$|$)/i
		);
		sections.testStrategy = testMatch ? testMatch[1].trim() : '';

		// Extract dependencies
		const depsMatch = body.match(/## Dependencies\s+([\s\S]*?)(?=\n##|\n$|$)/i);
		if (depsMatch) {
			sections.dependencies = depsMatch[1]
				.split('\n')
				.map(line => line.trim().replace(/^[-*]\s*/, ''))
				.filter(Boolean);
		}

		// Extract subtasks from checklist
		const subtasksMatch = body.match(/## Subtasks\s+([\s\S]*?)(?=\n##|\n$|$)/i);
		if (subtasksMatch) {
			const checklistItems = subtasksMatch[1]
				.split('\n')
				.filter(line => line.trim().match(/^[-*]\s*\[[ x]\]/));

			sections.subtasks = checklistItems.map((item, index) => {
				const checked = item.includes('[x]');
				const title = item.replace(/^[-*]\s*\[[ x]\]\s*/, '').trim();
				return {
					id: index + 1,
					title,
					description: title,
					status: checked ? 'done' : 'pending'
				};
			});
		}

		return sections;
	}

	/**
	 * Map GitHub issue state to TaskMaster status
	 */
	private mapIssueStateToTaskStatus(
		state: string,
		labels: any[]
	): TaskStatus {
		if (state === 'closed') {
			return 'done';
		}

		// Check for status labels
		const statusLabel = labels.find((l: any) => l.name.startsWith('status:'));
		if (statusLabel) {
			const status = statusLabel.name.split(':')[1];
			if (
				[
					'pending',
					'in-progress',
					'done',
					'deferred',
					'cancelled',
					'blocked',
					'review'
				].includes(status)
			) {
				return status as TaskStatus;
			}
		}

		return 'pending';
	}

	/**
	 * Ensure storage is initialized
	 */
	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	/**
	 * Load all tasks from GitHub Issues
	 */
	async loadTasks(tag?: string, options?: LoadTasksOptions): Promise<Task[]> {
		await this.ensureInitialized();

		try {
			const labels = tag ? [...this.defaultLabels, `tag:${tag}`] : this.defaultLabels;

			// Fetch all issues with pagination
			const issues = await this.octokit.paginate(
				this.octokit.issues.listForRepo,
				{
					owner: this.owner,
					repo: this.repo,
					labels: labels.join(','),
					state: 'all',
					per_page: 100
				}
			);

			let tasks = issues.map(issue => this.issueToTask(issue, tag));

			// Apply status filter if provided
			if (options?.status) {
				tasks = tasks.filter(task => task.status === options.status);
			}

			// Exclude subtasks if requested
			if (options?.excludeSubtasks) {
				tasks = tasks.filter(task => !task.id.includes('.'));
			}

			return tasks;
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to load tasks from GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'loadTasks', tag },
				error
			);
		}
	}

	/**
	 * Load a single task by ID
	 */
	async loadTask(taskId: string, tag?: string): Promise<Task | null> {
		await this.ensureInitialized();

		try {
			const tasks = await this.loadTasks(tag);
			return tasks.find(task => task.id === taskId) || null;
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to load task from GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'loadTask', taskId, tag },
				error
			);
		}
	}

	/**
	 * Convert Task to GitHub Issue body
	 */
	private taskToIssueBody(task: Task): string {
		const parts: string[] = [];

		// Description
		if (task.description) {
			parts.push(task.description);
			parts.push('');
		}

		// Details
		if (task.details) {
			parts.push('## Details');
			parts.push(task.details);
			parts.push('');
		}

		// Test Strategy
		if (task.testStrategy) {
			parts.push('## Test Strategy');
			parts.push(task.testStrategy);
			parts.push('');
		}

		// Dependencies
		if (task.dependencies && task.dependencies.length > 0) {
			parts.push('## Dependencies');
			for (const dep of task.dependencies) {
				parts.push(`- ${dep}`);
			}
			parts.push('');
		}

		// Subtasks as checklist
		if (task.subtasks && task.subtasks.length > 0) {
			parts.push('## Subtasks');
			for (const subtask of task.subtasks) {
				const checked = subtask.status === 'done' ? 'x' : ' ';
				parts.push(`- [${checked}] ${subtask.title}`);
			}
			parts.push('');
		}

		return parts.join('\n');
	}

	/**
	 * Get labels for a task
	 */
	private getTaskLabels(task: Task, tag?: string): string[] {
		const labels = [...this.defaultLabels];

		// Add priority label
		if (task.priority) {
			labels.push(`priority:${task.priority}`);
		}

		// Add status label
		if (task.status && task.status !== 'pending') {
			labels.push(`status:${task.status}`);
		}

		// Add tag label
		if (tag) {
			labels.push(`tag:${tag}`);
		}

		return labels;
	}

	/**
	 * Save tasks to GitHub Issues (replaces existing)
	 */
	async saveTasks(tasks: Task[], tag?: string): Promise<void> {
		await this.ensureInitialized();

		try {
			// Load existing issues to update/close
			const existingTasks = await this.loadTasks(tag);
			const existingTaskIds = new Set(existingTasks.map(t => t.id));
			const newTaskIds = new Set(tasks.map(t => t.id));

			// Create/update tasks
			for (const task of tasks) {
				const title = `[Task ${task.id}] ${task.title}`;
				const body = this.taskToIssueBody(task);
				const labels = this.getTaskLabels(task, tag);
				const state = task.status === 'done' ? 'closed' : 'open';

				const existingTask = existingTasks.find(t => t.id === task.id);
				
				if (existingTask && existingTask.databaseId) {
					// Update existing issue
					await this.octokit.issues.update({
						owner: this.owner,
						repo: this.repo,
						issue_number: Number.parseInt(existingTask.databaseId),
						title,
						body,
						labels,
						state: state as 'open' | 'closed'
					});
				} else {
					// Create new issue
					await this.octokit.issues.create({
						owner: this.owner,
						repo: this.repo,
						title,
						body,
						labels
					});
				}
			}

			// Close issues for tasks that no longer exist
			for (const taskId of existingTaskIds) {
				if (!newTaskIds.has(taskId)) {
					const existingTask = existingTasks.find(t => t.id === taskId);
					if (existingTask && existingTask.databaseId) {
						await this.octokit.issues.update({
							owner: this.owner,
							repo: this.repo,
							issue_number: Number.parseInt(existingTask.databaseId),
							state: 'closed'
						});
					}
				}
			}

			this.logger.debug(`Saved ${tasks.length} tasks to GitHub`);
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to save tasks to GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'saveTasks', tag, taskCount: tasks.length },
				error
			);
		}
	}

	/**
	 * Append new tasks to existing storage
	 */
	async appendTasks(tasks: Task[], tag?: string): Promise<void> {
		await this.ensureInitialized();

		try {
			// For GitHub, we create new issues for tasks
			for (const task of tasks) {
				const title = `[Task ${task.id}] ${task.title}`;
				const body = this.taskToIssueBody(task);
				const labels = this.getTaskLabels(task, tag);

				await this.octokit.issues.create({
					owner: this.owner,
					repo: this.repo,
					title,
					body,
					labels
				});
			}

			this.logger.debug(`Appended ${tasks.length} tasks to GitHub`);
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to append tasks to GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'appendTasks', tag, taskCount: tasks.length },
				error
			);
		}
	}

	/**
	 * Update a specific task by ID
	 */
	async updateTask(taskId: string, updates: Partial<Task>, tag?: string): Promise<void> {
		await this.ensureInitialized();

		try {
			const existingTask = await this.loadTask(taskId, tag);
			if (!existingTask) {
				throw new TaskMasterError(
					`Task ${taskId} not found`,
					ERROR_CODES.TASK_NOT_FOUND,
					{ taskId, tag }
				);
			}

			if (!existingTask.databaseId) {
				throw new TaskMasterError(
					`Task ${taskId} has no GitHub issue number`,
					ERROR_CODES.STORAGE_ERROR,
					{ taskId, tag }
				);
			}

			// Merge updates with existing task
			const updatedTask = { ...existingTask, ...updates };
			const title = `[Task ${updatedTask.id}] ${updatedTask.title}`;
			const body = this.taskToIssueBody(updatedTask);
			const labels = this.getTaskLabels(updatedTask, tag);
			const state = updatedTask.status === 'done' ? 'closed' : 'open';

			await this.octokit.issues.update({
				owner: this.owner,
				repo: this.repo,
				issue_number: Number.parseInt(existingTask.databaseId),
				title,
				body,
				labels,
				state: state as 'open' | 'closed'
			});

			this.logger.debug(`Updated task ${taskId} in GitHub`);
		} catch (error: any) {
			if (error instanceof TaskMasterError) throw error;
			throw new TaskMasterError(
				'Failed to update task in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'updateTask', taskId, tag },
				error
			);
		}
	}

	/**
	 * Update task using AI-powered prompt (not supported for GitHub storage)
	 * GitHub storage focuses on structural updates via updateTask
	 */
	async updateTaskWithPrompt(
		taskId: string,
		prompt: string,
		tag?: string,
		options?: { useResearch?: boolean; mode?: 'append' | 'update' | 'rewrite' }
	): Promise<void> {
		throw new TaskMasterError(
			'AI-powered task updates are not supported for GitHub storage. Use updateTask for structural updates.',
			ERROR_CODES.NOT_IMPLEMENTED,
			{ operation: 'updateTaskWithPrompt', taskId, tag }
		);
	}

	/**
	 * Expand task into subtasks using AI (not supported for GitHub storage)
	 * GitHub storage focuses on structural operations
	 */
	async expandTaskWithPrompt(
		taskId: string,
		tag?: string,
		options?: {
			numSubtasks?: number;
			useResearch?: boolean;
			additionalContext?: string;
			force?: boolean;
		}
	): Promise<ExpandTaskResult | void> {
		throw new TaskMasterError(
			'AI-powered task expansion is not supported for GitHub storage. Manually add subtasks via updateTask.',
			ERROR_CODES.NOT_IMPLEMENTED,
			{ operation: 'expandTaskWithPrompt', taskId, tag }
		);
	}

	/**
	 * Update task status by ID
	 */
	async updateTaskStatus(
		taskId: string,
		newStatus: TaskStatus,
		tag?: string
	): Promise<UpdateStatusResult> {
		await this.ensureInitialized();

		try {
			const existingTask = await this.loadTask(taskId, tag);
			if (!existingTask) {
				throw new TaskMasterError(
					`Task ${taskId} not found`,
					ERROR_CODES.TASK_NOT_FOUND,
					{ taskId, tag }
				);
			}

			const oldStatus = existingTask.status;

			// Update task with new status
			await this.updateTask(taskId, { status: newStatus }, tag);

			return {
				success: true,
				oldStatus,
				newStatus,
				taskId
			};
		} catch (error: any) {
			if (error instanceof TaskMasterError) throw error;
			throw new TaskMasterError(
				'Failed to update task status in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'updateTaskStatus', taskId, newStatus, tag },
				error
			);
		}
	}

	/**
	 * Delete a task by ID
	 */
	async deleteTask(taskId: string, tag?: string): Promise<void> {
		await this.ensureInitialized();

		try {
			const existingTask = await this.loadTask(taskId, tag);
			if (!existingTask) {
				throw new TaskMasterError(
					`Task ${taskId} not found`,
					ERROR_CODES.TASK_NOT_FOUND,
					{ taskId, tag }
				);
			}

			if (!existingTask.databaseId) {
				throw new TaskMasterError(
					`Task ${taskId} has no GitHub issue number`,
					ERROR_CODES.STORAGE_ERROR,
					{ taskId, tag }
				);
			}

			// Close the issue (GitHub doesn't support deleting issues)
			await this.octokit.issues.update({
				owner: this.owner,
				repo: this.repo,
				issue_number: Number.parseInt(existingTask.databaseId),
				state: 'closed',
				labels: [...this.getTaskLabels(existingTask, tag), 'deleted']
			});

			this.logger.debug(`Deleted (closed) task ${taskId} in GitHub`);
		} catch (error: any) {
			if (error instanceof TaskMasterError) throw error;
			throw new TaskMasterError(
				'Failed to delete task in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'deleteTask', taskId, tag },
				error
			);
		}
	}

	/**
	 * Check if tasks exist for the given tag
	 */
	async exists(tag?: string): Promise<boolean> {
		await this.ensureInitialized();

		try {
			const labels = tag ? [...this.defaultLabels, `tag:${tag}`] : this.defaultLabels;
			
			const response = await this.octokit.issues.listForRepo({
				owner: this.owner,
				repo: this.repo,
				labels: labels.join(','),
				per_page: 1
			});

			return response.data.length > 0;
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to check task existence in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'exists', tag },
				error
			);
		}
	}

	/**
	 * Load metadata about the task collection
	 */
	async loadMetadata(tag?: string): Promise<TaskMetadata | null> {
		await this.ensureInitialized();

		try {
			const tasks = await this.loadTasks(tag);
			const completedTasks = tasks.filter(t => t.status === 'done');

			// Find earliest and latest dates
			const dates = tasks
				.map(t => t.createdAt || t.updatedAt)
				.filter(Boolean)
				.sort();
			
			const metadata: TaskMetadata = {
				version: '1.0.0',
				lastModified: dates[dates.length - 1] || new Date().toISOString(),
				taskCount: tasks.length,
				completedCount: completedTasks.length,
				projectName: `${this.owner}/${this.repo}`,
				description: `GitHub Issues storage for ${this.owner}/${this.repo}`,
				tags: tag ? [tag] : [],
				created: dates[0] || new Date().toISOString(),
				updated: dates[dates.length - 1] || new Date().toISOString()
			};

			return metadata;
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to load metadata from GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'loadMetadata', tag },
				error
			);
		}
	}

	/**
	 * Save metadata (no-op for GitHub - metadata is derived from issues)
	 */
	async saveMetadata(metadata: TaskMetadata, tag?: string): Promise<void> {
		// Metadata in GitHub storage is derived from issues
		// This is a no-op but we log for debugging
		this.logger.debug('saveMetadata called (no-op for GitHub storage)', {
			metadata,
			tag
		});
	}

	/**
	 * Get all available tags
	 */
	async getAllTags(): Promise<string[]> {
		await this.ensureInitialized();

		try {
			// Get all labels that start with 'tag:'
			const labels = await this.octokit.paginate(
				this.octokit.issues.listLabelsForRepo,
				{
					owner: this.owner,
					repo: this.repo,
					per_page: 100
				}
			);

			const tags = labels
				.filter(label => label.name.startsWith('tag:'))
				.map(label => label.name.replace('tag:', ''));

			return tags;
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to get tags from GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'getAllTags' },
				error
			);
		}
	}

	/**
	 * Create a new tag
	 */
	async createTag(
		tagName: string,
		options?: { copyFrom?: string; description?: string }
	): Promise<void> {
		await this.ensureInitialized();

		try {
			// Create the tag label if it doesn't exist
			const labelName = `tag:${tagName}`;
			
			try {
				await this.octokit.issues.createLabel({
					owner: this.owner,
					repo: this.repo,
					name: labelName,
					description: options?.description || `TaskMaster tag: ${tagName}`,
					color: this.generateRandomColor()
				});
			} catch (error: any) {
				// Label might already exist, which is fine
				if (error.status !== 422) {
					throw error;
				}
			}

			// If copyFrom is specified, copy tasks from that tag
			if (options?.copyFrom) {
				const sourceTasks = await this.loadTasks(options.copyFrom);
				for (const task of sourceTasks) {
					await this.appendTasks([task], tagName);
				}
			}

			this.logger.debug(`Created tag ${tagName} in GitHub`);
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to create tag in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'createTag', tagName, options },
				error
			);
		}
	}

	/**
	 * Generate a random color for labels
	 */
	private generateRandomColor(): string {
		const colors = [
			'0075ca', 'cfd3d7', 'a2eeef', '7057ff', 'e99695',
			'f9d0c4', 'fef2c0', 'c2e0c6', 'bfdadc', 'd4c5f9'
		];
		return colors[Math.floor(Math.random() * colors.length)];
	}

	/**
	 * Delete a tag and all its tasks
	 */
	async deleteTag(tag: string): Promise<void> {
		await this.ensureInitialized();

		try {
			// Close all issues with this tag
			const tasks = await this.loadTasks(tag);
			for (const task of tasks) {
				if (task.databaseId) {
					await this.octokit.issues.update({
						owner: this.owner,
						repo: this.repo,
						issue_number: Number.parseInt(task.databaseId),
						state: 'closed'
					});
				}
			}

			// Delete the tag label
			const labelName = `tag:${tag}`;
			try {
				await this.octokit.issues.deleteLabel({
					owner: this.owner,
					repo: this.repo,
					name: labelName
				});
			} catch (error: any) {
				// Label might not exist, which is fine
				if (error.status !== 404) {
					this.logger.warn(`Failed to delete label ${labelName}`, error);
				}
			}

			this.logger.debug(`Deleted tag ${tag} in GitHub`);
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to delete tag in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'deleteTag', tag },
				error
			);
		}
	}

	/**
	 * Rename a tag
	 */
	async renameTag(oldTag: string, newTag: string): Promise<void> {
		await this.ensureInitialized();

		try {
			// Get all tasks with old tag
			const tasks = await this.loadTasks(oldTag);

			// Update each issue to use new tag label
			for (const task of tasks) {
				if (task.databaseId) {
					const issue = await this.octokit.issues.get({
						owner: this.owner,
						repo: this.repo,
						issue_number: Number.parseInt(task.databaseId)
					});

					// Remove old tag label, add new tag label
					const labels = issue.data.labels
						.map((l: any) => l.name)
						.filter((name: string) => name !== `tag:${oldTag}`);
					labels.push(`tag:${newTag}`);

					await this.octokit.issues.update({
						owner: this.owner,
						repo: this.repo,
						issue_number: Number.parseInt(task.databaseId),
						labels
					});
				}
			}

			// Create new tag label
			await this.createTag(newTag);

			// Delete old tag label
			try {
				await this.octokit.issues.deleteLabel({
					owner: this.owner,
					repo: this.repo,
					name: `tag:${oldTag}`
				});
			} catch (error: any) {
				// Label might not exist, which is fine
				if (error.status !== 404) {
					this.logger.warn(`Failed to delete label tag:${oldTag}`, error);
				}
			}

			this.logger.debug(`Renamed tag ${oldTag} to ${newTag} in GitHub`);
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to rename tag in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'renameTag', oldTag, newTag },
				error
			);
		}
	}

	/**
	 * Copy all tasks from one tag to another
	 */
	async copyTag(sourceTag: string, targetTag: string): Promise<void> {
		await this.ensureInitialized();

		try {
			// Ensure target tag exists
			await this.createTag(targetTag);

			// Get all tasks from source tag
			const sourceTasks = await this.loadTasks(sourceTag);

			// Copy tasks to target tag
			for (const task of sourceTasks) {
				await this.appendTasks([task], targetTag);
			}

			this.logger.debug(`Copied ${sourceTasks.length} tasks from ${sourceTag} to ${targetTag}`);
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to copy tag in GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'copyTag', sourceTag, targetTag },
				error
			);
		}
	}

	/**
	 * Get storage statistics
	 */
	async getStats(): Promise<StorageStats> {
		await this.ensureInitialized();

		try {
			const tags = await this.getAllTags();
			const tagStats: Array<{
				tag: string;
				taskCount: number;
				lastModified: string;
			}> = [];

			let totalTasks = 0;
			let latestModified = '';

			for (const tag of tags) {
				const tasks = await this.loadTasks(tag);
				const dates = tasks
					.map(t => t.updatedAt || t.createdAt)
					.filter(Boolean)
					.sort();
				const lastModified = dates[dates.length - 1] || new Date().toISOString();

				tagStats.push({
					tag,
					taskCount: tasks.length,
					lastModified
				});

				totalTasks += tasks.length;
				if (!latestModified || lastModified > latestModified) {
					latestModified = lastModified;
				}
			}

			return {
				totalTasks,
				totalTags: tags.length,
				storageSize: 0, // Not applicable for GitHub
				lastModified: latestModified || new Date().toISOString(),
				tagStats
			};
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to get stats from GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'getStats' },
				error
			);
		}
	}

	/**
	 * Get all tags with detailed statistics
	 */
	async getTagsWithStats(): Promise<TagsWithStatsResult> {
		await this.ensureInitialized();

		try {
			const tags = await this.getAllTags();
			const tagInfos: TagInfo[] = [];

			for (const tag of tags) {
				const tasks = await this.loadTasks(tag);
				const completedTasks = tasks.filter(t => t.status === 'done');

				// Status breakdown
				const statusBreakdown: Record<string, number> = {};
				for (const task of tasks) {
					statusBreakdown[task.status] =
						(statusBreakdown[task.status] || 0) + 1;
				}

				// Subtask counts
				let totalSubtasks = 0;
				const subtasksByStatus: Record<string, number> = {};
				for (const task of tasks) {
					if (task.subtasks) {
						totalSubtasks += task.subtasks.length;
						for (const subtask of task.subtasks) {
							subtasksByStatus[subtask.status] =
								(subtasksByStatus[subtask.status] || 0) + 1;
						}
					}
				}

				const dates = tasks
					.map(t => t.createdAt || t.updatedAt)
					.filter(Boolean)
					.sort();

				tagInfos.push({
					name: tag,
					isCurrent: false, // GitHub storage doesn't have a "current" tag concept
					taskCount: tasks.length,
					completedTasks: completedTasks.length,
					statusBreakdown,
					subtaskCounts: {
						totalSubtasks,
						subtasksByStatus
					},
					created: dates[0],
					updatedAt: dates[dates.length - 1]
				});
			}

			return {
				tags: tagInfos,
				currentTag: null,
				totalTags: tags.length
			};
		} catch (error: any) {
			throw new TaskMasterError(
				'Failed to get tags with stats from GitHub',
				ERROR_CODES.STORAGE_ERROR,
				{ operation: 'getTagsWithStats' },
				error
			);
		}
	}
}
