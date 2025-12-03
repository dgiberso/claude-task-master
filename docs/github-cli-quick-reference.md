# GitHub Storage CLI Quick Reference

Quick reference for using TaskMaster with GitHub Issues storage.

## Setup

### First-Time Setup

```bash
# 1. Set your GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# 2. Initialize TaskMaster with GitHub storage
task-master init

# Follow prompts:
# - Storage type: GitHub Issues
# - Owner: your-username
# - Repo: your-repo
# - Labels: taskmaster (default)
```

### Configuration

Edit `.taskmaster/config.json`:

```json
{
  "storage": {
    "type": "github",
    "githubOwner": "your-username",
    "githubRepo": "your-repo",
    "githubDefaultLabels": ["taskmaster"]
  }
}
```

## Common Commands

### Viewing Tasks

```bash
# List all tasks
task-master list

# List tasks for specific tag
task-master list --tag=feature-x

# List by status
task-master list --status=in-progress

# Show specific task
task-master show 1
```

### Creating Tasks

```bash
# Add task with AI
task-master add-task --prompt="Implement user authentication"

# Add task to specific tag
task-master add-task --prompt="Add dashboard" --tag=feature-ui
```

### Updating Tasks

```bash
# Update task status
task-master set-status --id=1 --status=done

# Update multiple tasks
task-master set-status --id=1,2,3 --status=in-progress

# Update for specific tag
task-master set-status --id=5 --status=done --tag=feature-x
```

### Tag Management

```bash
# List all tags
task-master tags

# Create new tag
task-master add-tag feature-auth

# Create tag with description
task-master add-tag feature-auth --description="Authentication feature tasks"

# Copy tasks from another tag
task-master add-tag feature-v2 --copy-from=feature-v1

# Create tag from current git branch
task-master add-tag --from-branch

# Switch to a tag
task-master use-tag feature-auth

# Delete tag
task-master delete-tag old-feature

# Rename tag
task-master rename-tag old-name new-name
```

### Task Details

```bash
# Show next available task
task-master next

# Show specific task details
task-master show 1

# Show multiple tasks
task-master show 1,2,3
```

## GitHub-Specific Features

### Issue URLs

All commands display GitHub issue URLs when using GitHub storage:

```bash
task-master show 1
# Output includes:
# GitHub Issue: https://github.com/owner/repo/issues/123
```

### Labels

Tasks automatically get labeled:
- `taskmaster` - Identifies TaskMaster issues
- `priority:high/medium/low` - Task priority
- `status:pending/in-progress/done` - Task status
- `tag:feature-name` - TaskMaster tags

View in GitHub:
- Filter by label: `is:issue label:taskmaster`
- Filter by tag: `is:issue label:tag:feature-x`
- Filter by priority: `is:issue label:priority:high`

## Multi-Developer Workflow

### Developer A (Feature Branch)

```bash
# Create feature tag
git checkout -b feature-auth
task-master add-tag --from-branch

# Work on tasks
task-master list --tag=feature-auth
task-master next --tag=feature-auth
task-master set-status --id=1 --status=done --tag=feature-auth
```

### Developer B (Different Feature)

```bash
# Create different feature tag
git checkout -b feature-dashboard
task-master add-tag --from-branch

# Work independently (no conflicts!)
task-master list --tag=feature-dashboard
task-master next --tag=feature-dashboard
```

### See All Work

```bash
# View all tags/features
task-master tags

# View all tasks across tags
task-master list
```

## Migration

### From File Storage

```bash
# 1. Backup existing tasks
cp .taskmaster/tasks.json .taskmaster/tasks.backup.json

# 2. Update config to GitHub storage
# Edit .taskmaster/config.json

# 3. Sync to GitHub (creates issues from existing tasks)
task-master github-sync
```

### Verify Migration

```bash
# Check GitHub issues
# https://github.com/owner/repo/issues?q=is:issue+label:taskmaster

# Verify in TaskMaster
task-master list
task-master stats
```

## Troubleshooting

### Check Configuration

```bash
# View current config
cat .taskmaster/config.json

# Verify GitHub token
echo $GITHUB_TOKEN
```

### Authentication Issues

```bash
# Test GitHub access
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user

# Test repository access
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/owner/repo
```

### Reset Storage

```bash
# Delete all TaskMaster issues (careful!)
task-master delete-tag master

# Reinitialize
task-master init
```

## Best Practices

### 1. Use Tags for Features

```bash
# Start feature
git checkout -b feature-name
task-master add-tag --from-branch

# Work on feature
task-master use-tag feature-name
task-master list
```

### 2. Regular Syncing

```bash
# Sync before starting work
task-master github-sync

# Sync after major changes
task-master github-sync
```

### 3. Descriptive Tags

```bash
# Good tag names
task-master add-tag auth-refactor --description="Refactor authentication system"
task-master add-tag ui-redesign --description="New UI design implementation"

# Less helpful
task-master add-tag stuff
task-master add-tag temp
```

### 4. Status Updates

```bash
# Update status regularly
task-master set-status --id=1 --status=in-progress
# ... do work ...
task-master set-status --id=1 --status=done
```

## Common Workflows

### Starting a New Feature

```bash
# 1. Create feature branch
git checkout -b feature-new-api

# 2. Create task tag
task-master add-tag --from-branch

# 3. Plan feature
task-master add-task --prompt="Design new API endpoints"
task-master add-task --prompt="Implement API routes"
task-master add-task --prompt="Add API tests"

# 4. Start work
task-master next
```

### Code Review Workflow

```bash
# 1. View all feature tasks
task-master list --tag=feature-name

# 2. Check task completion
task-master show 1,2,3

# 3. Review in GitHub
# Open GitHub issues to see full details and comments
```

### Merging Features

```bash
# 1. Ensure all tasks done
task-master list --tag=feature-name --status=done

# 2. Merge code
git merge feature-name

# 3. Optionally rename or delete tag
task-master rename-tag feature-name merged-feature-name
# or
task-master delete-tag feature-name
```

## Environment Setup

### .env File

```bash
# .taskmaster/.env
GITHUB_TOKEN=ghp_your_token_here
```

### Shell Profile

```bash
# ~/.bashrc or ~/.zshrc
export GITHUB_TOKEN=ghp_your_token_here
```

### CI/CD

```yaml
# .github/workflows/taskmaster.yml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

steps:
  - name: Sync Tasks
    run: |
      npm install -g task-master-ai
      task-master github-sync
```

## Quick Tips

1. **View in GitHub**: All tasks are regular GitHub issues - use GitHub's UI for advanced filtering
2. **Collaboration**: Assign issues, add comments, use milestones - all GitHub features work
3. **No Conflicts**: Multiple developers can work simultaneously without merge conflicts
4. **Audit Trail**: GitHub tracks all changes automatically
5. **Notifications**: Get GitHub notifications for task updates

## Support

- Documentation: https://docs.task-master.dev
- GitHub: https://github.com/eyaltoledano/claude-task-master
- Discord: https://discord.gg/taskmasterai
