# Web Locker

[English](#english) · [简体中文](#简体中文)

---

## 简体中文

一个为 **DSH Web UI** 设计的闲置锁屏插件。鼠标 / 键盘无操作超过设定阈值（默认 15 分钟）后，或点击侧边栏「锁定屏幕」按钮，整个 Web 界面会被一层**视觉遮罩**盖住，防止旁人窥屏。

### 它不是什么

> Web Locker 是**纯视觉遮罩（anti-peek）**，不是权限锁。

- 它**不**修改 Host 运行时、不阻断会话日志、不暂停任何 Agent 或工具执行。锁屏期间，后台工作（对话、子 Agent、定时任务）照常运行。
- 它**不**提供真正的安全访问控制：解锁密码仅存在于浏览器 `localStorage`，且遮罩层可以被有意的用户通过浏览器开发者工具绕过。它防的是「路过的人瞄一眼屏幕」，不是「防范有恶意的本地用户」。

### 功能

- 闲置自动锁屏（可配置阈值，0 = 关闭）。
- 手动锁屏：侧边栏底部「锁定屏幕」按钮。
- 切走标签页 / 窗口即锁（`visibilitychange` + `blur`）。
- 可选解锁密码：
  - **留空** → 点击任意处或按任意键即可解锁。
  - **已设置** → 需输入正确密码（输入框自动聚焦）。
- 锁屏界面可选显示当前时间。
- 中英文界面（跟随系统语言）。

### 配置项（设置 → Web Locker）

| 选项 | 说明 | 默认 |
|---|---|---|
| 闲置锁定阈值（秒） | 无操作后自动锁屏的秒数；0 关闭自动锁 | `900`（15 分钟） |
| 解锁密码 | 留空则点击/按键解锁；设置后需输密码 | 空 |
| 切走标签页即锁定 | 切换到其他标签页或窗口时立即锁定 | 开 |
| 锁屏显示时钟 | 锁屏界面显示当前时间 | 开 |
| 显示手动锁按钮 | 侧边栏底部显示「锁定屏幕」 | 开 |

配置保存在浏览器 `localStorage` 键 `dsh-web-locker.config.v1`，按浏览器实例生效。

### 安装

#### 方式 A：从插件市场（推荐，普通用户）

1. 打开 DSH Web 侧栏 **Plugins → Experimental → Custom plugin markets**，开启自定义市场。
2. 在 **Discover** 中添加索引 URL：

   ```
   https://raw.githubusercontent.com/CLY88/dsh-web-locker/master/market-index.json
   ```

3. 找到 **Web Locker**，一键安装。安装走 Git 钉（commit `ac7a291b1e077d00f8072fb86ddda0b8c1691e46`，目录 `dsh-web-locker`），自动拉取源码。

#### 方式 B：本地开发 / 源码安装

```bash
# 在 DSH profile 目录下用 plugin_manager 安装本地目录
plugin_manager install_bundle "<workspace>/dsh-web-locker"
```

或把本目录软链进 profile 的 `node_modules` 并加入 `dsh.profile.bundles: ["dsh-web-locker"]`。

安装后刷新 Web 页面即可生效。

### 技术要点

- **Client-only 插件**：Host 半 `index.js` 为空 `apply()`；UI 逻辑全部在 `client.js`，通过 `window.__ModuleLoader__` 懒加载。
- **修复 z-index 顺序问题**：锁屏通过 `ReactDOM.createPortal(node, document.body)` 渲染到 `body`，与设置面板（同样 portal 到 `body`）处于同一层叠上下文，保证锁屏始终盖在设置层之上（`z-index: 2147483647`）。直接挂在 `shell.overlay` 会落在 `#root` 应用子树内，被 `body` 级弹窗压在下面。
- **零性能负担（已复核）**：未锁定时仅一个 `setTimeout` + 7 个 passive 活动监听；锁定时仅当开启时钟才有一个 1s 定时器；组件卸载时全部清理。
- **语言**：通过 `ctx.locale.register('web-locker', 'en'|'zh', …)` + `ctx.locale.bind` 接入宿主语言服务。

### 文件结构

```
dsh-web-locker/
├── package.json          # name: dsh-web-locker，声明 client 注入点
├── cordis.patch.yml      # bundle 行：id / name = dsh-web-locker
├── index.js              # Host 半（空）
├── client.js             # Client 半数：遮罩、按钮、设置、样式
├── icon.svg              # 市场图标
├── locale/en.json        # 英文文案（市场展示用）
├── locale/zh.json        # 中文文案（市场展示用）
└── market-index.json     # 插件市场索引（format 1）
```

---

## English

A DSH Web UI idle-lock plugin. After a configurable period of mouse/keyboard
inactivity (default 15 minutes), or via a manual "Lock screen" button in the
sidebar, the whole Web UI is covered by a **visual occlusion overlay** so a
passer-by cannot read the screen.

### What it is NOT

> Web Locker is a **pure visual screen-occlusion (anti-peek) overlay**, not an
> access-control lock.

- It does **not** touch the Host runtime, the session log, or pause any Agent
  or tool execution. Background work (conversations, sub-agents, timers) keeps
  running while the screen is covered.
- It provides **no real security**: the unlock password lives only in browser
  `localStorage`, and the overlay can be bypassed by a determined user via the
  browser devtools. It protects against *someone glancing at your screen*, not
  against *a malicious local user*.

### Features

- Idle auto-lock (configurable threshold; `0` disables).
- Manual lock: "Lock screen" button in the sidebar footer.
- Lock when you switch tabs/windows (`visibilitychange` + `blur`).
- Optional unlock password:
  - **Empty** → click anywhere or press any key to unlock.
  - **Set** → correct password required (input auto-focused).
- Optional clock on the lock screen.
- English / 简体中文 UI (follows system locale).

### Settings (Settings → Web Locker)

| Option | Description | Default |
|---|---|---|
| Idle lock timeout (s) | Auto-lock after this many idle seconds; `0` disables | `900` |
| Unlock password | Empty = click/keypress unlock; set = password required | empty |
| Lock when tab loses focus | Lock immediately on tab/window switch | on |
| Show clock on lock screen | Display current time while locked | on |
| Show manual lock button | Add "Lock screen" to the sidebar footer | on |

Config is stored in browser `localStorage` under `dsh-web-locker.config.v1`,
per browser profile.

### Install

#### Option A: From the plugin market (recommended)

1. Open the DSH Web sidebar **Plugins → Experimental → Custom plugin markets**
   and enable custom markets.
2. In **Discover**, add the index URL:

   ```
   https://raw.githubusercontent.com/CLY88/dsh-web-locker/master/market-index.json
   ```

3. Find **Web Locker** and install. Install uses a Git pin (commit
   `ac7a291b1e077d00f8072fb86ddda0b8c1691e46`, directory `dsh-web-locker`).

#### Option B: Local / source install

```bash
plugin_manager install_bundle "<workspace>/dsh-web-locker"
```

Or symlink this directory into the profile `node_modules` and add
`dsh.profile.bundles: ["dsh-web-locker"]`. Refresh the Web page afterwards.

### Implementation notes

- **Client-only bundle**: the Host half `index.js` is an empty `apply()`; all
  UI lives in `client.js`, lazy-loaded via `window.__ModuleLoader__`.
- **z-index fix**: the overlay is `ReactDOM.createPortal(node, document.body)`
  so it shares the stacking context with body-level modals (e.g. Settings, also
  portaled to `body`), keeping the lock screen above them
  (`z-index: 2147483647`). A raw `shell.overlay` entry sits inside the `#root`
  app subtree and is painted under body-level modals.
- **No meaningful load (verified)**: unlocked = one `setTimeout` + 7 passive
  listeners; locked = only a 1s timer if the clock is on; fully cleaned up on
  unmount.
- **Locale** via `ctx.locale.register('web-locker', 'en'|'zh', …)` +
  `ctx.locale.bind`.

### License

MIT — free to use, modify, and redistribute.
