# Hello Dev Usage Guide

## Table of Contents

- [What is Hello Dev](#what-is-hello-dev)
- [Core Value: Deliver What Users Actually Want](#core-value-deliver-what-users-actually-want)
- [Core Features](#core-features)
- [Installation](#installation)
  - [WorkBuddy (Recommended)](#workbuddy-recommended)
  - [Claude Code](#claude-code)
  - [OpenAI Codex](#openai-codex)
- [Quick Start](#quick-start)
- [Detailed Workflow](#detailed-workflow)
- [Configuration](#configuration)
- [FAQ](#faq)

---

## What is Hello Dev

Hello Dev is an **AI agent governance layer** that makes AI-assisted development traceable, auditable, and learnable.

**Problems Solved**:

| Problem | Solution |
|---------|----------|
| AI builds the wrong thing because requirements were misunderstood | Structured requirement interrogation (grill-me) + decision tree traversal + prototype validation before implementation + mandatory user checkpoints |
| AI agents "forget" everything when session ends | Five-layer memory + state persistence |
| AI agents "overstep" (treating "fix bug" as "deploy to prod") | Dual-gate approval (git + ops commands) |
| Multiple agents overwrite each other's files | Wave scheduling + file conflict detection |
| "Tests pass" ≠ "change is correct" | Risk-driven four-layer verification |
| Experience cannot accumulate across sessions | Evidence chain + memory recall |

**Core Value**: Transform AI agents from "art based on experience" to "engineering with evidence".

---

## Core Value: Deliver What Users Actually Want

Unlike other AI dev tools that focus on "writing code faster", Hello Dev focuses on **building the right thing**. Through structured requirement interrogation, prototype-first validation, and mandatory user checkpoints at every critical stage, it ensures the final deliverable matches the user's real needs -- not what the AI guessed.

| Traditional AI Dev Tools | Hello Dev |
|-------------------------|-----------|
| Focus on coding speed | Focus on delivery correctness |
| Assume requirements are clear | Assume requirements need validation |
| Verify after development | Validate before development |
| "I built it fast" | "I built the right thing" |

### How It Works

**1. Structured Requirement Interrogation (grill-me)**

Not "tell me what you want" but a guided decision tree:
- Each question has a recommended answer (users confirm or modify, lowering expression cost)
- Questions adapt based on previous answers (not a static 30-point questionnaire)
- Every decision is recorded, forming a complete decision chain

This means the final requirement spec is not "what the developer understood" but "what the user confirmed".

**2. Prototype Before Implementation**

In Hello Dev's 15-stage workflow, the **Prototype stage comes before Implementation**. This means:
- Users see an interactive prototype before any code is written
- "This isn't what I wanted" is discovered early, not after hundreds of lines of code
- Modification cost is minimal at the design stage, catastrophic at the development stage

**3. Mandatory User Checkpoints**

Users are not "submit requirements and wait for results". They are explicitly invited at critical nodes:

| Stage | User Participation |
|-------|-------------------|
| Requirement | Confirm requirement specification |
| Feature Design | Confirm functional design |
| Architecture | Confirm architecture plan |
| Prototype | Validate prototype interaction |
| Review | Final confirmation |

These participation points are not "optional" -- they are **enforced by the workflow**. Skipping them blocks the process.

---

## Core Features

### 1. 15-Stage State Machine

```
Bootstrap → Initialization → Requirement → [Design Stages] → Implementation
    ↓
Testing (4-layer) → Review → Ship → Learn → Evolution → Reflection → Archive
```

Each stage has clear entry conditions, exit conditions, and deliverables. Stages cannot be skipped.

### 2. Dual-Gate Approval

**Git Gate**: Classifies git command risk levels
- Safe: `git status`, `git log`, `git diff` → silent pass
- Medium: `git commit`, `git merge` → requires confirmation
- High: `git push --force`, `git reset --hard` → requires confirmation + rollback warning

**Ops Gate**: Classifies ops command risk levels
- Pass: `kubectl get pods`, `systemctl status nginx` → known safe read-only
- Ask: `kubectl delete pod`, `systemctl restart nginx` → state change, needs approval
- Deny: `kubectl frobnicate x` → unclassifiable command, rejected

### 3. Wave Scheduling

After task decomposition, Hello Dev auto-calculates dependencies and executes in waves:

```
Wave 1: [t1]           ← no dependencies
Wave 2: [t2, t3]       ← depends on t1, no file conflicts → parallel
Wave 3: [t4]           ← depends on t2 + t3
```

**Auto conflict detection**: If t2 and t3 declare overlapping `affectedFiles`, Wave 2 auto-downgrades to sequential execution.

### 4. Five-Layer Memory

```
L0: Session working memory (temporary)
L1: Project-level memory (persistent)
L2: Cross-project memory (global)
L3: Pattern memory (experience summary)
L4: Meta-memory (memory of memory)
```

Each memory has evidence chain: `improved` / `regressed` / `no_effect` / `unknown`.

### 5. Four-Layer Verification

```
1. Build verification: Does the code compile?
2. Regression verification: Do existing tests still pass?
3. Behavior verification: Does the new feature meet expectations?
4. Boundary verification: Are edge cases handled?
```

### 6. Requirement Interrogation (grill-me)

Structured decision tree traversal, turning requirement confirmation from "guessing" to "explicit decisions":

- Each question has a recommended answer
- Each branch has trade-off explanations
- One question at a time (not a 30-point questionnaire)
- Produces a complete decision tree

### 7. UI/UX Design Specs (ui-ux-pro-max)

Evidence-based design decisions:

- **Design Tokens**: Colors, fonts, spacing standardized as reusable variables
- **Component Specs**: Each UI component has clear specifications
- **Layout Blueprint**: Page layout defined before development
- **Implementation Notes**: Design decisions have clear technical implementation guidance

---

## Installation

### WorkBuddy (Recommended)

**WorkBuddy is the primary platform for Hello Dev**, providing complete skill management and host integration.

#### Install via AI Assistant (Recommended)

In WorkBuddy, open a new session and enter:

```
Please install the hello-dev skill
```

The AI assistant will automatically:
1. Search for the hello-dev skill
2. Download and install to the correct directory
3. Verify installation success
4. Guide you to start using

#### Verify Installation

After installation, enter in WorkBuddy:

```
Hello, please load the hello-dev skill
```

If you see the Hello Dev execution contract description, installation succeeded.

### Claude Code

#### Install via AI Assistant

In Claude Code, enter:

```
Please install the hello-dev skill to ~/.claude/skills/hello-dev
```

The AI assistant will auto-complete installation and configuration.

#### Manual Install (Advanced Users)

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/hello-dev.git
   ```

2. Copy to Claude Code skills directory:
   ```bash
   # macOS/Linux
   cp -r hello-dev ~/.claude/skills/hello-dev
   
   # Windows
   cp -r hello-dev %USERPROFILE%\.claude\skills\hello-dev
   ```

3. Add skill reference in `CLAUDE.md`:
   ```markdown
   ## Skills
   - hello-dev: Development enhancement framework
   ```

### OpenAI Codex

#### Install via AI Assistant

In Codex, enter:

```
Please install the hello-dev skill
```

The AI assistant will auto-complete installation and configuration.

#### Manual Install (Advanced Users)

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/hello-dev.git
   ```

2. Copy to Codex skills directory:
   ```bash
   cp -r hello-dev ~/.codex/skills/hello-dev
   ```

3. Create `CODEX.md` in your project, add:
   ```markdown
   ## Skills
   - ./hello-dev/SKILL.md: Development enhancement framework
   ```

---

## Platform Adaptation Details

### WorkBuddy Adaptation (Primary Platform)

**WorkBuddy is the best platform for Hello Dev**, providing complete out-of-the-box experience.

#### Fully Supported Features

| Feature | WorkBuddy Support | Description |
|---------|------------------|-------------|
| State machine | Full support | Sync stage status via `TaskCreate/Update` |
| Dual gates | Full support | PreToolUse hooks auto-registered |
| Wave scheduling | Full support | Dispatch sub-agents via `Agent` tool |
| Five-layer memory | Full support | `.hello-dev/memory.json` persistence |
| Four-layer verification | Full support | Verification stage auto-executed |
| grill-me | Full support | Requirement interrogation skill bundled |
| ui-ux-pro-max | Full support | UI/UX design spec skill bundled |
| Multi-agent collaboration | Full support | Via WorkBuddy sub-agent system |

#### WorkBuddy Exclusive Features

**1. AI Assistant Installation**

No manual operation needed, AI assistant auto-completes skill installation and configuration.

**2. Host Tool Integration**

WorkBuddy provides exclusive host tools that make Hello Dev more powerful:

- `search_and_install_skills`: Search and install skills
- `TaskCreate/TaskUpdate`: Task management, sync with Hello Dev stage status
- `Agent`: Sub-agent dispatch, supports wave scheduling

**3. Connector Ecosystem**

WorkBuddy's connector marketplace provides rich third-party integrations:

- **Tencent Docs**: Auto-sync design docs and requirement docs
- **WeChat Pay**: Compliance approval for payment-related operations
- **ima (Knowledge Manager)**: Knowledge base integration, cross-project experience recall

**4. Expert Packages**

WorkBuddy's expert center provides pre-configured expert teams:

- `hello-dev`: Complete delivery team (15 expert roles)
- Each expert has clear responsibilities and collaboration rules

### Claude Code Adaptation

#### Supported Features

| Feature | Claude Code Support | Description |
|---------|--------------------| ------------|
| State machine | Full support | Manage stages via `Task` tool |
| Dual gates | Needs manual config | Need to manually register PreToolUse hooks |
| Wave scheduling | Full support | Dispatch sub-agents via `Task` tool |
| Five-layer memory | Full support | `.hello-dev/memory.json` persistence |
| Four-layer verification | Full support | Verification stage auto-executed |
| grill-me | Full support | Requirement interrogation skill bundled |
| ui-ux-pro-max | Full support | UI/UX design spec skill bundled |

#### Claude Code Exclusive Features

**1. Project-Level Installation**

Can place `hello-dev` in project root directory for project-level governance.

**2. CLAUDE.md Integration**

Reference skills via `CLAUDE.md`, auto-load execution contract.

### OpenAI Codex Adaptation

#### Supported Features

| Feature | Codex Support | Description |
|---------|--------------|-------------|
| State machine | Full support | Manage via state files |
| Dual gates | Needs manual config | Need to manually register hooks |
| Wave scheduling | Limited support | Dispatch via `create_thread` |
| Five-layer memory | Full support | `.hello-dev/memory.json` persistence |
| Four-layer verification | Full support | Verification stage auto-executed |
| grill-me | Full support | Requirement interrogation skill bundled |
| ui-ux-pro-max | Full support | UI/UX design spec skill bundled |

#### Codex Exclusive Features

**1. Thread Dispatch**

Multi-agent collaboration via `create_thread` / `wait_threads`.

**2. CODEX.md Integration**

Reference skills via `CODEX.md`, auto-load execution contract.

**3. Prompt Construction**

`codex-prompt.js` script auto-constructs Codex-format prompts.

### Platform Comparison

| Feature | WorkBuddy | Claude Code | Codex |
|---------|-----------|-------------|-------|
| Installation | AI assistant auto-install | AI assistant or manual | AI assistant or manual |
| Skill management | GUI + marketplace | Manual management | Manual management |
| Sub-agent dispatch | `Agent` tool | `Task` tool | `create_thread` |
| State persistence | Complete | Complete | Complete |
| Gate registration | Auto-register | Needs manual config | Needs manual config |
| Connector ecosystem | Rich | Limited | Limited |
| Expert packages | Pre-configured | Needs manual config | Needs manual config |

**Conclusion**: WorkBuddy provides the most complete out-of-the-box experience, recommended. Claude Code and Codex can also be used but require more manual configuration.

---

## Quick Start

### Scenario 1: Fix a Bug

```bash
# 1. Open new session in WorkBuddy
# 2. Enter:
Please help me fix a bug: users occasionally get "session expired" error when logging in.

# 3. Hello Dev will automatically:
# - Bootstrap: Load skill, detect environment
# - Initialization: Scope survey, determine execution path
# - Requirement: Confirm bug reproduction steps
# - Implementation: Locate and fix code
# - Testing: Four-layer verification
# - Review: Review changes
# - Ship: Commit and record experience
```

### Scenario 2: Develop a New Feature

```bash
# 1. Open new session in WorkBuddy
# 2. Enter:
Please help me develop a user feedback feature. Users can submit feedback, admins can view and reply.

# 3. Hello Dev will automatically:
# - Bootstrap + Initialization
# - Requirement: Requirement interrogation (grill-me)
# - Tool Research: Research technical solutions
# - Feature Design: Functional design
# - Architecture: Architecture design
# - Prototype: Produce runnable prototype
# - Implementation: Implement in waves
# - Testing + Review + Ship
# - Learn + Evolution + Reflection + Archive
```

### Scenario 3: Refactor a Module

```bash
# 1. Open new session in WorkBuddy
# 2. Enter:
Please help me refactor the authentication module. Current code has high coupling, need to split into independent services.

# 3. Hello Dev will automatically:
# - Evaluate refactoring scope and risks
# - Decompose into multiple subtasks
# - Execute in waves (first split interfaces, then migrate implementation, finally delete old code)
# - Each step has verification and rollback plan
```

---

## Detailed Workflow

### Stage Details

#### 1. Bootstrap

**Responsibility**: Load skill, detect environment, determine execution path.

**Deliverables**:
- Skill load confirmation
- Environment detection report
- Execution path selection (tiny/fast/implementation/full)

**User Action**: None (auto-executed)

#### 2. Initialization

**Responsibility**: Scope survey, coarse-grained task decomposition.

**Deliverables**:
- Scope survey report
- Coarse-grained task decomposition
- Risk assessment

**User Action**: Confirm scope is reasonable

#### 3. Requirement

**Responsibility**: Requirement confirmation, produce requirement contract.

**Deliverables**:
- Requirement contract (user confirmation or explicit authorization)
- Requirement interrogation decision tree (grill-me)

**User Action**: Answer requirement interrogation questions, confirm requirement contract

#### 4. Tool Research — full path only

**Responsibility**: Research technical solutions, evaluate technical risks.

**Deliverables**:
- Technical solution comparison
- Technical risk assessment

**User Action**: Select technical solution

#### 5. Feature Design — full path only

**Responsibility**: Functional design, produce feature specs.

**Deliverables**:
- Feature spec document
- Module decomposition

**User Action**: Confirm feature specs

#### 6. Architecture — full path only

**Responsibility**: Architecture design, produce architecture specs.

**Deliverables**:
- Architecture spec document
- Interface definitions
- Dependency graph

**User Action**: Confirm architecture design

#### 7. Prototype — full path only

**Responsibility**: Produce runnable prototype, verify interaction flow.

**Deliverables**:
- Runnable HTML prototype
- Interaction flow verification report

**User Action**: Operate prototype, confirm interaction flow

#### 8. Implementation

**Responsibility**: Implement code in waves.

**Deliverables**:
- Code changes
- Verification report for each subtask

**User Action**: Review code changes (optional)

#### 9. Testing

**Responsibility**: Four-layer verification.

**Deliverables**:
- Build verification report
- Regression verification report
- Behavior verification report
- Boundary verification report

**User Action**: Confirm tests pass

#### 10. Review

**Responsibility**: Independent review, ensure change quality.

**Deliverables**:
- Review report
- Risk assessment

**User Action**: Confirm review passes

#### 11. Ship

**Responsibility**: Commit changes, record experience.

**Deliverables**:
- Git commit
- Experience record

**User Action**: Confirm commit

#### 12. Learn

**Responsibility**: Summarize experience, update memory.

**Deliverables**:
- Experience summary
- Memory update

**User Action**: None (auto-executed)

#### 13. Evolution

**Responsibility**: Evaluate technical debt, plan subsequent improvements.

**Deliverables**:
- Technical debt list
- Improvement plan

**User Action**: Confirm improvement plan (optional)

#### 14. Reflection

**Responsibility**: Reflect on development process, extract lessons.

**Deliverables**:
- Reflection report
- Process improvement suggestions

**User Action**: None (auto-executed)

#### 15. Archive

**Responsibility**: Archive state, clean temporary files.

**Deliverables**:
- State archive
- Temporary file cleanup

**User Action**: None (auto-executed)

---

## Configuration

### Environment Variables

Hello Dev supports the following environment variables:

```bash
# Gate control
HELLODEV_OPSGATE=on|off              # Ops gate switch (default on)
HELLODEV_OPSGATE_MODE=deny|allow     # Unclassified command handling (default deny)
HELLODEV_OPSGATE_SKIP_DIRS=dir1,dir2 # Directories to skip gates

# Debugging
HELLODEV_OPSGATE_DEBUG=1             # Enable debug logs
HELLODEV_OPSGATE_TRACE=1             # Enable gate tracing
```

### State Files

Hello Dev state is stored in `.hello-dev/state.json`:

```json
{
  "schema": "1",
  "task": {
    "id": "dl-xxxx",
    "name": "Task name",
    "type": "implementation",
    "path": "fast"
  },
  "stage": {
    "current": "implementation",
    "status": "in_progress",
    "history": []
  },
  "modules": {},
  "ops": {
    "steps": {},
    "approvals": []
  },
  "memory": []
}
```

### Memory Files

Memory is stored in `.hello-dev/memory.json`:

```json
[
  {
    "layer": "L2",
    "content": "Experience content",
    "source": "evidence",
    "outcome": "improved"
  }
]
```

---

## FAQ

### Q1: Will Hello Dev slow down my development?

**A**: Short-term it might, because it adds stage confirmation and verification steps. But long-term, it significantly reduces rework and debugging time. According to actual usage data, Hello Dev can reduce rework rate by over 60%.

### Q2: Can I use Hello Dev on small projects?

**A**: Yes. Hello Dev provides `tiny` and `fast` two lightweight paths, suitable for small projects. The `tiny` path runs the same 11 stages as `fast`, merged into four phases executed by the lead agent alone with no sub-agents spawned, and suits single-file modifications.

### Q3: Which programming languages does Hello Dev support?

**A**: Hello Dev is language-agnostic. It focuses on development process and governance, not specific programming languages. You can use it to manage Python, JavaScript, Go, Rust, and any other language projects.

### Q4: Can I use only part of Hello Dev's features?

**A**: Yes. You can control which features are enabled via environment variables and configuration. For example, if you don't need ops gates, you can set `HELLODEV_OPSGATE=off`.

### Q5: Where is Hello Dev's data stored?

**A**: All data is stored in the project-local `.hello-dev/` directory. Nothing is uploaded to the cloud, completely under your control.

### Q6: Which is more suitable for Hello Dev, WorkBuddy or Claude Code?

**A**: WorkBuddy provides a more complete out-of-the-box experience (GUI, skill marketplace, connector ecosystem), recommended for priority use. Claude Code can also be used but requires more manual configuration.

### Q7: How does Hello Dev handle sensitive information?

**A**: All of Hello Dev's data is stored locally, nothing is uploaded. But it's recommended not to record passwords, API Keys, and other sensitive information in state files or memory files.

### Q8: Can I customize Hello Dev's stages?

**A**: Yes, but you need to modify `scripts/lib/stages.js` and related stage documents. Not recommended to modify casually, because there are dependencies between stages.

---

## Resource Links

- **GitHub Repository**: https://github.com/your-org/hello-dev
- **Issue Feedback**: https://github.com/your-org/hello-dev/issues
- **Discussion Forum**: https://github.com/your-org/hello-dev/discussions

---

## License

MIT License (c) 2026 Hello Dev Contributors
