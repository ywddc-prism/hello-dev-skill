# Hello Dev 使用指南

## 目录

- [什么是 Hello Dev](#什么是-hello-dev)
- [核心功能](#核心功能)
- [安装指南](#安装指南)
  - [WorkBuddy（推荐）](#workbuddy推荐)
  - [Claude Code](#claude-code)
  - [OpenAI Codex](#openai-codex)
- [快速开始](#快速开始)
- [详细使用流程](#详细使用流程)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

---

## 什么是 Hello Dev

Hello Dev 是一个 **AI 代理治理层**，让 AI 辅助开发变得可追溯、可审计、可学习。

**解决的问题**：

| 问题 | Hello Dev 的解决方案 |
|------|---------------------|
| AI 构建了错误的东西，因为需求被误解 | 结构化需求拷问（grill-me）+ 决策树遍历 + 实现前的原型验证 + 强制用户检查点 |
| AI 代理"失忆"（会话结束就忘记之前做了什么） | 五层记忆系统 + 状态持久化 |
| AI 代理"越权"（把"修 bug"理解为"部署上线"） | 双闸门审批（git + ops 命令） |
| 多代理并行时文件互相覆盖 | 波次调度 + 文件冲突检测 |
| "测试通过"不等于"变更正确" | 风险驱动的四层验证 |
| 经验无法跨会话积累 | 证据链 + 记忆召回 |

**核心价值**：让 AI 代理从"凭经验的艺术"变成"有证据的工程"。

---

## 核心价值：交付用户真正想要的

不同于其他 AI 开发工具关注"更快地写代码"，Hello Dev 关注**构建正确的东西**。通过结构化的需求拷问、原型优先验证、以及每个关键阶段的强制用户检查点，确保最终交付物匹配用户的真实需求 -- 而不是 AI 猜测的结果。

| 传统 AI 开发工具 | Hello Dev |
|-----------------|-----------|
| 关注编码速度 | 关注交付正确性 |
| 假设需求是清楚的 | 假设需求需要验证 |
| 开发完了再验证 | 开发之前就验证 |
| "我写得很快" | "我构建了正确的东西" |

### 工作机制

**1. 结构化需求拷问（grill-me）**

不是"告诉我你想要什么"，而是引导式的决策树遍历：
- 每个问题都有推荐答案（用户只需确认或修改，降低了表达成本）
- 问题根据之前的回答动态调整（不是静态的 30 点问卷）
- 每个决策都被记录，形成完整的决策链路

这意味着最终的需求规格不是"开发者理解的"，而是"用户确认的"。

**2. 原型验证前置**

在 Hello Dev 的 15 阶段流程中，**Prototype 阶段在 Implementation 之前**。这意味着：
- 用户可以在写代码之前看到可交互的原型
- 提前发现"这不是我想要的"
- 在设计阶段修改成本极低，在开发阶段修改成本极高

**3. 强制用户检查点**

用户不是"提完需求就等结果"，而是在关键节点被明确邀请参与：

| 阶段 | 用户参与点 |
|------|-----------|
| Requirement | 确认需求规格 |
| Feature Design | 确认功能设计 |
| Architecture | 确认架构方案 |
| Prototype | 验证原型交互 |
| Review | 最终确认 |

这些参与点不是"可选的"，而是**流程强制的**。跳过了就无法继续。

---

## 核心功能

### 1. 15 阶段状态机

```
Bootstrap → Initialization → Requirement → [Design Stages] → Implementation
    ↓
Testing (4-layer) → Review → Ship → Learn → Evolution → Reflection → Archive
```

每个阶段都有明确的入口条件、出口条件和交付物。阶段不可跳过，确保开发过程的完整性。

### 2. 双闸门审批

**Git Gate**：分类 git 命令的风险级别
- Safe：`git status`、`git log`、`git diff` → 静默通过
- Medium：`git commit`、`git merge` → 需要确认
- High：`git push --force`、`git reset --hard` → 需要确认 + 回滚警告

**Ops Gate**：分类运维命令的风险级别
- Pass：`kubectl get pods`、`systemctl status nginx` → 已知安全的只读命令
- Ask：`kubectl delete pod`、`systemctl restart nginx` → 状态变更，需要审批
- Deny：`kubectl frobnicate x` → 无法分类的命令，拒绝执行

### 3. 波次调度

任务分解后，Hello Dev 自动计算依赖关系，按波次执行：

```
Wave 1: [t1]           ← 无依赖
Wave 2: [t2, t3]       ← 依赖 t1，无文件冲突 → 并行
Wave 3: [t4]           ← 依赖 t2 + t3
```

**自动冲突检测**：如果 t2 和 t3 声明的 `affectedFiles` 有重叠，Wave 2 自动降级为串行执行。

### 4. 五层记忆系统

```
L0: 会话内工作记忆（临时）
L1: 项目级记忆（持久化）
L2: 跨项目记忆（全局）
L3: 模式记忆（经验总结）
L4: 元记忆（记忆的记忆）
```

每条记忆都有证据链：`improved` / `regressed` / `no_effect` / `unknown`。

### 5. 四层验证

```
1. 构建验证：代码能编译吗？
2. 回归验证：现有测试还能通过吗？
3. 行为验证：新功能符合预期吗？
4. 边界验证：极端情况处理了吗？
```

### 6. 需求拷问（grill-me）

结构化决策树遍历，把需求确认从"猜测"变成"显式决策"：

- 每个问题有推荐答案
- 每个分支有取舍说明
- 一次一问（不是 30 点问卷）
- 产出完整决策树

### 7. UI/UX 设计规范（ui-ux-pro-max）

基于证据的设计决策：

- **设计令牌（Design Tokens）**：颜色、字体、间距标准化为可复用变量
- **组件规格（Component Specs）**：每个 UI 组件有明确规格说明
- **布局蓝图（Layout Blueprint）**：页面布局在开发前定义
- **实现指引（Implementation Notes）**：设计决策有明确技术实现指引

---

## 安装指南

### WorkBuddy（推荐）

**WorkBuddy 是 Hello Dev 的主要运行平台**，提供完整的技能管理和宿主集成。

#### 通过 AI 助手安装（推荐）

在 WorkBuddy 中打开新会话，输入：

```
请帮我安装 hello-dev 技能
```

AI 助手会自动：
1. 搜索 hello-dev 技能
2. 下载并安装到正确的目录
3. 验证安装是否成功
4. 引导你开始使用

#### 验证安装

安装完成后，在 WorkBuddy 中输入：

```
你好，请加载 hello-dev 技能
```

如果看到 Hello Dev 的执行契约说明，说明安装成功。

### Claude Code

#### 通过 AI 助手安装

在 Claude Code 中输入：

```
请帮我安装 hello-dev 技能到 ~/.claude/skills/hello-dev
```

AI 助手会自动完成安装和配置。

#### 手动安装（高级用户）

1. 克隆仓库：
   ```bash
   git clone https://github.com/your-org/hello-dev.git
   ```

2. 复制到 Claude Code 技能目录：
   ```bash
   # macOS/Linux
   cp -r hello-dev ~/.claude/skills/hello-dev
   
   # Windows
   cp -r hello-dev %USERPROFILE%\.claude\skills\hello-dev
   ```

3. 在 `CLAUDE.md` 中添加技能引用：
   ```markdown
   ## Skills
   - hello-dev: Development enhancement framework
   ```

### OpenAI Codex

#### 通过 AI 助手安装

在 Codex 中输入：

```
请帮我安装 hello-dev 技能
```

AI 助手会自动完成安装和配置。

#### 手动安装（高级用户）

1. 克隆仓库：
   ```bash
   git clone https://github.com/your-org/hello-dev.git
   ```

2. 复制到 Codex 技能目录：
   ```bash
   cp -r hello-dev ~/.codex/skills/hello-dev
   ```

3. 在项目中创建 `CODEX.md`，添加：
   ```markdown
   ## Skills
   - ./hello-dev/SKILL.md: Development enhancement framework
   ```

---

## 平台适配详情

### WorkBuddy 适配（主推平台）

**WorkBuddy 是 Hello Dev 的最佳运行平台**，提供完整的开箱即用体验。

#### 完整支持的功能

| 功能 | WorkBuddy 支持情况 | 说明 |
|------|-------------------|------|
| 状态机 | 完整支持 | 通过 `TaskCreate/Update` 同步阶段状态 |
| 双闸门 | 完整支持 | PreToolUse hooks 自动注册 |
| 波次调度 | 完整支持 | 通过 `Agent` 工具派发子代理 |
| 五层记忆 | 完整支持 | `.hello-dev/memory.json` 持久化 |
| 四层验证 | 完整支持 | 验证阶段自动执行 |
| grill-me | 完整支持 | 需求拷问技能已捆绑 |
| ui-ux-pro-max | 完整支持 | UI/UX 设计规范技能已捆绑 |
| 多代理协作 | 完整支持 | 通过 WorkBuddy 的子代理系统 |

#### WorkBuddy 专属特性

**1. AI 助手安装**

无需手动操作，AI 助手自动完成技能安装和配置。

**2. 宿主工具集成**

WorkBuddy 提供了专属的宿主工具，让 Hello Dev 的功能更强大：

- `search_and_install_skills`：搜索和安装技能
- `TaskCreate/TaskUpdate`：任务管理，与 Hello Dev 的阶段状态同步
- `Agent`：子代理派发，支持波次调度

**3. 连接器生态**

WorkBuddy 的连接器市场提供了丰富的第三方集成：

- **腾讯文档**：自动同步设计文档和需求文档
- **微信支付**：支付相关操作的合规审批
- **ima（知识管家）**：知识库集成，跨项目经验召回

**4. 专家包**

WorkBuddy 的专家中心提供了预配置的专家团：

- `hello-dev`：完整的交付团队（15 个专家角色）
- 每个专家有明确的职责和协作规则

### Claude Code 适配

#### 支持的功能

| 功能 | Claude Code 支持情况 | 说明 |
|------|---------------------|------|
| 状态机 | 完整支持 | 通过 `Task` 工具管理阶段 |
| 双闸门 | 需要手动配置 | 需要手动注册 PreToolUse hooks |
| 波次调度 | 完整支持 | 通过 `Task` 工具派发子代理 |
| 五层记忆 | 完整支持 | `.hello-dev/memory.json` 持久化 |
| 四层验证 | 完整支持 | 验证阶段自动执行 |
| grill-me | 完整支持 | 需求拷问技能已捆绑 |
| ui-ux-pro-max | 完整支持 | UI/UX 设计规范技能已捆绑 |

#### Claude Code 专属特性

**1. 项目级安装**

可以将 `hello-dev` 放在项目根目录，实现项目级治理。

**2. CLAUDE.md 集成**

通过 `CLAUDE.md` 引用技能，自动加载执行契约。

### OpenAI Codex 适配

#### 支持的功能

| 功能 | Codex 支持情况 | 说明 |
|------|---------------|------|
| 状态机 | 完整支持 | 通过状态文件管理 |
| 双闸门 | 需要手动配置 | 需要手动注册 hooks |
| 波次调度 | 有限支持 | 通过 `create_thread` 派发 |
| 五层记忆 | 完整支持 | `.hello-dev/memory.json` 持久化 |
| 四层验证 | 完整支持 | 验证阶段自动执行 |
| grill-me | 完整支持 | 需求拷问技能已捆绑 |
| ui-ux-pro-max | 完整支持 | UI/UX 设计规范技能已捆绑 |

#### Codex 专属特性

**1. 线程派发**

通过 `create_thread` / `wait_threads` 实现多代理协作。

**2. CODEX.md 集成**

通过 `CODEX.md` 引用技能，自动加载执行契约。

**3. 提示构造**

`codex-prompt.js` 脚本自动构造符合 Codex 格式的提示。

### 平台对比

| 特性 | WorkBuddy | Claude Code | Codex |
|------|-----------|-------------|-------|
| 安装方式 | AI 助手自动安装 | AI 助手或手动 | AI 助手或手动 |
| 技能管理 | 图形界面 + 市场 | 手动管理 | 手动管理 |
| 子代理派发 | `Agent` 工具 | `Task` 工具 | `create_thread` |
| 状态持久化 | 完整 | 完整 | 完整 |
| 闸门注册 | 自动注册 | 需要手动配置 | 需要手动配置 |
| 连接器生态 | 丰富 | 有限 | 有限 |
| 专家包 | 预配置 | 需要手动配置 | 需要手动配置 |

**结论**：WorkBuddy 提供了最完整的开箱即用体验，推荐使用。Claude Code 和 Codex 也可以使用，但需要更多手动配置。

---

## 快速开始

### 场景 1：修复一个 Bug

```bash
# 1. 在 WorkBuddy 中打开新会话
# 2. 输入：
请帮我修复一个 bug：用户登录时偶尔会报"会话过期"错误。

# 3. Hello Dev 会自动：
# - Bootstrap：加载技能，检测环境
# - Initialization：范围调查，判断执行路径
# - Requirement：确认 bug 复现步骤
# - Implementation：定位并修复代码
# - Testing：四层验证
# - Review：复核变更
# - Ship：提交并记录经验
```

### 场景 2：开发一个新功能

```bash
# 1. 在 WorkBuddy 中打开新会话
# 2. 输入：
请帮我开发一个用户反馈功能，用户可以提交反馈，管理员可以查看和回复。

# 3. Hello Dev 会自动：
# - Bootstrap + Initialization
# - Requirement：需求拷问（grill-me）
# - Tool Research：调研技术方案
# - Feature Design：功能设计
# - Architecture：架构设计
# - Prototype：产出可运行原型
# - Implementation：按波次实现
# - Testing + Review + Ship
# - Learn + Evolution + Reflection + Archive
```

### 场景 3：重构一个模块

```bash
# 1. 在 WorkBuddy 中打开新会话
# 2. 输入：
请帮我重构认证模块，当前代码耦合度太高，需要拆分成独立的服务。

# 3. Hello Dev 会自动：
# - 评估重构范围和风险
# - 分解为多个子任务
# - 按波次执行（先拆分接口，再迁移实现，最后删除旧代码）
# - 每步都有验证和回滚计划
```

---

## 详细使用流程

### 阶段详解

#### 1. Bootstrap（启动）

**职责**：加载技能，检测环境，确定执行路径。

**交付物**：
- 技能加载确认
- 环境检测报告
- 执行路径选择（tiny/fast/implementation/full）

**用户操作**：无（自动执行）

#### 2. Initialization（初始化）

**职责**：范围调查，粗粒度任务分解。

**交付物**：
- 范围调查报告
- 粗粒度任务分解
- 风险评估

**用户操作**：确认范围是否合理

#### 3. Requirement（需求）

**职责**：需求确认，产出需求契约。

**交付物**：
- 需求契约（用户确认或明确授权）
- 需求拷问决策树（grill-me）

**用户操作**：回答需求拷问的问题，确认需求契约

#### 4. Tool Research（技术调研）— 仅 full 路径

**职责**：调研技术方案，评估技术风险。

**交付物**：
- 技术方案对比
- 技术风险评估

**用户操作**：选择技术方案

#### 5. Feature Design（功能设计）— 仅 full 路径

**职责**：功能设计，产出功能规格。

**交付物**：
- 功能规格文档
- 模块分解

**用户操作**：确认功能规格

#### 6. Architecture（架构设计）— 仅 full 路径

**职责**：架构设计，产出架构规格。

**交付物**：
- 架构规格文档
- 接口定义
- 依赖关系图

**用户操作**：确认架构设计

#### 7. Prototype（原型）— 仅 full 路径

**职责**：产出可运行原型，验证交互流程。

**交付物**：
- 可运行 HTML 原型
- 交互流程验证报告

**用户操作**：操作原型，确认交互流程

#### 8. Implementation（实现）

**职责**：按波次实现代码。

**交付物**：
- 代码变更
- 每个子任务的验证报告

**用户操作**：审查代码变更（可选）

#### 9. Testing（测试）

**职责**：四层验证。

**交付物**：
- 构建验证报告
- 回归验证报告
- 行为验证报告
- 边界验证报告

**用户操作**：确认测试通过

#### 10. Review（复核）

**职责**：独立复核，确保变更质量。

**交付物**：
- 复核报告
- 风险评估

**用户操作**：确认复核通过

#### 11. Ship（交付）

**职责**：提交变更，记录经验。

**交付物**：
- Git 提交
- 经验记录

**用户操作**：确认提交

#### 12. Learn（学习）

**职责**：总结经验，更新记忆。

**交付物**：
- 经验总结
- 记忆更新

**用户操作**：无（自动执行）

#### 13. Evolution（演进）

**职责**：评估技术债务，规划后续改进。

**交付物**：
- 技术债务清单
- 改进计划

**用户操作**：确认改进计划（可选）

#### 14. Reflection（反思）

**职责**：反思开发过程，提炼教训。

**交付物**：
- 反思报告
- 过程改进建议

**用户操作**：无（自动执行）

#### 15. Archive（归档）

**职责**：归档状态，清理临时文件。

**交付物**：
- 状态归档
- 临时文件清理

**用户操作**：无（自动执行）

---

## 配置说明

### 环境变量

Hello Dev 支持以下环境变量：

```bash
# 闸门控制
HELLODEV_OPSGATE=on|off              # 运维闸门开关（默认 on）
HELLODEV_OPSGATE_MODE=deny|allow     # 未分类命令处理（默认 deny）
HELLODEV_OPSGATE_SKIP_DIRS=dir1,dir2 # 跳过闸门的目录

# 调试
HELLODEV_OPSGATE_DEBUG=1             # 启用调试日志
HELLODEV_OPSGATE_TRACE=1             # 启用闸门追踪
```

### 状态文件

Hello Dev 的状态存储在 `.hello-dev/state.json`：

```json
{
  "schema": "1",
  "task": {
    "id": "dl-xxxx",
    "name": "任务名称",
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

### 记忆文件

记忆存储在 `.hello-dev/memory.json`：

```json
[
  {
    "layer": "L2",
    "content": "经验内容",
    "source": "evidence",
    "outcome": "improved"
  }
]
```

---

## 常见问题

### Q1：Hello Dev 会不会让我的开发变慢？

**A**：短期内可能会，因为增加了阶段确认和验证步骤。但长期来看，会显著减少返工和调试时间。根据实际使用数据，Hello Dev 可以把返工率降低 60% 以上。

### Q2：我可以在小项目上使用 Hello Dev 吗？

**A**：可以。Hello Dev 提供了 `tiny` 和 `fast` 两条轻量路径，适合小项目。`tiny` 路径只有 3 个阶段（Bootstrap → Implementation → Ship），适合单文件修改。

### Q3：Hello Dev 支持哪些编程语言？

**A**：Hello Dev 是语言无关的。它关注的是开发过程和治理，不关注具体的编程语言。你可以用它来管理 Python、JavaScript、Go、Rust 等任何语言的项目。

### Q4：我可以只使用 Hello Dev 的部分功能吗？

**A**：可以。你可以通过环境变量和配置来控制哪些功能启用。例如，如果你不需要运维闸门，可以设置 `HELLODEV_OPSGATE=off`。

### Q5：Hello Dev 的数据存储在哪里？

**A**：所有数据都存储在项目本地的 `.hello-dev/` 目录中。不会上传到云端，完全由你控制。

### Q6：WorkBuddy 和 Claude Code 哪个更适合用 Hello Dev？

**A**：WorkBuddy 提供了更完整的开箱即用体验（图形界面、技能市场、连接器生态），推荐优先使用。Claude Code 也可以，但需要更多手动配置。

### Q7：Hello Dev 如何处理敏感信息？

**A**：Hello Dev 的所有数据都存储在本地，不会上传。但建议不要在状态文件或记忆文件中记录密码、API Key 等敏感信息。

### Q8：我可以自定义 Hello Dev 的阶段吗？

**A**：可以，但需要修改 `scripts/lib/stages.js` 和相关的阶段文档。不建议随意修改，因为阶段之间有依赖关系。

---

## 资源链接

- **GitHub 仓库**：https://github.com/your-org/hello-dev
- **问题反馈**：https://github.com/your-org/hello-dev/issues
- **讨论区**：https://github.com/your-org/hello-dev/discussions

---

## 许可证

MIT License (c) 2026 Hello Dev Contributors
