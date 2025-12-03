# GitHub Issues Storage Integration

TaskMaster now supports using GitHub Issues as a centralized task storage backend, solving merge conflicts in multi-developer scenarios.

## Overview

The GitHub storage adapter enables TaskMaster to:
- Store tasks as GitHub Issues in your repository
- Synchronize tasks bidirectionally between TaskMaster and GitHub
- Leverage GitHub's collaboration features (labels, milestones, comments)
- Prevent merge conflicts when multiple developers work on tasks simultaneously

## Setup

### 1. Generate a GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "TaskMaster Integration")
4. Select the `repo` scope (full control of private repositories)
5. Generate and copy the token

### 2. Configure Environment Variable

Add your GitHub token to your environment:

```bash
# In your .env file
GITHUB_TOKEN=ghp_your_token_here
```

Or export it in your shell:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

### 3. Initialize TaskMaster with GitHub Storage

When initializing a new TaskMaster project, select GitHub as your storage backend:

```bash
task-master init
```

Follow the prompts and select "GitHub Issues" as your storage type. You'll be asked to provide:
- Repository owner (your GitHub username or organization)
- Repository name
- Default labels (optional, defaults to "taskmaster")

Alternatively, configure it manually in `.taskmaster/config.json`:

```json
{
  "storage": {
    "type": "github",
    "githubOwner": "your-username",
    "githubRepo": "your-repo",
    "githubDefaultLabels": ["taskmaster", "automated"]
  }
}
```

## Task Mapping

TaskMaster tasks are mapped to GitHub Issues as follows:

### Task Fields → GitHub Issue Fields

| TaskMaster Field | GitHub Issue Field | Format |
|-----------------|-------------------|---------|
| Task ID | Issue Title Prefix | `[Task 1]` |
| Title | Issue Title | Main title text |
| Description | Issue Body | First paragraph |
| Status | Issue State + Labels | `open`/`closed` + `status:*` |
| Priority | Labels | `priority:high`, `priority:medium`, `priority:low` |
| Dependencies | Issue Body Section | `## Dependencies` |
| Details | Issue Body Section | `## Details` |
| Test Strategy | Issue Body Section | `## Test Strategy` |
| Subtasks | Issue Checklist | `- [ ] Subtask 1` |
| Tags | Labels | `tag:feature-name` |

### Example Issue Format

```markdown
[Task 1] Implement User Authentication

User authentication using JWT tokens with session management.

## Details
- Use JWT for token-based auth
- Implement refresh token rotation
- Store sessions in Redis

## Test Strategy
- Unit tests for auth service
- Integration tests for login/logout
- Security testing for token validation

## Dependencies
- Task 2
- Task 3

## Subtasks
- [x] Set up JWT library
- [ ] Implement login endpoint
- [ ] Implement logout endpoint
```

## Usage

### CLI Commands

All standard TaskMaster commands work with GitHub storage:

```bash
# List tasks (fetches from GitHub)
task-master list

# Show task details
task-master show 1

# Update task status (updates GitHub issue)
task-master set-status --id=1 --status=done

# Add new task (creates GitHub issue)
task-master add-task --prompt="Implement feature X"
```

### Manual Synchronization

GitHub storage automatically syncs on each operation, but you can also trigger manual sync:

```bash
task-master github-sync
```

### Configuration Management

Update GitHub repository settings:

```bash
task-master github-config --owner=new-owner --repo=new-repo
```

## Labels and Organization

### Default Labels

The GitHub adapter automatically creates and manages these labels:

- `taskmaster` - Identifies TaskMaster-managed issues
- `priority:high`, `priority:medium`, `priority:low` - Task priority
- `status:pending`, `status:in-progress`, `status:blocked`, etc. - Task status
- `tag:*` - TaskMaster tags for organization

### Custom Labels

You can configure additional default labels in your configuration:

```json
{
  "storage": {
    "githubDefaultLabels": ["taskmaster", "automated", "ai-generated"]
  }
}
```

## Best Practices

### Multi-Developer Workflows

1. **Use separate tags for features**: Each developer or feature branch can have its own tag
   ```bash
   task-master add-tag feature-x --from-branch
   ```

2. **Leverage GitHub's collaboration features**:
   - Assign issues to team members
   - Use milestones for releases
   - Add comments for discussions

3. **Review changes in GitHub**: All task updates create GitHub events visible in the repository

### Migration from File Storage

To migrate existing tasks from file storage to GitHub:

1. Backup your current tasks: `cp .taskmaster/tasks.json .taskmaster/tasks.backup.json`
2. Update config to use GitHub storage
3. Run `task-master github-sync` to push existing tasks to GitHub

### Conflict Resolution

Since all tasks are stored centrally in GitHub:
- No more merge conflicts in `tasks.json`
- Changes are immediately visible to all team members
- GitHub's issue history provides full audit trail

## Limitations

### AI-Powered Operations

The following AI-powered operations are not supported with GitHub storage:

- `updateTaskWithPrompt` - Use `updateTask` with structural updates instead
- `expandTaskWithPrompt` - Manually add subtasks via `updateTask`

This is intentional to keep GitHub storage focused on structural operations and prevent complexity.

### Rate Limiting

GitHub API has rate limits:
- **Authenticated requests**: 5,000 per hour
- **Unauthenticated**: 60 per hour (not applicable with token)

TaskMaster automatically handles pagination and respects rate limits.

## Troubleshooting

### Authentication Errors

```
Error: GitHub authentication failed
```

**Solution**: Verify your `GITHUB_TOKEN` is valid and has `repo` scope.

### Repository Not Found

```
Error: Repository owner/repo not found or no access
```

**Solution**: Ensure:
- Repository name is correct
- Token has access to the repository
- Repository exists and you have permissions

### Label Creation Failed

```
Warning: Failed to create label tag:feature-x
```

**Solution**: This usually means the label already exists, which is fine. The adapter will continue working.

## API Reference

### GitHubStorage Class

```typescript
import { GitHubStorage } from '@tm/core';

const storage = new GitHubStorage({
  token: 'ghp_your_token',
  owner: 'your-username',
  repo: 'your-repo',
  defaultLabels: ['taskmaster'],
  projectPath: process.cwd()
});

await storage.initialize();
```

### Configuration Interface

```typescript
interface GitHubStorageConfig {
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
```

## Security Considerations

1. **Token Security**: Never commit GitHub tokens to version control
2. **Scope Limitations**: Use tokens with minimal required scope (`repo` only)
3. **Token Rotation**: Regularly rotate your access tokens
4. **Environment Variables**: Store tokens in `.env` files (add to `.gitignore`)

## Future Enhancements

Planned features for future releases:

- GitHub Projects integration
- Milestone synchronization
- Comment-based task updates
- GitHub Actions integration for automation
- Support for GitHub Enterprise

## Support

For issues, questions, or feature requests related to GitHub storage:

1. Check existing GitHub Issues in the TaskMaster repository
2. Create a new issue with the `github-integration` label
3. Include your TaskMaster version and configuration (redact sensitive info)

## Related Documentation

- [Configuration Guide](./configuration.md)
- [Storage Architecture](./contributor-docs/storage-architecture.md)
- [Migration Guide](./migration-guide.md)
