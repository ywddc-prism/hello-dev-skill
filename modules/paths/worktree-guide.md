# Worktree Guide - Subtask Branch Management

> Use Git Worktree to manage subtask branches, keeping the main branch clean.

---

## Core Concept

```
Traditional approach:

 main branch 
 Feature A (unfinished, need to change B midway) 
 Feature B (unfinished) 
 Feature C (all mixed together) 

Worktree approach:

 main branch (clean, only stable code) 

 worktree/feature-a/ (independent working tree) 
 Feature A 
 Complete -> Merge -> Delete working tree 

 worktree/feature-b/ (independent working tree) 
 Feature B 
 Complete -> Merge -> Delete working tree 

```

---

## Workflow

```

 WORKTREE Subtask Flow 

 1. Main branch (main) 
 Clean, only stable code 

 2. Create subtask working tree 
 git worktree add ../worktree/feature-name main 
 Auto-enter new working tree directory 

 3. Develop on subtask branch 
 Implement feature 
 Commit code 
 Testing + Review 

 4. Merge back to main branch 
 git checkout main 
 git merge feature-name 
 Resolve conflicts (if any) 

 5. Clean up working tree 
 git worktree remove ../worktree/feature-name 

 6. Push main branch 
 git push origin main 

```

---

## Common Commands

### Create Worktree

```bash
# Create worktree based on current branch
git worktree add ../worktree/[branch-name] -b [branch-name]

# Create worktree based on main branch
git worktree add ../worktree/[branch-name] main

# Example: Create worktree for feature A
git worktree add ../worktree/feature-auth main -b feature-auth
```

### View Worktrees

```bash
# List all worktrees
git worktree list

# View worktree status
git worktree list --porcelain
```

### Manage Worktrees

```bash
# Switch to a worktree
cd ../worktree/[branch-name]

# Delete worktree (keep branch)
git worktree remove ../worktree/[branch-name]

# Remove the worktree after checking it is clean; this keeps the branch
git worktree remove ../worktree/[branch-name]

# Delete the branch separately only when safe (for example, after merging)
git branch -d [branch-name]

# List worktrees not merged to main branch
git worktree list --porcelain | grep -v "main"
```

---

## Hello Dev Integration

### Auto-Create Worktree

When user starts a new task, auto-create worktree:

```markdown
## Create Subtask Worktree

**Task:** [task name]
**Main branch:** main

**Execute command:**
```bash
cd [project directory]
git worktree add ../worktree/[task-branch] main -b [task-branch]
cd ../worktree/[task-branch]
```

**Worktree created successfully:**
```
Switched to new worktree: ../worktree/[task-branch]
Current branch: [task-branch]
```

**Now start developing...**
```

### Merge After Stage Completion

```markdown
## Merge Subtask

**Current status:**
- Branch: [task-branch]
- Stage: Ship complete
- Tests: Passed
- Review: Passed

**Execute merge:**
```bash
# 1. Switch back to main branch
git checkout main

# 2. Pull latest code
git pull origin main

# 3. Merge subtask branch
git merge [task-branch]

# 4. Resolve conflicts (if any)
# Edit conflicting files
git add [conflicting files]
git commit

# 5. Push main branch
git push origin main

# 6. Clean up worktree
git worktree remove ../worktree/[task-branch]

# 7. Delete local branch
git branch -d [task-branch]
```
```

### Worktree Status Check

```markdown
## Current Worktree Status

```bash
$ git worktree list
/home/user/project 5d8a2c1 [main]
/home/user/worktree/feature-auth a1b2c3d4 [feature-auth]
/home/user/worktree/feature-api d4e5f6a7 [feature-api]
```

**Active worktrees:**
| Directory | Branch | Status |
|------|------|------|
| /home/user/project | main | Current |
| worktree/feature-auth | feature-auth | In development |
| worktree/feature-api | feature-api | In development |
```

---

## Naming Conventions

| Type | Naming Example | Description |
|------|----------|------|
| Feature | feature/user-auth | User authentication feature |
| Fix | fix/login-bug | Login bug fix |
| Refactor | refactor/api-layer | API layer refactoring |
| Optimization | perf/list-query | List query optimization |
| Experiment | exp/new-algorithm | New algorithm experiment |

---

## Best Practices

### 1. One Worktree, One Task

```
Good practice:
worktree/feature-auth/ (User authentication)
worktree/feature-api/ (API development)

Bad practice:
worktree/mixed/ (Doing everything)
```

### 2. Merge Promptly, Clean Promptly

```
Good habit:
- Merge immediately after feature completion
- Clean worktree immediately after merge

Bad habit:
- Creating worktrees and leaving them unused
- Forgetting to clean up expired worktrees
```

### 3. Keep Main Branch Clean

```
Good habit:
- main only contains stable code
- All new features developed in worktrees
- Regularly create new worktrees from main

Bad habit:
- Developing directly on main
- Worktrees diverging too far from main
```

### 4. Frequently Sync main

```bash
# Regularly pull main updates in worktree
git fetch origin main
git rebase origin/main
```

---

## Troubleshooting

### Worktree Conflicts

```bash
# Error: worktree directory already exists
fatal: '../worktree/feature-a' already exists

# Fix: inspect before removing anything
git worktree list --porcelain
git -C ../worktree/feature-a status --short --branch

# If this exact path is a registered worktree and its changes are no longer needed,
# obtain explicit approval, then remove it with Git:
git worktree remove ../worktree/feature-a

# Git normally refuses to remove a dirty worktree. Do not add --force unless the
# exact contents have been reviewed and the user explicitly approved discarding them.
# If the path is not registered as a worktree, inspect and preserve its contents;
# do not use recursive deletion as a cleanup shortcut. Rename only after approval.
```

### Branch Conflicts

```bash
# Error: branch already exists
fatal: 'feature-auth' is already used by worktree '../worktree/feature-auth'

# Fix: Delete old worktree first
git worktree remove ../worktree/feature-auth
```

### Merge Conflicts

```bash
# Workflow during conflicts
git checkout main
git merge feature-auth
# Conflict!
# Edit conflicting files
git add [conflicting files]
git commit -m "Merge: Resolve conflicts"
```

---

## Script Templates

### Quick Create Worktree

```bash
#!/bin/bash
# new-worktree.sh

BRANCH_NAME=$1
if [ -z "$BRANCH_NAME" ]; then
 echo "Usage: ./new-worktree.sh <branch-name>"
 exit 1
fi

WORKTREE_DIR="../worktree/$BRANCH_NAME"

# Check if worktree already exists
if [ -d "$WORKTREE_DIR" ]; then
 echo "Error: Worktree $WORKTREE_DIR already exists"
 git worktree list | grep "$BRANCH_NAME"
 exit 1
fi

# Create worktree
git worktree add "$WORKTREE_DIR" main -b "$BRANCH_NAME"
cd "$WORKTREE_DIR"

echo ""
echo "Worktree created successfully!"
echo "Directory: $WORKTREE_DIR"
echo "Branch: $BRANCH_NAME"
echo ""
echo "Start developing..."
```

### Quick Merge and Clean

```bash
#!/bin/bash
# merge-and-cleanup.sh

BRANCH_NAME=$1
if [ -z "$BRANCH_NAME" ]; then
 echo "Usage: ./merge-and-cleanup.sh <branch-name>"
 exit 1
fi

WORKTREE_DIR="../worktree/$BRANCH_NAME"

# Check if worktree exists
if [ ! -d "$WORKTREE_DIR" ]; then
 echo "Error: Worktree $WORKTREE_DIR does not exist"
 exit 1
fi

# Switch back to main branch
git checkout main
git pull origin main

# Merge branch
echo "Merging $BRANCH_NAME into main..."
git merge "$BRANCH_NAME"

# Push
echo "Pushing to remote..."
git push origin main

# Clean up worktree
echo "Cleaning up worktree..."
git worktree remove "$WORKTREE_DIR"
git branch -d "$BRANCH_NAME"

echo ""
echo "Done! $BRANCH_NAME merged and cleaned up."
```

### List All Worktrees

```bash
#!/bin/bash
# list-worktrees.sh

echo "=== Git Worktree Status ==="
echo ""

git worktree list | while read line; do
 if echo "$line" | grep -q "worktree"; then
 path=$(echo "$line" | awk '{print $1}')
 commit=$(echo "$line" | awk '{print $2}')
 branch=$(echo "$line" | sed 's/.*\[//' | sed 's/\]//')
 echo "$path"
 echo " $branch"
 echo ""
 else
 echo "$line (main repo)"
 echo ""
 fi
done
```

---

## Related Documents

- [dev-mode-guide.md](./dev-mode-guide.md) - Development mode selection
- [ship.md](../stages/ship.md) - Ship stage
