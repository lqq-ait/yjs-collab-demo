# Yjs CRDT Collab Demo

> 一个最小可用的实时协作编辑器 Demo，演示 **Yjs CRDT + Hocuspocus + WebSocket** 在浏览器多端实时同步的工作原理。

[English version →](./README_EN.md)

## 这个 Demo 演示什么

打开两个浏览器标签 → 同时在 textarea 输入文字 → 编辑实时同步 + 不需要任何冲突解决代码（CRDT 自动 merge）。

**架构**：

```
[Browser Tab A] ──┐
                  │  WebSocket (y-websocket protocol)
                  ├──→ [Hocuspocus Server :1234]
                  │       ↓
[Browser Tab B] ──┘   in-memory Y.Doc per room
                      ↓
                  awareness broadcast
                  (presence + color identity)
```

## 为什么写这个

我在 botoolai 实习期间负责类似的实时协作功能（PPT 编辑器的多人协同），团队选型用 Yjs CRDT + Hocuspocus + Supabase Realtime 双通道架构（与 Microsoft Office Online / Google Docs / Figma 同款思路）。

这个 Demo 是我**剥离公司业务代码、独立从零实现**的最小版本，用于：

1. **验证我对 Yjs / Hocuspocus 工作原理的理解**（不是只会调 API）
2. **作为面试时的可演示作品**（"我做过 CRDT 协作"不再是空口说）
3. **学习 esm.sh CDN 直接消费 ESM 模块**（无 build 工具链的极简栈）

## 技术栈

- **Yjs 13.6** — CRDT 数据结构（Y.Text 用于共享文本）
- **y-websocket 2.0** — Yjs 标准 WebSocket Provider（client 侧）
- **@hocuspocus/server 3.4** — 生产级 Yjs WebSocket Server，比 demo 级 y-websocket-server 多了：
  - Database extension（持久化）
  - Authentication hook（鉴权）
  - onChange / onConnect / onDisconnect 生命周期 hook
- **零 build**：HTML 直接 `<script type="module">` + esm.sh CDN 加载 Yjs

## 运行

```bash
# 1. 装依赖
pnpm install
# 或 npm install

# 2. 启动 Hocuspocus server (port 1234)
node server.mjs

# 3. 用任意静态 server 跑前端（另开一个终端）
npx serve client -p 5173

# 4. 浏览器打开两个标签
open http://localhost:5173
open http://localhost:5173
```

在两个标签里同时输入，就能看到实时同步 + 上方 peer 列表显示对方在线。

## 关键代码看哪里

| 文件 | 看什么 |
|---|---|
| `server.mjs` | Hocuspocus Server 最小配置（30 行）|
| `client/index.html` | Y.Text ↔ textarea 双向绑定 + awareness 广播（~80 行 JS）|

## 我从这个 Demo 学到的

1. **Yjs Y.Text 比 Y.Map 更适合文本场景** — Y.Text 内部是 ordered list of items，支持高效字符级 op；Y.Map 整个 string set 会 broadcast 整段。
2. **observe 回调要防 feedback loop** — 本端写 textarea → input event → 改 Y.Text → observe 触发 → 又改 textarea，会形成循环。代码里用 `applyingRemote` flag + `document.activeElement` 判定切断。
3. **Awareness 不持久化** — 只在 client 在线时广播，断线即消失。Y.Doc 持久化要用 `@hocuspocus/extension-database` 或自己写 onLoadDocument hook。
4. **CRDT 不需要 server 仲裁** — server 只做转发 + 持久化，不做冲突解决。两端同时编辑同一字符位置，CRDT 算法自动决定顺序（基于 client ID + 操作时钟）。

## 性能延迟构成（端到端 P50 估算）

```
client A 输入 → Y.Text op (~5ms)
  → WebSocket frame → Hocuspocus (~10-20ms 含转发)
    → broadcast → client B WebSocket frame
      → Y.Doc apply (~5-10ms)
        → observe → DOM update (~5ms)
```

合计：**单 region 内 P50 在 60-130ms 量级**，跨 region (中美) 约 200-300ms。

## License

MIT
