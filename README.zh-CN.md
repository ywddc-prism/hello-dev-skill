# DevLoop Pro

[English](README.md) | **中文**

**确保 AI 构建你真正想要的东西。**

DevLoop Pro 是一个开发增强系统，解决 AI 辅助开发反复遇到的七个问题：构建了错误的东西、并行执行冲突、经验随会话丢失、审批边界模糊、测试通过但未真正验证、会话重启丢失状态、平台绑定。

## 核心价值：交付用户真正想要的

不同于其他 AI 开发工具关注"更快地写代码"，DevLoop Pro 关注**构建正确的东西**。通过结构化的需求拷问、原型优先验证、以及每个关键阶段的强制用户检查点，确保最终交付物匹配用户的真实需求 -- 而不是 AI 猜测的结果。

| 传统 AI 开发工具 | DevLoop Pro |
|-----------------|-------------|
| 关注编码速度 | 关注交付正确性 |
| 假设需求是清楚的 | 假设需求需要验证 |
| 开发完了再验证 | 开发之前就验证 |
| "我写得很快" | "我构建了正确的东西" |

## 解决了什么

| 问题 | DevLoop 如何解决 |
|------|-----------------|
| AI 构建了错误的东西，因为需求被误解 | 结构化需求拷问（grill-me）+ 决策树遍历 + 实现前的原型验证 + 每个关键阶段的强制用户检查点 |
| 多个子 Agent 静默覆盖彼此的文件变更 | 依赖图驱动的波次调度 + 自动文件冲突检测（同一波次内 `affectedFiles` 重叠时强制串行） |
| 过去任务的教训随对话结束而消失 | 五层记忆（L0-L4）+ 写入门禁拒绝推测 + 证据链跟踪每条经验是否有效（`improved`/`regressed`/`no_effect`/`unknown`） |
| 任务确认被当作提交和部署的全面授权 | Git 写操作、运维命令、部署强制单独确认；双 PreToolUse hook 执行前分类风险 |
| 跑测试不等于证明正确 | 风险优先的四层验证：识别风险 -> 用构建/回归/行为/边界证据逐项证明 |
| 会话重启丢失所有审批和进度 | 完整状态持久化到 `.devloop/state.json`；通过 `resume` 恢复 |
| 工作流绑定在单一 AI 平台 | Host Adapter 层将调度核心与平台特定的子 Agent 派发解耦（WorkBuddy、Claude Code、Codex） |

## 快速开始

```bash
# 1. 初始化新任务
node scripts/state.js init --name "你的任务名称" --type implementation --path fast

# 2. 按执行路径推进
# fast: bootstrap -> requirement -> implementation -> testing -> review -> ship
# full: bootstrap -> requirement -> feature-design -> architecture -> implementation -> testing -> review -> ship

# 3. 修改后运行自检查
bash scripts/self-check.sh
```

详细用法见 [_quick-start.md](_quick-start.md)。

## 核心概念

- **执行契约**:7 条原则,涵盖范围确认、因果理解、例外处理、精确记账、最小授权、最小变更和可停止性。
- **执行路径**:小变更(<50 行,无新依赖)选 `fast`,标准任务选 `implementation`,新设计工作选 `full`。
- **双门禁策略**:Git 操作和运维命令(kubectl、systemctl、terraform)在执行前按风险等级分类。
- **状态持久化**:所有审批、重试和检查点记录在 `.devloop/state.json` 中,用于恢复和审计。

## 项目结构

```
devloop-pro/
├── SKILL.md                    # 执行契约和路由(英文)
├── SKILL.zh-CN.md              # 执行契约和路由(中文)
├── AGENTS.md                   # Agent 入口
├── _quick-start.md             # 快速入门指南
├── modules/
│   ├── core/                   # 核心模块(状态协议、审批、任务管理)
│   ├── stages/                 # 阶段定义(bootstrap -> ship)
│   ├── paths/                  # 执行路径(fast、full、dev-mode-guide)
│   └── hosts/                  # 主机适配层(子 agent 调度)
├── scripts/                    # CLI 工具(state.js、memory.js、self-check.sh)
├── hooks/                      # PreToolUse hooks(git-gate.js、opsgate.js)
├── references/                 # 详细参考(运行时适配器、成本指标)
├── templates/                  # 文档模板
└── docs/progress_coding/       # 开发日志
```

## 关键命令

```bash
# 状态管理
node scripts/state.js init --name "任务" --type implementation --path fast
node scripts/state.js stage <名称> <状态>
node scripts/state.js checkpoint "名称" pass --reason "证据"
node scripts/state.js decompose --tasks '[...]'
node scripts/state.js resume

# 记忆管理
node scripts/memory.js recall --layer L2 --limit 5
node scripts/memory.js add --layer L2 --content "..." --source "证据"

# 验证
bash scripts/self-check.sh
node scripts/gen-index.js --check
node scripts/check-links.js
```

## 执行路径

| 路径 | 阶段 | 使用场景 |
|------|------|----------|
| `fast` | bootstrap -> requirement -> implementation -> testing -> review -> ship | 小变更,<50 行,无新依赖 |
| `implementation` | 同 fast | 有明确方案的标准任务 |
| `full` | bootstrap -> requirement -> feature-design -> architecture -> implementation -> testing -> review -> ship | 新设计或重大架构变更 |

## 硬约束

- 只读检查可直接执行;修改需确认范围
- 阶段显式持久化,不隐式完成
- 测试(Testing)和评审(Review)不可跳过
- Git 操作需根据风险协议单独确认
- 修改后必须立即追加开发日志

## 版本

当前:v15.11 (2026-10-07)

版本历史见 [OPTIMIZATION-REPORT.md](archive/OPTIMIZATION-REPORT.md)。

## 许可证

本项目仅供内部使用。许可问题请联系维护者。
