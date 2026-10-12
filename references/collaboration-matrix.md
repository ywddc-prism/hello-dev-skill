# Collaboration Matrix

> Four tables answer one core question: **When multiple participants exist in the system, who collaborates with whom, when, through what mechanism, and where are the boundaries.**
> This document is consistent with the actual behavior of `scripts/state.js`, `scripts/memory.js`, `references/automation-charter.md`,
> and is automatically validated by `scripts/check-collaboration-matrix.js`; structure drift fails the build while S4.2 drift against live detection is reported as a warning.

## 1. Stage x Approval Gate

Answers: **What checkpoints does this stage pass through? Which are automatic, which are manual?**

| Stage | checkpoint | module-approved | gitdec | ops | hook (git-gate/opsgate) |
|-------|------------|-----------------|--------|-----|---------------------------|
| bootstrap | Retrieve memory | - | - | - | - |
| initialization | Scope survey, Coarse decomposition plan | - | - | - | - |
| prototype | Prototype converged, Specifications extracted | - | - | - | - |
| tool-research | Tool research conclusion | - | - | - | - |
| learn | Learning summary | - | - | - | - |
| evolution | Evolution report | - | - | - | - |
| reflection | Agent reflection | - | - | - | - |
| archive | Archive complete | - | - | - | - |
| requirement | Requirement confirmed | - | - | - | - |
| feature-design | Module approval | Required | - | - | - |
| architecture | Module approval | Required | - | - | - |
| implementation | Code review | - | On commit | On ops | Every Bash |
| testing | Tests pass | - | - | - | Test scripts |
| review | Review pass | - | - | - | - |
| ship | Requires testing+review | - | On release | On deploy | Every Bash | prerequisite testing+review |

**Legend**:
- Check = This stage must pass through this gate
- Required = This stage has a hard prerequisite (feature-design/architecture require at least one module approved)
- On commit/release/deploy = Triggered when Git/ops operations are involved
- Every Bash = Hook intercepts every Bash invocation
- Test scripts/code review/review pass = Specific checkpoint names
- Retrieve memory/requirement confirmed = Specific checkpoint names
- Requires testing+review = Ship's hard prerequisite (state.js:189)
- On ops = Triggered when ops commands are executed
- - = This stage does not pass through this gate

**Data sources**:
- `scripts/lib/stages.js` STAGES constant (the single source; `state.js` requires it)
- `state.js:189` Ship prerequisite check
- `state-protocol.md:24-36` Completion conditions table
- `git-gate.md` Risk classification
- `ops-execution.md:42-80` Risk table
- `design-flow.md:18-31` Module approval flow

## 2. Stage x Memory Layer

Answers: **Which memory layers does this stage read/write?**

| Stage | L0 Episodic | L1 Working | L2 Episodic | L3 Semantic | L4 Procedural |
|-------|-------------|------------|-------------|-------------|---------------|
| bootstrap | - | R | R | R | R |
| initialization | W | W | R | - | - |
| prototype | W | W | - | R | R |
| tool-research | - | R | - | RW | R |
| learn | W | W | R | R | - |
| evolution | W | W | R | RW | - |
| reflection | W | W | - | R | R |
| archive | W | - | W | - | - |
| requirement | W | W | R | - | - |
| feature-design | W | W | - | R | R |
| architecture | W | W | - | RW | RW |
| implementation | W | W | R | R | R |
| testing | W | W | R | - | - |
| review | W | W | R | - | R |
| ship | - | - | W | - | - |

**Legend**:
- R = Read (recall)
- W = Write (add)
- RW = Read and write
- - = No interaction

**Data sources and implementation status**:
- `bootstrap.md:11,15` Claims to retrieve L2/L3/L4, but only L2 is actually invoked
- `ship.md:19` Writes to L2
- **Gap**: L0/L1/L3/L4 reads/writes are not invoked in stage files; documentation does not match implementation
- `memory.js:41` LAYERS constant
- `CLAUDE.md:71,251` Claims L0/L1/L3/L4 each have read/write timing

**Honest note**: The current implementation only has L2 read at Bootstrap and written at Ship. The other three layers are dangling. This table documents "what should be done", not "what is actually done". Fixing this gap requires adding corresponding `memory.js` calls in each stage file.

## 3. Stage x Deliverables

Answers: **What does this stage produce? What must the downstream consume?**

| Stage | Deliverable | Downstream must consume | Carrier |
|-------|-------------|------------------------|---------|
| bootstrap | Current state, scope, related documents, execution path | initialization | checkpoint `--reason` |
| initialization | Scope survey + coarse decomposition (units and their dependency order) | requirement | checkpoint `--reason` + `coarseDecomposition` |
| requirement | User-confirmed scope, execution authorization basis | tool-research / implementation | checkpoint `--reason` |
| tool-research | Open-source framework/tool research conclusions | feature-design | research comparison table |
| feature-design | Module design, submitted state | architecture | module status |
| architecture | Architecture decisions, constraints, approved modules | implementation | module status + checkpoint |
| implementation | Code changes, dev log | testing | Git commits + dev log |
| testing | Test pass evidence, four-layer verification | review | checkpoint `testing` pass |
| review | Review pass evidence | ship | checkpoint `review` pass |
| ship | Final report, L2 experience | - | checkpoint + memory |

**Gaps**:
- How Architecture constraints are "must follow" enforced by Implementation has no machine-checkable carrier
- Only checkpoint's `--reason` free text exists; no structured `constraints[]`
- `agents/cross-review.md` once designed "Stage N vs N-1 consistency check", now archived as historical draft

**Not fixing now**: This table only describes the current state, does not change `state.js` validation logic. Adding deliverable contracts requires adding a `constraints[]` field to checkpoint, and having state.js validate upstream constraints are acknowledged downstream.

## 4. skill x skill

Answers: **Which skill handles what scenario? Who takes priority in conflicts?**

### 4.1 Routing Rules (manually maintained, authoritative)

| skill | Trigger scenario | Priority | Relationship with other skills |
|---------|-----------------|----------|-------------------------------|
| hello-dev | All programming tasks (code, config, doc changes) | Highest | Mandatory process; other skills cannot bypass |
| grill-me | Questioning flow inside the requirement stage (plan stress-testing, decision-tree clarification) | Independent | Adopted as the **questioning discipline**, not as a stage: it shapes how the requirement stage asks, and cannot skip stages, logs, Testing, or Review. Its one-question-at-a-time rate is a repo decision; the `grill-me-pro` fork stays `unclassified` (it sets `disable-model-invocation: true`, so the model cannot invoke it, and its batch-per-round mechanism contradicts that rate) |
| ui-ux-pro-max | Frontend design specifications as a **pre-prototype** supplier (design tokens, component specs, layout blueprint, implementation notes) | Independent | Complements the prototype stage, does not replace it: it produces design specs *before* the prototype is built (a priori); the prototype stage still builds the runnable artifact and validates / extracts tokens from it (a posteriori). Cannot skip stages, logs, Testing, or Review. |
| hermes-agent-self-evolution | Self-optimization, strategy evolution | Independent | No priority relationship with hello-dev; no conflict |
| lark-* | Lark API operations | Independent | No intersection with hello-dev; see 4.2 detection table for counts |
| va-* | Preview and session context (preview service, session ID) | Independent | Typically called on demand during hello-dev delivery phase; does not change its process gates |
| vibearound | Session handoff to phone or other device | Independent | No priority relationship with hello-dev; handoff does not transfer task authorization |
| plugin:* | Skills installed from plugin marketplace (including `anthropic-skills:*` namespace) | Independent | No priority relationship with this repo's process; not in detection table when host is not installed |
| unclassified | New skills without registered routing rules | Independent | Detector uses this label as fallback only; **does not assume responsibilities for it** |

**Data sources**:
- `~/.claude/CLAUDE.md:11-23` Keyword trigger table
- `~/.claude/CLAUDE.md:126-138` Task routing table
- 4.1 first column labels are verified verbatim against `scripts/detect-skills.js` `RULES` table (validated by `check-collaboration-matrix.js`)

**Gaps**:
- `~/.claude/CLAUDE.md` and `SKILL.md` are two authoritative sources that need manual synchronization
- No automated script checks consistency of process descriptions between the two files
- `hermes-agent-self-evolution` and `hello-dev` have no priority, mutual exclusion, or handoff rules

**Not fixing now**: This table only describes the current state, does not change `~/.claude/CLAUDE.md` routing table. Unifying routing requires creating `references/skill-routing.md` in the repo, declaring priority and handoff rules.

### 4.2 Detected Skills (auto-generated)

`scripts/detect-skills.js` scans host load points and generates the table below. **It is a detection checklist, not an authorization checklist**:
Appearing in the table does not mean this task can use, invoke, or approve it.

**Detection scope and boundaries**:
- Covers `~/.claude/skills/`, project `.claude/skills/`, `~/.claude/plugins/marketplaces/<market>/<plugins|external_plugins>/<plugin>/skills/`, `~/.claude/plugins/cache/<market>/<plugin>/<version>/skills/`
- **Dereferences symlinks** then deduplicates by real path (local `~/.claude/skills/` are all symlinks; filtering by `isDirectory()` would yield 0; repo directory linked into skills/ counts as one entry, sources merged)
- Excludes `*.bak` backup directories; entries without `SKILL.md` or broken links are logged to diagnostics rather than counted in the table
- **Does not cover**: Host built-in, remotely delivered, uninstalled marketplace entries (local panel lists `anthropic-skills:*`, `dataviz` etc. but no corresponding files on disk, so not in table)
- Re-run `node scripts/detect-skills.js --write` after changing machines or installing new skills; `self-check` cross-checks live detection and reports drift as a warning (structure drift still fails)

<!-- BEGIN GENERATED: skills -->
> Generated by `node scripts/detect-skills.js --write`; do not edit manually; consistency validated by `scripts/check-collaboration-matrix.js`.
> Detected on 2026-10-11 | 45 after dedup (bundled 2 / plugin:ardot 7 / plugin:finance-data 4 / plugin:ima-mcp 1 / plugin:sheetagent 2 / plugin:tencent-docs-plugin 2 / plugin:tencent-docx 8 / plugin:tencent-pptx 1 / plugin:weixinpay 3 / user 1 / user:workbuddy 14)

| skill | source | trigger (frontmatter summary) | applicable rule |
|-------|--------|-------------------------------|-----------------|
| `hello-dev` | user | Govern code, configuration, and development-docu... | hello-dev |
| `grill-me` | bundled | Interview the user relentlessly about a plan or ... | grill-me |
| `ui-ux-pro-max-skill` | bundled | 将需求转化为结构化UI方案，输出可落地的设计规范与前端实现指引。 | ui-ux-pro-max |
| `ardot-design-core` | plugin:ardot | Foundational workflow and hard rules shared by A... | plugin:* |
| `ardot-design-to-code` | plugin:ardot | Use this skill for Ardot canvas tasks that conve... | plugin:* |
| `ardot-poster` | plugin:ardot | Use this skill for Ardot canvas design tasks who... | plugin:* |
| `ardot-slides` | plugin:ardot | Use this skill for Ardot canvas design tasks who... | plugin:* |
| `ardot-ui-design` | plugin:ardot | Use this skill for Ardot canvas design tasks who... | plugin:* |
| `design-router` | plugin:ardot | Dispatcher for WorkBuddy's Design assistant. Use... | plugin:* |
| `livestream-poster` | plugin:ardot | 生成直播宣传海报：支持完整风格文件、风格目录静默匹配和用户风格参考图三种工作流，收集人物、Log... | plugin:* |
| `neodata-financial-search` | plugin:finance-data | NeoData Financial Search — 自然语言通用金融数据搜索服务。用自然语言查... | plugin:* |
| `wb-finance-skill` | plugin:finance-data | 金融/投资/股票/基金/ETF/板块/指数/宏观/外汇/大宗商品/财报/估值/持仓/交易/量化/... | plugin:* |
| `westock-data` | plugin:finance-data | 金融市场结构化数据查询的权威入口。支持股票（A股/港股/美股/日韩股）、ETF、指数、板块、期货... | plugin:* |
| `westock-tool` | plugin:finance-data | 选股 / 选基工具——按条件、策略、标签、事件、排行从全市场批量筛选股票或 ETF。当用户问"找... | plugin:* |
| `ima-mcp` | plugin:ima-mcp | ima - 腾讯AI知识管家个人版，用于搜索、读取和写入个人账号下的知识库（含"问我的知识库"、... | plugin:* |
| `tencent-docs-sheet-generation` | plugin:sheetagent | 生成一份全新的 Excel/xlsx 工作簿。触发条件是**意图为"生成新表"**——用户明确请... | plugin:* |
| `tencent-docs-sheetagent` | plugin:sheetagent | 编辑、查询、分析、清洗、透视、排序、筛选、格式化既有 Excel/xlsx/xls/csv 表格... | plugin:* |
| `tencent-docs` | plugin:tencent-docs-plugin | 腾讯文档个人版（docs.qq.com）-在线云文档平台，是创建、编辑、管理文档的首选 skil... | plugin:* |
| `tencent-saas-docs` | plugin:tencent-docs-plugin | 腾讯文档企业版（saas.docs.qq.com）及 WorkBuddy 资料库文档（www.w... | plugin:* |
| `brief-compose` | plugin:tencent-docx | 短篇文档创作（目标篇幅 <1000 字）：从零撰稿 → 生成 HTML → html-to-do... | plugin:* |
| `design-token` | plugin:tencent-docx | 按文档类型（genre）选择主题并输出标准化设计令牌（Design Tokens），驱动 doc... | plugin:* |
| `doc-typeset` | plugin:tencent-docx | 消费 design tokens + 文档内容，输出排版美化的 HTML。 内置 7 种垂类模板... | plugin:* |
| `format-extract` | plugin:tencent-docx | 把 .docx 文档转为语义化 HTML + 提取内嵌图片（标题层级、表格样式、段落缩进、字体颜... | plugin:* |
| `generate-fillable-contract-html` | plugin:tencent-docx | 生成适于 HTML 转 DOCX 的中文待填合同、报价单和授权委托书 HTML。用户要求创建待填... | plugin:* |
| `html-review` | plugin:tencent-docx | HTML 质量门禁 skill（路线 A + 路线 B 共享）。对 doc-typeset（路线... | plugin:* |
| `html-to-docx` | plugin:tencent-docx | 将 HTML 字符串或文件高保真转换为 Microsoft Word (.docx) 文档。 支... | plugin:* |
| `tdoc-orchestrator` | plugin:tencent-docx | 文档创作与美化的统一编排入口（本地通道）。当用户意图涉及文档写作或排版美化时调用。职责：识别意图... | plugin:* |
| `tencent-pptx` | plugin:tencent-pptx | 创建、理解与编辑专业的 PowerPoint 演示文稿。适用于根据主题、大纲、文档、数据或参考材... | plugin:* |
| `weixinpay-feedback` | plugin:weixinpay | 【微信支付官方】问题反馈。当用户使用微信AI支付/AI专属卡的开通/绑定或支付/管理过程遇到异常... | plugin:* |
| `weixinpay-pay` | plugin:weixinpay | 【微信支付官方】微信支付AI专属卡支付能力。普通支付在商户下单后由系统自动触发工程化支付卡片，无... | plugin:* |
| `weixinpay-register` | plugin:weixinpay | 【微信支付官方】用于用户开通/绑定微信AI支付或者AI专属卡功能，或查询开通/绑定状态。用于用户... | plugin:* |
| `browser-skill` | user:workbuddy | Use when the user asks to automate their logged-... | unclassified |
| `burp-suite` | user:workbuddy | (no description) | unclassified |
| `cangjie-skill` | user:workbuddy | Distill a book, long-video transcript, podcast, ... | unclassified |
| `hello-dev` | user:workbuddy | Development enhancement framework with staged ex... | hello-dev |
| `drawio` | user:workbuddy | This skill should be used when users need to cre... | unclassified |
| `frontend-dev` | user:workbuddy | Full-stack frontend development combining premiu... | unclassified |
| `fullstack-dev` | user:workbuddy | Full-stack backend architecture and frontend-bac... | unclassified |
| `grill-me` | user:workbuddy | Interview the user relentlessly about a plan or ... | grill-me |
| `grill-me-pro` | user:workbuddy | 动手前拷问计划（Plan Grilling）。把模糊想法、方案、业务构思在开工前彻底想清楚：将计... | unclassified |
| `ima-skills` | user:workbuddy | (no description) | unclassified |
| `magic-hand-windows` | user:workbuddy | Windows 桌面操控（Computer Use）：让 AI 亲手操作本机应用。原生 Win3... | unclassified |
| `pentest-assistant` | user:workbuddy | (no description) | unclassified |
| `ppt-generator` | user:workbuddy | PPT 生成套件，覆盖 AI 配图演示、标准 PPTX（11种版式）、解决方案框架 PPT 与网... | unclassified |
| `ui-ux-pro-max-skill` | user:workbuddy | 将需求转化为结构化UI方案，输出可落地的设计规范与前端实现指引。 | ui-ux-pro-max |
<!-- END GENERATED: skills -->

**Table column meanings**: `source` is the detection root (`user` / `project` / `plugin:<plugin name>`); `trigger scenario` is the frontmatter `description` summary, **which is the skill's self-declaration, not this framework's authorization or routing decision**; `applicable rule` is the 4.1 label, `unclassified` means the skill has no manually registered routing rules yet.

## 5. Validation and Consistency

This document is automatically validated by `scripts/check-collaboration-matrix.js` to ensure consistency with implementation:

```bash
node scripts/check-collaboration-matrix.js
```

**What is validated**:
- Stage names in `state.js` STAGES
- Memory layers in `memory.js` LAYERS
- Gate descriptions match `state-protocol.md`, `git-gate.md`, `ops-execution.md`
- Ship's hard prerequisite (testing+review) is labeled
- 4.1 / 4.2 headings match contract headings verbatim (prefix matching would let headings be silently rewritten)
- 4.2 generated block **structure**: no extra lines outside table, no duplicate entries, summary count matches table row count
- 4.2 generated block cross-checks with live detection results item by item (name, source, applicable rule); a mismatch is reported as a warning, not a failure
- 4.1 routing labels cross-check bidirectionally with detector `RULES` table -- **including the `unclassified` fallback label, without exemption**
  (adding/removing on either side without updating the other fails)

`--doc <path>` can specify the document to validate; tests use this to check copies rather than the real document.

**Not validated**:
- "What should be done" vs "what is actually done" (whether memory layer reads/writes are actually invoked in stage files)
- Skill routing actual behavior (whether `~/.claude/CLAUDE.md` really only recognizes hello-dev)

**Section 4 degradation semantics (detection depends on local disk; validation must be explicit)**:

Section 4.2 is a checklist **generated on one machine, committed to version control**. Switching machines will almost certainly not match -- that's not documentation drift, it's different skill sets on different machines. Therefore validation distinguishes three "detection count is 0" cases:

| Situation | Verdict | Reason |
|-----------|---------|--------|
| All skill roots do not exist (new machine, bare environment) | SKIP, exit 0 | No basis for judgment on this machine |
| Roots exist but have no directory entries (empty directories) | SKIP, exit 0 | Same as above |
| Roots exist, have entries, but resolve to 0 skills | **FAIL** | Symptom of symlinks being filtered incorrectly; the defect to catch |
| Skills detected but do not match document checklist | **WARN**, exit 0, with refresh command | Real checklist drift, but the block is machine-generated: exact agreement is impossible for any reader but the author, and a permanently-red guard teaches readers to ignore the suite |

- Detector output includes `roots[]` diagnostics (existence, entry count, parsed skill count for each root), to distinguish "root not present" from "root present but no skills parsed"
- Uninstalled marketplace entries on this machine are not in detection scope, so **empty table does not mean host has no skills**
- These three tiers are covered by regression tests in `scripts/test-detect-skills.js` section 7 (tested: early versions judged the first tier as failure, which would cause false failures on new machines)

To upgrade to full validation, additional work is needed:
1. Parse stage files, extract `memory.js` calls, cross-check with Section 2 table
2. Parse `~/.claude/CLAUDE.md`, extract skill mentions, cross-check with Section 4.1 table

## 6. Related

- State protocol: [state-protocol.md](../modules/core/state-protocol.md)
- Automation charter: [automation-charter.md](automation-charter.md)
- Git gate: [git-gate.md](../modules/core/approval/git-gate.md)
- Ops execution: [ops-execution.md](../modules/core/approval/ops-execution.md)
- Design approval: [design-flow.md](../modules/core/approval/design-flow.md)
- Memory system: [SKILL.md](../SKILL.md) Memory section
