---
name: hello-dev
description: >
  开发增强框架,提供阶段执行、任务分解、并行多Agent调度(含文件冲突检测)、
  五层记忆与证据链闭环、双门禁审批(Git + 运维命令)和漂移检测。
  适用于变更审批、并行子Agent协调、经验沉淀、测试验证、状态恢复、重构、迁移或部署治理场景。
agent_created: true
metadata:
  version: "15.11"
  updated: "2026-10-07"
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: 'node "${HELLODEV_SKILL_DIR:?Set HELLODEV_SKILL_DIR to the hello-dev skill directory}/scripts/hook-resolver.js" git-gate'
          timeout: 10
        - type: command
          command: 'node "${HELLODEV_SKILL_DIR:?Set HELLODEV_SKILL_DIR to the hello-dev skill directory}/scripts/hook-resolver.js" opsgate'
          timeout: 10
---

# Hello Dev

[English](SKILL.md) | **中文**

将已确认的需求转化为可验证的交付物;不要认为规则越多、阶段越多就质量越高。

## 概述

Hello Dev 是一个开发增强系统,围绕 AI 辅助开发反复遇到的六个问题构建:

1. **并行执行互相冲突**:多个子 Agent 修改同一文件时静默覆盖彼此。Hello Dev 通过依赖图驱动的波次调度和自动文件冲突检测解决——同一波次内 affectedFiles 重叠时强制串行执行。
2. **经验随会话消失**:过去任务的教训只存在于会被丢弃的对话上下文中。Hello Dev 提供五层记忆系统(L0-L4),写入门禁拒绝推测语气,加上证据链跟踪每条记录的经验是否真正有效(improved/regressed/no_effect/unknown)。
3. **审批边界模糊**:任务确认被当作全面授权,导致意外的提交或部署。Hello Dev 对 Git 写操作、运维命令(kubectl、systemctl、terraform)和部署强制单独确认——双 PreToolUse hook 在执行前分类风险。
4. **测试通过但没有真正验证**:跑测试套件不等于证明变更正确。Hello Dev 使用风险优先的四层验证:先识别本次变更可能破坏什么,再用构建/回归/行为/边界证据逐项证明。
5. **会话重启丢失状态**:对话历史是唯一记录,不可靠。Hello Dev 将所有审批、重试、检查点和分解状态持久化到 `.hello-dev/state.json`,通过 `resume` 恢复。
6. **平台绑定**:同一工作流必须能在不同 AI 宿主上运行。Hello Dev 通过 Host Adapter 层将调度与派发解耦,核心状态机与宿主无关,各平台提供自己的子 Agent 调用机制。

它提供单一结构化执行路径(完整 15 阶段链),包含强制的测试(Testing)和评审(Review)阶段,交互式架构决策引导,以及评估经验候选项但不自动激活的进化系统。设计阶段仅可经记录在案的用户批准跳过(`state.js skip`),绝不由静默路由削减。

## 何时使用

- 需要变更审批和测试验证的任务
- 涉及 Git 操作或运维命令(kubectl、systemctl、terraform)的开发工作
- 需要文档-代码-测试同步的项目
- 需要状态隔离和文件冲突检测的多 Agent 协作
- 有审计追踪需求的重构、迁移或部署
- 任何需要漂移检测的开发治理场景
- Codex 子 Agent 并行调度(通过 `create_thread` / `wait_threads` 工具链)

## 快速开始

1. **用自然语言描述任务**(如"修一个 bug"、"先给个方案"、"重构认证模块")。
2. **确认范围**:Agent 与你确认问题、边界和成功标准。所有任务都从全链开始。
3. **分解子任务**(单原子变更除外):每个子任务声明受影响的文件,用于冲突检测。
4. **按阶段执行**:Bootstrap -> Initialization -> Requirement -> Tool Research -> Feature Design -> Architecture -> Prototype -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive。设计阶段非必要时,agent 在阶段边界提议跳过;经你同意后才用 `state.js skip` 记录。
5. **验证并交付**:每个阶段产出必需产物;测试和评审门禁不可跳过。

## 执行契约

1. **先确认边界**:只读检查可直接执行;修改前,确认问题、范围、成功标准和排除项。不要重复询问已确认的内容。
2. **先理解关键因果**:存在知识缺口时,解释机制和权衡;每次只问一个关键问题;不要在每一步都强制教学。
3. **明确例外**:如果用户说"直接做/你决定/别问"或提供了完全无风险的交接,可以跳过提问但不能跳过阶段、日志、测试或评审。记录实际的授权依据。
4. **精确记账**:只记录实际完成的操作、审批和证据;不要将超时、无回复、注释或工具不可用视为审批。
5. **最小授权**:任务确认不等于授权提交、推送、部署、删除文件或同步安装副本。Git 变更根据风险协议单独确认。
6. **最小变更**:保持项目约定,优先可逆修改;不要删除历史、重构无关模块或扩展依赖。
7. **可停止**:用户终止时立即停止;诚实报告失败或能力限制,不要无限重试或伪造成功。

## 启动与按需加载

首先读取目标项目的 AGENTS.md 和现有相关文档。使用 skill 路径查找脚本;cwd 是目标项目;不要将状态写入安装目录。

| 当前需求 | 读取 |
|----------|------|
| 首次执行、主机差异、安装同步 | [runtime-adapters.md](references/runtime-adapters.md) |
| 用户用自然语言表达任务 | [intent-resolver.md](modules/core/task/intent-resolver.md) 映射到路径 |
| 变更协议前评估成本/回放经验 | [cost-metrics.md](references/cost-metrics.md)、[scenario-replay.md](references/scenario-replay.md) |
| 判断只读/设计/实现、路径 | [classifier.md](modules/core/task/classifier.md) |
| 状态已存在,或需要持久化变更 | [state-protocol.md](modules/core/state-protocol.md);先恢复,再决定是还原还是创建 |
| 将修改代码、脚本、配置或文档 | [日志规则](docs/progress_coding/_RULES.md) |
| 涉及 Git 操作 | [git-gate.md](modules/core/approval/git-gate.md) |
| 涉及运维命令(kubectl/systemctl/terraform 等) | [ops-execution.md](modules/core/approval/ops-execution.md) |
| 需要设计模块审批 | [design-flow.md](modules/core/approval/design-flow.md) |
| 需要查找其他材料 | [modules/index.md](modules/index.md),仅加载相关条目 |
| 需求确认后分解子任务(必须) | [decomposition.md](modules/core/task/decomposition.md) 分解、顺序表和调度模式 |
| 前端/UI 设计决策(prototype 阶段) | `ui-ux-pro-max` 捆绑技能(结构化 UI 方案) + `grill-me` 纪律(一次一问) |
| 跳过某个设计阶段(同意制) | 阶段边界先提议;经同意后 `state.js skip <stage> --reason "<用户批准原话>"` |

不要预读所有阶段、历史设计或模板。直接回答只读咨询;不要"为了使用流程"而写入状态。

## 从自然语言开始

无需先学习框架术语。用你的语言描述任务即可;[意图映射](modules/core/task/intent-resolver.md)会将其转换为路径:

| 你说 | 实际发生 |
|------|----------|
| 先给个方案,别改代码 | 走完设计阶段,在实现前停止 |
| 方案已确认,直接实现 | 全链;设计阶段仅经批准的 `state.js skip` 跳过 |
| 修一个小 bug | 全链;非必要时 agent 提议跳过设计阶段 |
| 琐碎单行改动 | 全链;同样的同意制跳过 |
| 帮我调研/原理是什么 | 只读,不初始化状态 |
| 继续上次的任务 | resume |
| 停止这个任务 | 立即停止 |

分类只决定计划,不决定授权:部署、Git 写操作、安装同步和删除仍需单独确认。
底层的 `scripts/state.js` 保留为恢复和审计接口,状态异常时可直接使用。

## 执行路径

只有一条执行路径——全链。设计阶段的缩减只经记录在案的用户批准跳过实现。

- **全链**:Bootstrap -> Initialization -> Requirement -> Tool Research -> Feature Design -> Architecture -> Prototype -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive。
- **同意制跳过**:在每个设计阶段边界,若该阶段非必要,agent 给出推荐意见并提议跳过;用户同意后记录 `node scripts/state.js skip <stage> --reason "<用户批准原话>"`。授权门(bootstrap/initialization/requirement)、证据门(testing/review)、ship 与四个后置反思阶段永不可跳。
- 小变更同样走全链:是否提议跳过必须依据 scope survey 输出而非行数——受影响文件清单、逻辑变更单元数、是否跨业务模块。预估 <50 行、无新依赖、无架构变更只是 scope survey 的下界证据,不是覆盖风险判断的独立阈值。
- 纯设计或文档任务:实现阶段整理已批准的文档;测试验证一致性和示例,不生成用户未请求的代码。

**Scope survey(任何跳过提议的前置条件)**:提议跳过前,先产出四项——受影响文件清单、逻辑变更单元数、是否跨业务模块、是否存在未决设计点。scope survey 未完成不得提议跳过。

| 阶段 | 必需输出 | 按需详情 |
|------|----------|----------|
| Bootstrap | 当前状态、范围、相关文档、执行路径 | [bootstrap](modules/stages/bootstrap.md) |
| Requirement | 用户确认或明确执行授权的依据 | [requirement](modules/stages/requirement.md) |
| Feature Design / Architecture | 本轮模块已提交 -> 已批准,有实际证据 | [architecture](modules/stages/architecture.md) |
| Implementation | 范围变更和即时追加日志 | [implementation](modules/stages/implementation.md) |
| Testing | 适用的四层验证证据和 `test` 通过 | [testing](modules/stages/testing.md) |
| Review | 需求/实现/文档一致性评审和 `review` 通过 | [review](modules/stages/review.md) |
| Ship | 结果、测试、文档、限制;未经批准不发布 | [ship](modules/stages/ship.md) |

完成当前阶段后显式进入下一阶段;禁止隐式完成、跳过门禁或在返工后用旧测试证明正确性。失败通过 rolled_back 处理,保留历史。命令和完成条件遵循状态协议。

## 任务分解与子 Agent 调度

需求确认后分解是**必须的**(除非任务是单个原子变更:一个文件、<50 行、无依赖)。每个子任务声明 `affectedFiles` 用于文件冲突检测。

```bash
# 带 affectedFiles 分解
node scripts/state.js decompose --tasks '[
  {"id":"t1","name":"数据模型","depends":[],"affectedFiles":["src/models/user.js"]},
  {"id":"t2","name":"API","depends":["t1"],"affectedFiles":["src/api/user.js"]}
]'

# 设置调度模式
node scripts/state.js dispatch-mode parallel   # 并行波次使用子 agent
node scripts/state.js dispatch-mode serial     # 默认:主 agent 执行全部
```

**调度模式**:`serial`(默认,主 agent 完成所有)或 `parallel`(显式选择,并行波次委托给子 agent)。选择 `parallel` 后,分析标记为并行的波次**必须**派发给子 agent 并记录。子 agent 受限:不写状态、不做 Git 操作、不与用户交互。主 agent 验证所有子 agent 输出。同一波次内的文件冲突强制顺序执行。完整约束见 [decomposition.md](modules/core/task/decomposition.md)。


### Codex 子 Agent 调度

在 Codex 上运行时,并行波次通过 `create_thread` / `wait_threads` 调度。使用 `codex-prompt.js` 从分解结果生成 prompt:

```bash
# 生成整个波次的 prompt
node scripts/codex-prompt.js wave --wave 1 --project "my-app" --project-path /abs/path
# => JSON: { wave, mode, tasks: [{subtaskId, title, prompt, affectedFiles}] }

# 生成单个子任务的 prompt
node scripts/codex-prompt.js generate --subtask t1

# 并行任务:用 --task <id> 读取 .hello-dev/state.sibling-<id>.json,而非 state.json
node scripts/codex-prompt.js wave --wave 1 --task <id> --project "my-app" --project-path /abs/path
```

`--task <id>` 可放在命令名之前或之后;兄弟任务状态不存在时直接报错,不会静默回退到 `state.json`。

每个 prompt 符合 [Codex 主机适配器](modules/hosts/codex.md) 规范:范围、文件边界、验收标准、约束块。Agent 使用生成的 prompt 和 title 调用 `mcp__codex_app__create_thread`,然后调用 `mcp__codex_app__wait_threads` 收集结果。
## 记忆

- **状态和开发日志**:执行状态、审批、重试写入 `.hello-dev/state.json`(并行任务使用 `--task <id>` 写入 `.hello-dev/state.sibling-<id>.json`);开发过程写入 `docs/progress_coding/`。
- **记忆存储**:唯一存储是目标项目的 `.hello-dev/memory.json`,由 `scripts/memory.js` 读写;全局指令文件中的 L0-L4 五层是其**分层标签**,不是第二套系统(Claude Code 写入 `~/.claude/CLAUDE.md`,WorkBuddy 写入 `~/.workbuddy/user-*/MEMORY.md`,`scripts/patch-claude-md.js --host=<claude|workbuddy>` 根据主机自动选择)。
- **写入门禁**:**候选 -> 验证 -> 合并/拒绝 -> 写入**。只接受已确认的事实;拒绝推测、临时方案和日志。优先合并而非创建新条目。`memory.js` 是唯一的读写者。
- **语言与能力边界**:写入门禁按用户既有决策，仅使用**英文**谓词、推测、临时方案与日志词表。中文及其他语言不会经过这些词表的语义筛查；结构和 source 校验不验证事实真实性。门禁是**纪律的第一道栅栏,不是安全边界**。非英文内容和证据真实性需人工核实，不自动翻译，也不擅自恢复双语词表。
- **详细规则**:写入门禁详情、已知误报、CLI 快速参考和可移植包清单见 [references/memory-guide.md](references/memory-guide.md)。

```bash
node scripts/memory.js recall --layer L2 --limit 5   # Bootstrap 检索
node scripts/memory.js add --layer L2 --content "..." --source <实际证据>   # Ship 写入
```

## 权威来源与冲突

| 主题 | 权威来源 |
|------|----------|
| 范围和授权 | 用户的明确请求、目标项目约定;有冲突时解释并确认 |
| 执行契约和路由 | 本文件;阶段文件提供详情但不覆盖本契约 |
| 全局强制规则 | 主机全局指令(Claude Code: `~/.claude/CLAUDE.md`;WorkBuddy: `~/.workbuddy/user-*/MEMORY.md`);与 SKILL.md 执行契约第 3 条对齐 |
| 状态语义 | [state-protocol.md](modules/core/state-protocol.md) 和 scripts/state.js;如有漂移必须同步更新 |
| Git 风险 | [git-gate.md](modules/core/approval/git-gate.md);实际能力受主机边界约束 |
| 运维命令风险和执行审批 | [ops-execution.md](modules/core/approval/ops-execution.md);风险表必须匹配 hooks/opsgate.js |
| 变更日志 | [日志规则](docs/progress_coding/_RULES.md) |

`agents/`、已归档的 `automation/` 和 `core/memory/` 历史设计不是当前执行基础。Learn、Evolution、Reflection、Archive 在全部执行路径上均为强制阶段（包括 `other` 与任何带设计阶段跳过的路径），不是可选阶段；其完成检查点不可跳过，也不因交付而免除。详见 [modules/index.md](modules/index.md)。

## 验证本 Skill

修改后运行 `bash scripts/self-check.sh`:语法、链接、索引、风险分类和状态行为测试。它验证有限的不变量,但不能证明平台 hooks 已注册或所有安全场景已覆盖。

版本优化依据见 `OPTIMIZATION-REPORT.md`（已归档，不在本发行版中）。安装副本同步需单独确认;默认仅 dry-run。

宿主集成有条件：注册前用 `scripts/register-hooks.js` 明确宿主、settings 与 skill 路径。默认只读，写入需 `--apply` 和单独授权；WorkBuddy Desktop 默认使用 `~/.workbuddy/settings.json`。CodeBuddy CLI 的默认注入式 Skill **不会**注册 frontmatter hooks；fork 上下文还需要明确的宿主信任。本入口不自动切换 fork，也不开启信任。两个入口的 frontmatter 都通过 `HELLODEV_SKILL_DIR` 调用 `scripts/hook-resolver.js`，命令中不含任何宿主 home 路径，仍只是声明而非加载证明；真实注册以所选路径的明确命令为准。配置检查、直接探针和带 caller 的版本记录不证明宿主实际消费 ask/deny。详见 [运行边界](references/runtime-adapters.md)。
