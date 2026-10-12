# Expert Package — Host: WorkBuddy

本目录是 **WorkBuddy** 宿主所用的 Hello Dev 受控交付专家包（`hello-dev`）的**源码副本**。

| 项目 | 值 |
|------|-----|
| 所属宿主 | **WorkBuddy** |
| 专家包名 | `hello-dev` |
| 专家版本 | `1.2.0` |
| 专家类型 | Team 型（1 主理人 + 14 团员） |
| 宿主市场目录 | `~/.workbuddy/plugins/marketplaces/my-experts/plugins/hello-dev/` |
| 本副本路径 | `expert-packages/workbuddy/hello-dev/` |

> **宿主归属说明**：Hello Dev 通过 Host Adapter 层跨宿主运行（WorkBuddy / Claude Code / CodeBuddy CLI / Codex），
> 本专家包的成员调度依赖 **WorkBuddy 的 Agent 工具**与 **TeamCreate / SendMessage** 机制，
> 因此归类到 `expert-packages/workbuddy/`。若需移植到其他宿主，需新建对应宿主目录并改写成员调度方式。

> **能力边界（必须如实转述）**：`Agent` / `TeamCreate` / `SendMessage` / `TaskCreate` / `TaskUpdate` /
> `TaskList` 是 WorkBuddy 的真实工具名，本机确有真实调用记录；但**可用工具集随工作模式变化**
> （例如 Minimal 模式下部分工具不可用），且以下三点在本机**尚未验证**：`subagent_type` 能否直接寻址
> 专家成员、`TeamCreate` 是否必须先于命名 Agent 调用、宿主是否真的消费 `ask` / `deny` 判决。
> 对外说明能力时必须带上这个边界，不得把"工具存在"讲成"机制已验证"。

## 生效说明

**本目录是源码（source of truth），仓库版本管理以它为准。** WorkBuddy 实际加载的是市场目录下的那一份：

```
~/.workbuddy/plugins/marketplaces/my-experts/plugins/hello-dev/
```

两份必须同时维护：改仓库源码不会自动生效，改市场副本会随宿主机重写而丢失。同步命令：

```bash
SRC="<repo-root>/expert-packages/workbuddy/hello-dev"
DST="$HOME/.workbuddy/plugins/marketplaces/my-experts/plugins/hello-dev"
# 仓库 -> 市场（发布改动）
rsync -a --delete "$SRC/" "$DST/"
# 市场 -> 仓库（捕获宿主机侧的漂移，先 diff 再决定是否回灌）
diff -rq "$DST" "$SRC"
# 然后在专家中心「我的专家」刷新/重新选择该专家
```

> **宿主会重写市场目录**：实测市场目录由 WorkBuddy 应用进程自行维护（曾一晚删除 `settings.json` 五次）。
> 因此**仓库源码才是完整副本**；一旦发现市场副本缺文件（尤其 `settings.json`），一律以仓库源码回灌。

## 两份副本的分工（实测）

WorkBuddy 会同时用到两个位置，二者不是同一件事，同步时要分别确认：

| 位置 | 作用 | 实测证据 |
|------|------|---------|
| `plugins/marketplaces/my-experts/plugins/hello-dev/` | 专家**定义**（`agents/*.md` 正文由此注入会话） | 会话记录里的 `Expert plugin path:` 指向此目录 |
| `plugins/cache/my-experts/hello-dev/<version>/` | 插件**安装副本**（宿主按 `installed_plugins.json` 的 `installPath` 记录） | 实测 `installPath` = `cache/my-experts/hello-dev/<version>`（实测时的示例版本号为 `1.1.1`，随安装版本变化） |

`installed_plugins.json` 记录的是安装时刻的快照，覆盖 marketplace 目录**不会**自动刷新 cache。
两份不一致时会形成"agent 正文已改、插件元数据未改"的错觉；改完两份都要核对。

> **未消除风险（实测，勿轻信"已同步"）**：实测 `cache/my-experts/hello-dev/<version>/`（实测时的版本为 `1.1.1`，仅作历史示例）**不含 `settings.json`**，
> 对它跑 `validate_expert.py` 会报 2 个 error（"不在专家目录下" + "Team type must have settings.json"）。
> 宿主究竟从 marketplace 还是 cache 读取 Team 型配置，**未在本机验证**。因此本仓库只保证
> **源码与 marketplace 两侧的完整性**（由 `check-expert-package.js` 看守）；cache 副本属宿主状态，
> 不在交付保证范围内。若专家团在专家中心加载异常，先核对 cache 副本是否缺 `settings.json`。

## 验证

```bash
SK="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/expert-manager"
# 对市场副本校验（应通过）
python3 "$SK/scripts/validate_expert.py" "$HOME/.workbuddy/plugins/marketplaces/my-experts/plugins/hello-dev"
# 期望：Expert package is valid!
```

> **选项 C（宿主状态）**：`$DST` 指向 `~/.workbuddy/plugins/marketplaces/...`，**由 WorkBuddy 应用进程
> 自行维护**，它会重写该目录。因此该命令**失败可能只反映宿主状态**，不代表源码包有缺陷。
> **源侧完整性以本仓库的 `scripts/check-expert-package.js` 为准**（只读 `$SRC`，宿主无法破坏它）。

注意三点，否则会得到假的失败或假的安心：

1. `validate_expert.py` 会检查"专家是否在专家目录下"。**对源码副本 `$SRC` 运行必然报
   `专家不在专家目录下`**——那是它的可发现性检查，不是包的缺陷。实测对 `$SRC` 运行的结果是
   **1 error（即该可发现性检查）+ 0 包缺陷**，这是正确结果。
2. 校验项包含"Team 型必须有 `settings.json`"。该文件缺失时 Team 型包**不合法**；曾出现过市场目录下
   `settings.json` 丢失导致校验失败的情况，同步后必须用上面的命令复核，不要凭印象判断。
3. 成员头像缺失只产生 **warn**（不是 error），不阻断包合法。本包中 `hello-dev-ui-designer` 与
   `hello-dev-ux-designer` 暂无头像文件，故其 `members[].avatar` 置为空串——不要为了消除可见性而
   编造指向不存在文件的路径。
