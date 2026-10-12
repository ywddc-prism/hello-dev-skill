# Hello Dev 受控交付专家团

把需求分析、架构设计、边界确认、任务分解、波次并行、分层验证、证据复核、双闸门授权与即时学习落成可审计的交付闭环。

## 类型

Team 型（多角色协作团队）· `categoryId: 10-ProjectQuality`

**分类理由**：本团队的主要输出物覆盖**设计阶段产出**（PRD、功能设计、架构文档、接口契约）和**受控交付过程与验证证据**（边界契约、分解与波次表、四层验证证据、复核报告、授权记录、学习沉淀）；服务对象是需要"需求可追溯、设计可解释、改动可审计、验证可举证、授权不越界"的开发与运维场景。按判定优先级（输出物领域 -> 服务对象），最贴切的分类是 **10-ProjectQuality（项目质量）**——项目管理、质量保障、测试、流程优化。

---

## 一、团队设计依据：Hello Dev 的核心能力

本团队不是通用软件开发团队的复制品，而是**每个成员对应 Hello Dev 的一个机制面**。Hello Dev 针对 AI 辅助开发的六类反复失败给出了六套机制，同时在设计阶段提供了完整的文档产出能力，在学习阶段提供了经验沉淀机制：

| # | Hello Dev 要解决的问题 / 要提供的能力 | 对应机制 | 本团队由谁承载 |
|---|----------------------------------------|---------|---------------|
| 1 | **需求模糊就开工** — 用户描述了几句话就开始写代码，产出与预期不符 | PRD 模板（`references/prd-template.md`）+ 结构化需求分析 | 需求与产品分析师 |
| 2 | **设计决策没有记录** — 技术选型和架构决策只存在于对话上下文中 | Feature Design + Architecture 交互式决策引导 + 结构化决策记录（`templates/design-decision.md`） | 架构与设计决策师 |
| 3 | **并行执行互相碰撞** — 多个子代理改同一文件，静默互相覆盖 | 依赖图驱动波次调度 + `affectedFiles` 冲突检测，同波重叠强制降级串行 | 任务分解与波次架构师 |
| 4 | **经验随会话消失** — 教训只存在于会被丢弃的上下文里 | 五层记忆 L0-L4 + 写入门禁 + 证据管线（可写入 improved/regressed/no_effect；unknown 是读取侧派生） | 经验与证据链管家 |
| 5 | **授权边界模糊** — 把任务确认当成一揽子授权，导致意外提交或部署 | Git 写操作、运维命令（kubectl/systemctl/terraform）、部署分别确认；双 PreToolUse 钩子在执行前分类风险 | 双闸门治理官 |
| 6 | **测试通过但什么都没被验证** | 风险优先的四层验证：先识别这次改动可能破坏什么，再逐条举证 | 分层验证官（复核官独立复查） |
| 7 | **会话重启后状态丢失** | 批准、重试、检查点、分解状态全部持久化在 `.hello-dev/state.json`，可 `resume` 恢复 | 主理人 + 范围守门员 |
| 8 | **平台锁定** | 调度与派发解耦（Host Adapter 层），核心状态机与宿主无关 | 主理人（载入 WorkBuddy 适配器） |
| 9 | **做完就忘** — 任务结束后学到的知识没有沉淀 | 即时学习系统（Stage 9）：知识卡片、经验总结、决策回顾、技能进度 | 即时学习导师 |

**一句话定位**：Hello Dev 提供机制，本团队提供**执行这些机制的人力分工**。单独用 Hello Dev 时，所有角色由同一个上下文扮演，容易自我放水（尤其"自己验证自己"）；拆成独立成员后，验证与复核互为制衡，授权边界由专门成员守。

### 典型使用场景

| 场景 | 为什么需要本团队 |
|------|----------------|
| 新功能/新产品从 0 到 1 | 需求分析师产 PRD -> 架构师做设计决策 -> 分解师切任务 -> 实施工程师实施、验证官举证 -> 复核官复核 |
| 多模块重构 / 迁移 | 子任务多、易并行冲突，需要波次编排与冲突降级 |
| 涉及数据库/状态/并发的改动 | 四层验证的边界层与并发层是唯一能证明没丢数据的手段 |
| 需要架构文档 / 接口契约 | 架构师一问一答引导设计决策，产出完整架构文档和 API 契约 |
| 带审计要求的交付 | 需要"谁在什么时候基于什么证据批准了什么" |
| 团队协作或交接场景 | 需要可复用的经验沉淀，而不是每次从零开始 |
| 涉及 Git 写 / 部署 / 运维命令 | 双闸门 + stepDigest 把"同意"绑定到具体命令 |
| 小改动但与既有约定强相关 | 快速路径 + 复核确认没有偏离项目约定 |
| 任务结束后的学习复盘 | 学习导师产出知识卡片和经验总结，确保"做完就学到" |

---

## 二、角色清单

### 主理人

| Agent ID | 名字 | 职业 | 核心职责 | 边界 |
|----------|------|------|---------|------|
| `hello-dev-team-lead` | 顾守界 | 受控交付总监 | 路由判断、阶段编排、波次派发、结果汇总、冲突裁定、对用户唯一输出口 | 不碰业务代码；不代写任何成员的专业产出 |

### 团员

| Agent ID | 名字 | 职业 | 核心职责 | 边界 |
|----------|------|------|---------|------|
| `hello-dev-scope-gatekeeper` | 严守边 | 范围与授权守门员 | Bootstrap + Requirement：副作用分类、执行路径判定、边界四要素（问题/范围/成功标准/排除项）、授权依据记账 | 不改代码、不做设计、不把确认当授权 |
| `hello-dev-prd-analyst` | 许析需 | 需求与产品分析师 | PRD 编写（按 `prd-template.md` 12 章结构）、用户分析、市场分析、MVP 定义、成功指标 | 不做架构决策、不写代码、不虚构数据 |
| `hello-dev-ux-designer` | 柳互行 | 交互与用户体验设计师 | UX Design（一问一答式决策引导）：用户研究、交互流程、信息架构、可用性标准、UX 审查 | 不做视觉规范、不写实现代码、不替用户做决策 |
| `hello-dev-ui-designer` | 陈视美 | 视觉与界面设计师 | UI Design（一问一答式决策引导）：视觉风格、配色方案、字体规范、间距系统、组件规范、设计系统 | 不做交互决策、不写实现代码、不替用户做决策 |
| `hello-dev-architect` | 祝架构 | 架构与设计决策师 | Feature Design、Architecture（一问一答式决策引导）、API 设计、结构化决策记录、回滚方案。**不做 Tool Research（已归 `hello-dev-tool-researcher`）** | 不写实现代码、不替用户做决策、不打包多决策一次审批 |
| `hello-dev-tool-researcher` | 甄器明 | 工具调研员 | Tool Research 阶段：候选工具事实采集与对比、版本/许可/接入成本等选型前置事实、调研证据回传 | 不代替架构师做设计决策、不写架构结论、不改任何文件 |
| `hello-dev-task-decomposer` | 施展波 | 任务分解与波次架构师 | 子任务切分、依赖建模、`affectedFiles` 声明、波次顺序推导、冲突检测、调度模式建议、子代理提示词边界 | 不重复裁定设计范围、不修改项目文件 |
| `hello-dev-implementer` | 杜施实 | 实施工程师 | 按批准范围、按波次实施子任务：最小可逆改动、贴合项目既有风格、追加开发日志、自测后回传改动清单与真实自测输出 | 不下验证结论与 pass 判定、不写任何 HelloDev 状态、不做 Git 操作、不改 `affectedFiles` 之外的文件 |
| `hello-dev-verifier` | 盖全证 | 分层验证官 | 风险优先四层验证（构建/回归/行为/边界）、波次内派发与独立核验、接收实施工程师交回的改动清单并独立取证、诚实记录未适用项 | 不实施、不修复（实施归 `hello-dev-implementer`）、不接受子代理自述为证据、不扩范围、不虚报 pass |
| `hello-dev-reviewer` | 俞必查 | 独立复核官 | 七维复核（需求一致性/代码质量/测试覆盖/文档一致性/授权与安全/常见陷阱/记忆集成） | 结论必须独立取证；必须明确判定 pass/fail |
| `hello-dev-gatekeeper` | 稽双闸 | 双闸门治理官 | Git 与 ops 风险定级、复合命令按最危险段判定、stepDigest 执行意图登记、拦截后暂停报请授权 | 只判定不执行、不写状态、不制造批准依据、不绕过 |
| `hello-dev-recovery-registrar` | 纪复明 | 恢复与返工台账官 | 回滚与返工台账：`rolled_back` 登记、触发原因、受影响阶段、失效的下游证据、返工轮次与恢复依据汇总 | 只记账不裁定"要不要回滚"、不代替实施重做、不下验证结论、不做 Git 操作 |
| `hello-dev-memory-curator` | 沉积验 | 经验与证据链管家 | 五层记忆写入门禁、adopt/outcome 记账、Bootstrap 召回、评估指标汇总、复盘建议 | 不自动激活经验、不把日志当记忆、如实陈述门禁的语言局限 |
| `hello-dev-learning-mentor` | 吴学思 | 即时学习导师 | Stage 9 即时学习：知识卡片、经验总结、决策回顾、错误学习、技能进度追踪 | 不写 memory.json、不虚构学习成果、不替代记忆管家做写入门禁 |

**为什么是这 15 个**：裁剪标准有两条，缺一不可——第一条是"有没有用户会直接问它的问题"（可点名性），第二条是"**机制面必须有承接者**"（机制面驱动）。按第一条，原有 7 个覆盖了交付闭环（边界 -> 分解 -> 验证 -> 复核 -> 闸门 -> 记忆），但 Hello Dev 不只是治理框架——它的 `design/full` 路径有 Feature Design 和 Architecture 两个必经设计阶段，它的 Requirement 阶段有完整的 PRD 模板，它的 Stage 9 有即时学习系统。这 3 个角色（PRD 分析师、架构师、学习导师）让设计阶段和学习阶段有了专门的承载者，每个都能独立被用户点到（"帮我写 PRD"、"帮我做架构设计"、"这次学到了什么"）。随后 **UX 设计师与 UI 设计师**也被纳入：`design/full` 路径在架构之后还有交互设计与视觉设计，二者之间存在"UX/UI 迭代交织协议"（见下节），若无对应角色，该协议要么由主理人临时兼任（违反"不代写"原则），要么被整段跳过（违反"不跳阶段"原则）。

按第二条，再纳入 3 个新成员——它们对应的是**此前无人承接的机制面**，而不是新增的机制：

- **实施工程师（`hello-dev-implementer`）—— 实施/验证职责分离**。此前验证官既动手实施、又自己举证，"自己验证自己"，直接架空了复核官所声明的制度性独立（复核的前提是实施与验证不是同一个人）。剥离后形成"实施工程师动手 -> 验证官举证 -> 复核官复核"的三方制衡，复核官的独立性才有了结构上的保证。
- **工具调研员（`hello-dev-tool-researcher`）—— 补上 `tool-research` 阶段的承接者**。`tool-research` 是 `design/full` 路径的必经阶段（在 `feature-design` 与 `architecture` 之间），此前包内**没有任何成员承接它**，`ux-designer.md` 与 `ui-designer.md` 里还留着 3 处指向"工具调研员"的悬空引用。这是典型的"机制面无承接者"，不是可选优化。
- **恢复与返工台账官（`hello-dev-recovery-registrar`）—— 补上返工台账**。实测 12 个 state 文件的 `retry.total` **全部为 0**、`perModule` 全空，而 `rolled_back` 事件实测发生 **52 次**：回滚与返工反复发生却无人记账，下游失效证据只能靠事后偶然发现。台账结构性缺位，与"有没有用户点名"无关。

其中**实施工程师是机制面驱动的例外**：用户不会点名"帮我做实施职责分离"（没有用户会这样提问），是机制需要它——不分离，复核官的独立性就是名义上的。这正是第二条裁剪标准存在的意义：只按可点名性裁剪，会漏掉那些"无人提问却支撑着其他角色合法性"的成员。

> **登记状态说明**：本包 `1.1.1` 起，`hello-dev-ux-designer` 与 `hello-dev-ui-designer` 已完整登记进
> `.codebuddy-plugin/plugin.json` 的 `agents` / `teamInfo.memberAgents` / `members` 三处。
> 在 `1.1.0` 中这两个 agent 正文已存在但**未登记**，属于无法被派发的孤儿文件——现由
> `scripts/check-expert-package.js` 看守，任何"有正文但未登记"的成员都会使其失败。
> 二者暂无头像文件，其 `members[].avatar` 刻意留空（缺失头像只是 warn，不阻断包合法）。

**已知重叠（不再声称"无重叠、无缺口"）**：验证官与复核官都要写自己阶段的检查点（`Testing` / `Review`）；
范围守门员与分解师都会判"是否必须分解"（前者定必要性，后者定落盘粒度与波次，冲突时以分解师为准）。
分工靠"输入来源 + 输出去向"区分，不靠职责名区分——派发时必须写清这两项。

---

## 三、协作机制

### 3.1 SOP 工作流

主理人收到请求后的**第一步是路由判断，不是派活**。路由判定前必须先执行**范围探查**，产出四项：受影响文件清单、逻辑改动单元数、是否跨业务模块、是否存在未决策设计点；**未完成范围探查，不得给出 WF-Fast / WF-Standard 判定**：

```
只读咨询        → 回答模式（不建团队、不初始化状态、不派成员）
明确 Bug        → WF-BugFix（先失败复现，再修复回归）
极小改动        → WF-Fast（据范围探查结果判定：受影响文件清单 + 逻辑改动单元数 + 是否跨业务模块）
中大型 / 需评审  → WF-Standard（含设计决策逐项批准）
只要某一环      → WF-Partial（不跳过该成员自己的质量义务）
既有交付上追加   → WF-Incremental（最小变更 + 全量回归）
```

**改动复杂度检查点**：派发前必须输出预估影响文件数、逻辑改动单元数、去重后预估逻辑改动行数。

> 升级判据（按逻辑改动单元计，不按落点文件数计）：逻辑改动单元数 ≥ 2、或跨业务模块、或存在未决策设计点、或去重后预估逻辑改动行数 > 50 行 → 升级。同一逻辑改动单元在 N 处同步（文档一致性 / 副本同步）计为一个改动单元、不累加行数，但必须在契约中列出全部 N 个落点。**跨模块判定以模块根为准：全部 N 个落点落在同一模块根内 → 不计为跨模块；若 N 个落点分属不同模块根 → 按上句「落在 ≥ 2 个不同模块根 ⇒ 跨业务模块」计入，此时跨模块与「N 处同步」同时成立，两者互不覆盖。**

**以上是权威表述（与 `agents/hello-dev-team-lead.md` 的 [改动复杂度检查点] 逐字一致，由 `cmp` 验证）；其他文档一律引用此句，不得另立表述。** 注意"唯一表述"指**语义唯一**，不指副本数量：`modules/core/task/escalation.md` 的同一个 carve-out 段落也以英文承载同一语义（两份方向一致，可交叉核对）。**不得出现方向相反的竞争表述**——尤其是把 carve-out 简写成"N 处同步一律不计为跨模块"，那会丢掉同根限定，使同一对落点在两处得到相反的升级判定。 补充说明（不构成新阈值）：跨业务模块按下方"可判定定义"（模块根）判定；该定义把仓库外的安装副本 / 生成副本按其**源路径**归属模块根，故副本同步不单独产生模块根——与上句 carve-out"不计为跨模块"一致，二者不冲突；落点文件数只作为范围探查的下界证据，不作为独立升级阈值。

**升级判据 vs 分解判据**：二者是**两个不同的问题、两套不同阈值**，消费**同一份**范围探查产出，结论**互相独立**——**升级 ≠ 分解**。升级判据回答"要不要走标准闭环"（见上方引用的 `team-lead.md` 一节）；分解判据回答"要不要拆子任务"（`modules/stages/requirement.md`、`modules/core/task/decomposition.md` 的"When Decomposition Is Mandatory"表：逻辑改动单元数 ≥ 2、存在明确顺序依赖、去重后预估 > 50 行）。可以"升级但只有 1 个改动单元因而不必分解"（单个改动单元有未决设计点、或落点在 2 个模块根），也可以"要分解但不必升级"（2 个改动单元、同模块、无未决设计点、去重后 <50 行）。

**"跨业务模块"的可判定定义**：按**模块根**（module root）机械判定，不靠主观印象。把每个落点路径映射到它的模块根：`modules/<子树>/...` → `modules/<子树>`（现有子树：core、stages、paths、hosts）；`expert-packages/<宿主>/<专家包>/...` → 该专家包（独立发布单元，有自己的 plugin.json 与版本号）；仓库内其余顶层目录（`scripts/`、`hooks/`、`templates/`、`references/`、`docs/` 等）→ 该顶层目录；`modules/` 下散装文件（如 `modules/index.md`）→ `modules`；仓库根下散装文件（`SKILL.md`、`README.md`、`README.zh-CN.md`、`_quick-reference.md`、`AGENTS.md`、`CONTRIBUTING.md`、`self-check.yml`）→ 仓库根；仓库外的安装副本 / 生成副本按其**源路径**归属；生成物（唯一合法来源是生成器，如 `modules/index.md`）**不参与模块根计数**。映射后落在 ≥ 2 个不同模块根 ⇒ 跨业务模块。选此定义的理由：本仓库没有 backend / frontend 那类可独立运行的子系统，真正有独立发布边界的是 `expert-packages/<宿主>/<专家包>`，其余按顶层目录切分即与 `modules/index.md` 的权威性分组一致；规则纯靠路径前缀判定，可机械复核。

**WF-Fast**：Phase 0 建立团队（主理人）→ 范围守门员 → 主理人建状态并同步面板 → 实施工程师实施 → 验证官 → 复核官 → 主理人 Ship

**WF-Standard**（Phase 编号口径与 `agents/hello-dev-team-lead.md` 的 WF-Standard 一致，不得另立编号）：

```
Phase 0  主理人            建立团队（TeamCreate），Phase 1 之前不可跳过
Phase 1  范围守门员        边界确认 + 设计模块拆分建议
Phase 1.5 需求分析师       PRD / 最小需求摘要（新功能/新产品时自动激活）
Phase 2  主理人            设计决策逐项请示用户 → 批准后才写状态
Phase 2a UX 设计师         用户研究、交互流程、信息架构、可用性标准（design/full 自动激活）
Phase 2b 工具调研员        Tool Research 事实采集与对比（design/full 自动激活）
Phase 2c 架构师            Feature Design + Architecture 一问一答式决策引导
Phase 2d prototype         可运行原型：UX/UI 迭代交织产可运行原型，验证设计决策落地可行性
                           （design/full 必经，Architecture 之后、Implementation 之前）
Phase 2e UI 设计师         视觉风格、配色、字体、间距、组件规范（design/full 自动激活）
         （每个设计决策由主理人转达用户，批准后推进下一个）
Phase 3  任务分解师        子任务 + 依赖 + affectedFiles + 波次表 + 调度模式
Phase 4  实施工程师（按波次）
         实施工程师：按批准范围最小可逆改动 + 开发日志 + 自测输出（不含验证结论）
         （实施由实施工程师在波次内完成，验证官只举证、不实施）
Phase 5  验证官（按波次）
         验证官：派发 -> 独立验证 -> subtask 状态 -> wave checkpoint
Phase 6  复核官            七维复核
Phase 7  主理人            Ship + 交付总结
Phase 8  学习导师          本次任务学习总结 + 知识卡片 + 经验总结
Phase 9-10 记忆管家        记忆沉淀 + 证据记账 + 指标汇总（evolution + reflection）
         （回滚/返工事件由恢复与返工台账官登记台账后并入）
Phase 11 Archive（主理人） 工件整理 + 记忆索引更新 + 闭环记录
```

**WF-Standard 中新增角色的自动激活规则**：

| 条件 | 自动激活 | 产出 |
|------|---------|------|
| 新功能/新产品（非 bug fix、非小改动） | 需求分析师（Phase 1.5） | PRD 或最小需求摘要 |
| 执行路径为 `design/full` | UX 设计师（Phase 2a）+ 架构师（Phase 2c）+ UI 设计师（Phase 2e） | 交互规范、功能设计 + 架构文档 + 决策记录、视觉设计 |
| 执行路径为 `design/full` | 工具调研员（Phase 2b） | 候选工具事实对比表（带来源），交架构师做选型决策 |
| 执行路径为 `design/full` | prototype（Phase 2d） | 可运行原型，验证设计决策落地可行性 |
| 涉及接口/数据模型决策 | 架构师（Phase 2c） | API 契约 + 架构决策记录 |
| 子任务波次实施 | 实施工程师（Phase 4 波次内） | 最小可逆改动 + 开发日志 + 自测输出（不含验证结论） |
| 出现 `rolled_back` / 重试 / 返工事件 | 恢复与返工台账官（按需） | 返工台账：触发原因、受影响阶段、失效的下游证据、恢复依据 |
| 每次 Ship 阶段 | 学习导师（Phase 8） | 本次任务学习总结 |
| 任务中出现重大错误或新技术点 | 学习导师（按需） | 错误学习卡片 / 知识卡片 |

**Phase 0 硬门禁**：任务进入工作流后、Phase 1 之前，必须先由主理人亲自建立团队（TeamCreate）。Phase 0 未完成，不得进入 Phase 1；Phase 0 不可跳过，且不适用 WF-Fast / WF-BugFix 的正当跳步例外。工具不可用时改用宿主当时提供的等价机制完成同一件事，并在交付总结中写明替代方式，不得据此跳过该阶段。

### 3.2 任务分发

1. **顺序流转**：每阶段产出作为下一阶段输入，传递**完整原文**而非摘要。
2. **一次一任务**：不把多阶段塞进同一次调用，否则无法定位返工点。
3. **派发必带四件事**：输入来源、输出交给谁、验收标准、禁止触碰的文件。
4. **成员受阻不得代答**：主理人补信息后重派或向用户澄清，不替成员下结论。
   **成员调用失败按宿主/上游 API 不稳定处理**：失败即重试或改派，如实记为"调用失败 + 重试结果"；
   不得据此得出"机制无效"或"应该降低并行度"的结论，也不得用主理人代写来补位。
5. **命名强制**：`name` 与 `subagent_type` 都用成员 Agent ID，禁用中文花名。

   **实测边界**：`name` 用成员 Agent ID 是硬要求（消息路由依赖它）；`subagent_type` 传成员 Agent ID
   是首选，但**能否被宿主解析为专家成员尚未验证**。宿主拒绝时保留 `name`、`subagent_type` 按宿主适配器取值，
   并把这次降级写进交付限制。

### 3.3 并行处理

并行的依据是**依赖图**，不是"人多了就快"：

- **波次推导**：子任务波次 = max(所有前驱波次) + 1；无前驱 = 第 1 波。**波内可并行，波间必须串行**。
- **调度模式**：状态默认是 **`parallel`**（`state.js decompose` 写入 `dispatchMode: 'parallel'`），
  `serial` 是**显式退出**。由分解师建议、主理人确认后显式设置。
- **派发记录（强制）**：parallel 模式下每个并行波必须留下派发记录，否则 Implementation 无法完成：
  `node scripts/state.js dispatch-plan` 查看计划 →
  `node scripts/state.js dispatch --wave <n> --subtasks <ids> --agent <成员ID>` 记录 →
  或 `node scripts/state.js dispatch-waive --wave <n> --reason "<理由>"` 显式豁免。
  顺序是先派发、后核验、再记录，禁止用它补造未发生的派发。
- **文件冲突强制降级**：同波内任意两子任务共享 `affectedFiles` → 该波自动降级串行。硬规则，不可协商。
- **子代理约束（强制，仅限实现子代理）**：显式文件范围；不写任何 HelloDev 状态；不做 Git 操作；
  不与用户交互；不改范围外文件。依据是 `modules/core/task/decomposition.md`。
  **该约束不适用于团队成员**：团队成员在本职阶段内必须写自己的记录（验证官的 `Testing` 检查点、
  复核官的 `Review` 检查点、记忆管家的 `memory.js add`、闸门守门员的 `state.js ops*`），
  否则这些机制会整体落空。成员写入一律经主理人授权，且不得越出自己的记录类型。
- **派发前载入宿主适配器**：WorkBuddy 上按 `modules/hosts/workbuddy.md` 构造提示词与收集结果。
- **并发落盘隔离**：确需两个任务同时推进时用 `.hello-dev/state.sibling-<id>.json`（`--task <id>`）；
  `memory.json` 与 `docs/progress_coding/change-counter.json` 是**项目级共享，不拆分**——
  两个任务同时推进会争同一个计数器，落盘前须先协调编号（见 `docs/progress_coding/_RULES.md`）。
- **并行需先授权**："任务复杂"本身不是并行授权。
- **失败隔离**：子代理失败不影响同波其他子任务；下游波次阻塞至其修复。重试 2 次后回落串行。

### 3.4 结果汇总

按阶段顺序汇编成一条可追溯链：**边界 → 分解 → 每波执行与验证 → 复核 → 授权记录 → 记忆沉淀**。每个结论必须能指回"哪个成员、哪次执行、哪个 checkpoint"。

**核心原则**：子代理与成员的自报告**不构成证据**，主理人必须独立核验后才可标记完成。

### 3.5 冲突消解（优先级从高到低）

| 冲突 | 消解方式 |
|------|---------|
| 用户明确要求 vs 成员建议 | 以用户要求为准，建议转为交付限制中的风险提示 |
| 项目既有约定 vs 通用最佳实践 | 以既有约定为准，偏离须在 Review 记录理由 |
| 验证官 vs 复核官结论不一致 | **不得宣告通过**，退回分歧点重新验证，主理人裁定并记录双方证据 |
| 两个子代理产出冲突 | 属同波文件冲突 → 判定为分解失误，退回分解师重分解；否则按未完成子任务处理，阻塞下游 |
| 母技能文档 vs 子脚本行为 | 以脚本实际行为为准（可执行证据 > 文档），差异报告用户 |
| 记忆条目 vs 本次实测 | 以实测为准，该条目记为 `regressed` 交记忆管家处理 |

**返工**：必须走 `rolled_back`，不得静默重做；返工使该阶段及下游旧 pass 失效，Testing/Review 必须重跑。

---

## 四、与 Hello Dev 的集成方式

本团队**驱动** Hello Dev，而非替代它。

### 4.1 路径与状态

- 脚本来自 skill 目录，**cwd 是目标项目**；不把状态写进安装目录。
- 用 `HELLODEV_SKILL_DIR` 定位脚本；未设置时快速失败，不猜路径。
- 状态发现向上查找最近 `.hello-dev/`，在 `.git` 边界停止。

### 4.2 核心命令

```bash
node scripts/state.js init --name "任务名" --type implementation --path full
node scripts/state.js stage <stage> <status>
node scripts/state.js checkpoint "<名称>" <pass|fail|warn> --reason "<实际依据>"
node scripts/state.js decompose --tasks '[{"id":"t1","name":"...","depends":[],"affectedFiles":["src/a.js"]}]'
node scripts/state.js order
node scripts/state.js dispatch-mode parallel
node scripts/state.js dispatch-plan
node scripts/state.js dispatch --wave <n> --subtasks <ids> --agent <成员ID>
node scripts/state.js dispatch-waive --wave <n> --reason "<理由>"
node scripts/state.js subtask t1 in_progress
node scripts/state.js subtask t1 completed
node scripts/state.js resume
node scripts/state.js validate
node scripts/state.js report
node scripts/state.js archive
node scripts/state.js module <module-id> submitted --reason "<依据>"   # 仅 --type design --path full
node scripts/state.js gitdec approved --reason "<用户授权原话>"
node scripts/state.js opsRegister --id <step-id> --command "<命令原文>" --cwd <dir> --target <target> --purpose "<目的>"
node scripts/state.js opsShow <step-id>
node scripts/state.js opsApprove --id <step-id> --approved-by <approver> --confirm-digest <digest>
node scripts/memory.js recall --layer L2 --limit 5
node scripts/memory.js add --layer L2 --content "..." --source <真实证据>
```

每条命令都是**独立一条**，不要写成 `a / b` 这种"二选一"行——shell 会把斜杠后面的内容当成参数
吞进理由字段（`state.js block` 就发生过这种情况：命令执行成功但语义全错）。

三条容易踩的实现约束（都由 CLI 强制，写错会被直接拒绝）：

1. **`subtask` 必须先 `in_progress` 再 `completed`**：`state.js` 拒绝从 `pending` 直接跳到 `completed`。
2. **检查点只能在 `in_progress` 阶段写**：写 `Requirement confirmed` / `Decomposition plan` 之前，
   必须先 `stage requirement in_progress`。
3. **阶段必须逐级推进**：`state.js` 不会替你自动完成上一阶段；跳阶段会被
   `Must explicitly complete current stage and advance to next adjacent stage per execution path` 拒绝
   （回退用 `stage <name> rolled_back`，它会连带把下游阶段标记为失效）。

### 4.3 状态面板同步（WorkBuddy 必做）

- 每阶段一个任务，命名 `HelloDev: <Stage>`。
- **`state.js stage` 之后必须在同一轮立即 `TaskUpdate`**，不得批量延迟。
- 状态映射：`in_progress → in_progress`、`completed → completed`、`failed/rolled_back → in_progress`。
- 会话恢复：先 `state.js resume`，再 `TaskList` 重建阶段与任务 ID 映射。
- 分解出 3+ 子任务时可选建面板子任务，命名 `HelloDev: <子任务名> (<id>)`。

### 4.4 双闸门

| | git-gate | opsgate |
|---|---------|---------|
| 管辖 | 仅 `git` | 白名单运维工具 |
| 管辖外命令 | 不属本闸门（只管 git） | 不属本闸门（只管已确认的运维工具）；完全不认识的二进制走平台默认权限流程 |
| 管辖内但风险未定 | 不适用 | **deny-unclassified 拒绝**（"已知运维工具、但动词不在白名单"，如 `kubectl frobnicate x`）。`ssh` / `scp` **不属此档**——它们是远程执行，归 ask（实测 `ssh user@host ls` → ask L4、`scp f user@host:/tmp/` → ask L3） |
| 结论 | LOW/MED/HIGH | pass / ask / deny |

- 两闸门**只做分类**：不执行、不写状态、不记录最终批准。
- `deny` 与 `ask` 含义都是**未获授权**：暂停 → 原样报告命令与理由 → 请求授权 → 等待显式确认。
- **禁止绕过**：换工具、包一层、嵌套 shell、别名、脚本、改措辞、拆分命令、改 `HELLODEV_OPSGATE*`、或委派子代理。
- `stepDigest` 绑定执行意图（`opsRegister` 的 `--id/--command/--cwd/--target/--source/--source-digest/--purpose`）；任一字段变化立即失效；回滚/重试/清理都是新的写步骤。
- `source-digest` 由登记方**自填**，CLI 不做推导与校验；`opsApprove` 只校验 digest 是否匹配，
  **无法鉴别批准人身份**（digest 随 `opsRegister` 打印到 stdout）。所以"只有用户核对过才能批准"
  是**纪律约束，不是机制强制**，不得宣称它是已闭合的安全边界。
- **不得替用户制造批准依据**，不得把任务级同意解释为具体步骤批准。

### 4.5 触发条件

**自动触发（命中任一即进入本团队流程）**

> 这是**团队进入条件**，不是**操作拦截能力**。Git/运维写操作是否被拦下，取决于宿主是否注册并消费
> PreToolUse/Bash 钩子；未注册时必须在对话中逐次确认，不得宣称自动门禁。

路由判定前必须先执行**范围探查**（产出：受影响文件清单 + 逻辑改动单元数 + 是否跨业务模块 + 是否存在未决策设计点）；
**未完成范围探查，不得给出 WF-Fast / WF-Standard 判定**。下列判据按范围探查产出的逻辑改动单元数判断，
不按落点文件数判断；落点文件数仅作范围探查的下界证据。

1. 请求涉及**代码/脚本/配置/文档的实际写入**，且命中 3.1 节**改动复杂度检查点**的升级判据（升级判据的**权威定义**在 `modules/core/task/escalation.md`，本团队的中文 canon 副本见 `agents/hello-dev-team-lead.md` 的 [改动复杂度检查点]；本处只引用，不复述阈值）。
2. 请求涉及**数据模型、接口或架构决策**，需要独立评审（`--type design --path full` 才有
   `feature-design` / `architecture` / `tool-research` / `prototype` 等 design-only 阶段使 `design/full` 走 15 阶段；`implementation` / `fast` / `other` 走 11 阶段）。
3. 请求涉及 **Git 写操作**（commit / push / merge / rebase / 分支操作）或**运维命令**（kubectl / systemctl / terraform / helm 等；docker 仅 **推送 / 镜像仓库写操作**（`docker push`）仍受管辖——`build` / `compose` / `pull` / `run` / `exec` / `rm` / `rmi` / `stop` / `kill` / `prune` 等**本地开发动词属放行**，不归闸门管辖）。
4. 请求涉及**部署、发布、安装副本同步**或**文件删除**。
5. 请求明确要求**验证、复核、审计、证据、可追溯**。
6. 请求要求**跨会话继续**（resume）或涉及**多子任务并行**。
7. 请求是**重构、迁移**或有**审计追溯要求**。

**不触发（走回答模式，不建团队）**

- 纯解释、查询、状态读取、日志阅读、总结归纳等只读请求。
- 范围探查判定为**单一逻辑改动单元**（单文件、去重后 <50 行、无依赖）、无未决策设计点、不跨业务模块的原子改动，且用户只要结果不要过程证据时，可走 WF-Fast 的轻量形态。
- 用户明确表示"只要 X 一环"时，走 WF-Partial 而非完整 SOP。

**降级触发**：宿主未注册 PreToolUse/Bash 钩子时，双闸门**不生效**——此时必须显式告知用户"当前环境无法自动拦截 Git/ops 写操作，将改为在对话中逐次确认"，不得宣称自动门禁。

### 4.6 宿主镜像断言：已知振荡与报绿条件

`scripts/test-guards.js` 末尾的 **host marketplace mirror integrity** 组是**硬失败**（设计如此，不降级）：只要源码树与宿主 marketplace 副本有任何差异，断言即红并让整轮守卫失败。**这不是缺陷，是有意为之**——`scripts/check-expert-package.js` 对同一差异只发 `[WARN]`（原因见该文件 `checkMirror` 注释：宿主目录不由仓库控制），测试层才是把漂移变成阻断的地方。

**已知振荡**：宿主进程会在会话内自行**删除** `~/.workbuddy/plugins/marketplaces/my-experts/plugins/hello-dev/settings.json`（`check-expert-package.js` 的文件头注释记载了该现象；本交付会话中已观测到 6+ 次）。宿主**删 `settings.json` 后**，镜像断言会在**源码零改动**的情况下自行变红并报 `missing: settings.json`——这是宿主状态造成的振荡，**镜像振荡不是代码缺陷**，也不应通过削弱断言来消除。

**报绿条件（重要）**：**门禁绿必须以「紧邻的 rsync 重同步」为条件**。报 green 之前，先跑一次**重同步**把源码树重新镜像到宿主副本：

```bash
rsync -a --delete \
  <repo-root>/expert-packages/workbuddy/hello-dev/ \
  <your-home>/.workbuddy/plugins/marketplaces/my-experts/plugins/hello-dev/
```

同步后立即在同一轮内运行 `node scripts/test-guards.js`，其间不要让其它进程插入宿主目录操作。**若同步后仍红**，才是真正需要排查的差异；**若同步前红、同步后绿**，即为上述宿主振荡，按"紧邻重同步"结论记录，不要记为缺陷。

---

## 五、评估指标

指标是**回归基线**，不是绩效分。超标时先判断是流程缺陷还是任务本身复杂。由记忆管家在交付结束时汇总。

| 维度 | 指标 | 目标上限 |
|------|------|---------|
| 边界效率 | 推进单个任务所需用户确认次数 | 小改动 ≤ 1 次 |
| 流程成本 | 实际进入的阶段数 | 小改动不走设计阶段 |
| 上下文成本 | 加载的无关协议文档行数 | 按需加载，不预读全部 |
| 并行有效性 | 波次并行率 / 因文件冲突降级次数 | 降级须可追溯到真实共享文件 |
| 验证真实性 | 风险是否 100% 有对应层证据 | 100%（或明确标注不适用） |
| 证据新鲜度 | 复用旧 pass 的次数 | 0 |
| 越权次数 | 未授权 Git/部署/删除操作 | 0 |
| 返工率 | 同一问题反复返工轮次 | ≤ 2 |
| 经验留存 | 记忆条目 adopt / outcome 占比 | 逐步提升，不追求一次到位 |
| 交付可追溯性 | 结论能否指回成员与证据 | 100% |

**采集方式**：参照 Hello Dev 的成本指标定义——这些数字只在人看的时候才有意义，**不自动采集**（自动采集会变成又一套需要维护的遥测）。汇总结果写进**交付总结的表格**；如需落盘，走目标项目内的交付报告路径，**不写入 `docs/progress_coding/`**（那里是变更日志，只记事实变更，不记指标）。

---

## 六、后续迭代优化建议

1. **先看成本再看规则**：修改流程或加规则前，先查当前成本是否已超上限；已超标应做减法，而不是继续加提醒。
2. **连续两周期超标即升级**：同一类任务连续两次超出目标，应修改协议而非继续口头强调。
3. **用证据管线的数据说话**：`adopted` 远低于 `total` 说明经验没被真正复用，优先改善召回质量，而不是继续新增条目。
4. **宿主能力单独核实**：钩子注册、ask/deny 消费、子代理调度语义、可用工具集与工作模式在不同宿主不同，不能凭配置文件推断，必须实测。
5. **按缺口补成员，不按想象补**：只有出现"现有成员职责边界内确实覆盖不到"的重复缺口时，才新增成员或新增宿主适配器。
6. **保持机制与角色的映射不被稀释**：新增成员时必须说明它对应哪个机制面；若找不到对应关系，说明该成员不该存在。

---

## 使用示例

- 用 Hello Dev 受控交付流程帮我完成一个改造任务：先确认边界和授权，再分解成可独立验证的子任务并按波次推进，最后给出带证据的交付结论。
- 把这份需求拆成可并行的子任务：标出依赖、波次顺序和每个任务会改哪些文件，并指出同波文件冲突需要降级串行的地方。
- 这次改动有没有被真正验证过？先列出它可能破坏的风险，再逐条给出构建、回归、行为和边界四层的实证，别只告诉我测试跑绿了。

## 头像

头像已自动生成在 `avatars/` 目录下。如需替换为自定义头像，要求：

- 格式：PNG（推荐）或 JPG
- 尺寸：512×512 px
- 大小：单张不超过 500KB

**暂无头像的成员**：`hello-dev-tool-researcher`、`hello-dev-implementer`、`hello-dev-recovery-registrar` 三个新成员暂无头像文件，其 `members[].avatar` **刻意留空**——这是对 `hello-dev-ux-designer` / `hello-dev-ui-designer` 既有先例的沿用（缺失头像只产生 warn，不阻断包合法）。不要为了消除可见性而编造指向不存在文件的路径。

## 安装

将专家包目录放到专家目录下：

```
<your-home>/.workbuddy/plugins/marketplaces/my-experts/plugins/hello-dev/
```

然后运行注册命令使其可见：

```bash
python3 scripts/register_expert.py <expert-dir>
```

## 打包分享

```bash
python3 scripts/package_expert.py <expert-dir>
```
