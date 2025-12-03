/**
 * @fileoverview Tests for GitHub storage adapter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubStorage } from '../github-storage.js';
import { TaskMasterError } from '../../../../common/errors/task-master-error.js';

// Mock Octokit
vi.mock('@octokit/rest', () => {
	const mockOctokit = {
		repos: {
			get: vi.fn()
		},
		issues: {
			listForRepo: vi.fn(),
			get: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			createLabel: vi.fn(),
			deleteLabel: vi.fn(),
			listLabelsForRepo: vi.fn()
		},
		paginate: vi.fn()
	};

	return {
		Octokit: vi.fn(() => mockOctokit)
	};
});

describe('GitHubStorage', () => {
	describe('constructor', () => {
		it('should throw error when token is missing', () => {
			expect(() => {
				new GitHubStorage({
					token: '',
					owner: 'test-owner',
					repo: 'test-repo'
				});
			}).toThrow(TaskMasterError);
		});

		it('should throw error when owner is missing', () => {
			expect(() => {
				new GitHubStorage({
					token: 'test-token',
					owner: '',
					repo: 'test-repo'
				});
			}).toThrow(TaskMasterError);
		});

		it('should throw error when repo is missing', () => {
			expect(() => {
				new GitHubStorage({
					token: 'test-token',
					owner: 'test-owner',
					repo: ''
				});
			}).toThrow(TaskMasterError);
		});

		it('should create instance with valid config', () => {
			const storage = new GitHubStorage({
				token: 'test-token',
				owner: 'test-owner',
				repo: 'test-repo'
			});

			expect(storage).toBeDefined();
			expect(storage.getStorageType()).toBe('github');
		});
	});

	describe('getStorageType', () => {
		it('should return "github"', () => {
			const storage = new GitHubStorage({
				token: 'test-token',
				owner: 'test-owner',
				repo: 'test-repo'
			});

			expect(storage.getStorageType()).toBe('github');
		});
	});

	describe('getCurrentBriefName', () => {
		it('should return null (not applicable for GitHub)', () => {
			const storage = new GitHubStorage({
				token: 'test-token',
				owner: 'test-owner',
				repo: 'test-repo'
			});

			expect(storage.getCurrentBriefName()).toBeNull();
		});
	});

	describe('AI-powered methods', () => {
		let storage: GitHubStorage;

		beforeEach(() => {
			storage = new GitHubStorage({
				token: 'test-token',
				owner: 'test-owner',
				repo: 'test-repo'
			});
		});

		it('should throw NOT_IMPLEMENTED for updateTaskWithPrompt', async () => {
			await expect(
				storage.updateTaskWithPrompt('1', 'test prompt')
			).rejects.toThrow(TaskMasterError);
		});

		it('should throw NOT_IMPLEMENTED for expandTaskWithPrompt', async () => {
			await expect(
				storage.expandTaskWithPrompt('1')
			).rejects.toThrow(TaskMasterError);
		});
	});
});
