/**
 * Example: Using GitHub Storage with TaskMaster
 * 
 * This example demonstrates how to configure and use GitHub Issues
 * as a storage backend for TaskMaster tasks.
 */

import { GitHubStorage } from '@tm/core';
import type { Task } from '@tm/core/types';

async function exampleUsage() {
	// 1. Create GitHub storage instance
	const storage = new GitHubStorage({
		token: process.env.GITHUB_TOKEN || '',
		owner: 'your-username',
		repo: 'your-repo',
		defaultLabels: ['taskmaster', 'automated']
	});

	// 2. Initialize the storage (verifies access)
	await storage.initialize();

	// 3. Create a new task
	const newTask: Task = {
		id: '1',
		title: 'Implement User Authentication',
		description: 'Add JWT-based authentication system',
		status: 'pending',
		priority: 'high',
		dependencies: [],
		details:
			'Use JWT tokens with refresh token rotation. Store sessions in Redis.',
		testStrategy: 'Unit tests for auth service, integration tests for endpoints',
		subtasks: [
			{
				id: 1,
				title: 'Set up JWT library',
				description: 'Install and configure JWT library',
				status: 'done'
			},
			{
				id: 2,
				title: 'Implement login endpoint',
				description: 'Create POST /api/auth/login endpoint',
				status: 'in-progress'
			}
		]
	};

	// 4. Save the task (creates a GitHub issue)
	await storage.saveTasks([newTask], 'feature-auth');

	// 5. Load all tasks
	const tasks = await storage.loadTasks('feature-auth');
	console.log(`Loaded ${tasks.length} tasks`);

	// 6. Update task status
	await storage.updateTaskStatus('1', 'in-progress', 'feature-auth');

	// 7. Load specific task
	const task = await storage.loadTask('1', 'feature-auth');
	console.log(`Task ${task?.id}: ${task?.title} - ${task?.status}`);

	// 8. Get storage statistics
	const stats = await storage.getStats();
	console.log(`Total tasks: ${stats.totalTasks}`);
	console.log(`Total tags: ${stats.totalTags}`);

	// 9. Tag management
	await storage.createTag('feature-dashboard', {
		description: 'Dashboard feature tasks'
	});

	const tags = await storage.getAllTags();
	console.log('Available tags:', tags);

	// 10. Cleanup
	await storage.close();
}

// Run the example
exampleUsage()
	.then(() => console.log('Example completed successfully'))
	.catch(error => console.error('Example failed:', error));

/**
 * Example: Migration from File Storage to GitHub
 */
async function migrationExample() {
	const { FileStorage } = await import('@tm/core');

	// 1. Load tasks from file storage
	const fileStorage = new FileStorage(process.cwd());
	const existingTasks = await fileStorage.loadTasks();

	// 2. Create GitHub storage
	const githubStorage = new GitHubStorage({
		token: process.env.GITHUB_TOKEN || '',
		owner: 'your-username',
		repo: 'your-repo'
	});

	await githubStorage.initialize();

	// 3. Migrate tasks
	console.log(`Migrating ${existingTasks.length} tasks to GitHub...`);
	await githubStorage.saveTasks(existingTasks, 'master');

	// 4. Verify migration
	const migratedTasks = await githubStorage.loadTasks('master');
	console.log(`Successfully migrated ${migratedTasks.length} tasks`);

	await githubStorage.close();
}

/**
 * Example: Multi-Developer Workflow
 */
async function multiDeveloperExample() {
	const storage = new GitHubStorage({
		token: process.env.GITHUB_TOKEN || '',
		owner: 'your-org',
		repo: 'project-repo'
	});

	await storage.initialize();

	// Developer A works on feature-x
	const taskA: Task = {
		id: '10',
		title: 'Implement Feature X',
		description: 'Add new feature X',
		status: 'in-progress',
		priority: 'high',
		dependencies: [],
		details: 'Implementation details for feature X',
		testStrategy: 'Test strategy for feature X',
		subtasks: []
	};
	await storage.saveTasks([taskA], 'feature-x');

	// Developer B works on feature-y (no conflicts!)
	const taskB: Task = {
		id: '20',
		title: 'Implement Feature Y',
		description: 'Add new feature Y',
		status: 'in-progress',
		priority: 'medium',
		dependencies: [],
		details: 'Implementation details for feature Y',
		testStrategy: 'Test strategy for feature Y',
		subtasks: []
	};
	await storage.saveTasks([taskB], 'feature-y');

	// Both developers can see all tags
	const tagsWithStats = await storage.getTagsWithStats();
	console.log('All feature branches:', tagsWithStats.tags);

	await storage.close();
}

export { exampleUsage, migrationExample, multiDeveloperExample };
