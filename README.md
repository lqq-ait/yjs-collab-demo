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
- **@hocuspocus/provider 3.4** — Hocuspocus 官方 client（client 侧）
- **@hocuspocus/server 3.4** — 生产级 Yjs WebSocket Server：
  - Database extension（持久化）
  - Authentication hook（鉴权）
  - onChange / onConnect / onDisconnect 生命周期 hook
- **零 build**：HTML 直接 `<script type="module">` + esm.sh CDN 加载 Yjs

> **为什么 client 不用 `y-websocket`** —— 试过，第一个 sync message 就抛 `Unexpected end of array`。
> Hocuspocus 在标准 y-protocols 之外扩展了 stateless / auth 帧，y-websocket 不识别。
> 官方文档没明显警告，需要自己跑出来才知道。
> 所以正确配对是 **@hocuspocus/provider ↔ @hocuspocus/server**，client 端再轻量也得选官方 client。
> 这件事写进了测试 (`test/browser-shape.test.mjs`)，防止以后回退。

## 运行

### 一键启动（推荐）

```bash
npm install
npm start              # server :1234 + client :5173 并行起，前缀色区分日志
```

打开 http://localhost:5173（再开一个标签同样地址），开始打字就能看到实时同步 + 顶部 peer 列表显示对方在线。

### 分开起（调试用）

```bash
npm run server         # 只跑 Hocuspocus server (:1234)
npm run client         # 只跑前端静态文件 (:5173)
```

### 端口

| 端口 | 用途 | 谁占用 |
|---|---|---|
| `1234` | Hocuspocus WebSocket | `server.mjs` (dev) |
| `1235` | Hocuspocus WebSocket | `test/sync.test.mjs` 临时实例（隔离 dev）|
| `5173` | 静态前端 | `npx serve client` |

dev 跑测试**不需要先停 server**：测试用 1235 独立端口，互不干扰。

## 自动化测试

```bash
npm test               # 跑 sync 单元测试（独立 server :1235），~700ms
npm run test:browser   # 命中 dev server :1234，需要先 npm start
```

### `npm test` 覆盖矩阵（4 条，独立 server）

用 `node:test` + `@hocuspocus/provider`，不依赖 jest/mocha：

| # | 场景 | 验证的 CRDT 性质 |
|---|---|---|
| 1 | A 写 → B 收 | 单向实时同步 |
| 2 | A 头插、B 尾插同时发生 | 并发收敛（无 split-brain，两端最终一致）|
| 3 | B 离线本地编辑 → 重连 | 离线 buffer + 重连自动 merge，无数据丢失 |
| 4 | 双端 awareness 状态 + 一端退出 | 在线人数、presence 实时反映 |

### `npm run test:browser` 覆盖（2 条，命中 dev server）

针对 `client/index.html` 实际加载的库做端到端验证，证明"打开浏览器双 tab 就能用"不是空话。dev server 没起会自动 skip。

| # | 场景 | 性质 |
|---|---|---|
| 5 | 两个 HocuspocusProvider client 经由 dev server 同步文本 | 与浏览器同协议链路通 |
| 6 | 两个 client awareness 互见 | presence 跨实例广播 |

## 关键代码看哪里

| 文件 | 看什么 | 行数 |
|---|---|---|
| `server.mjs` | Hocuspocus Server 最小配置（onConnect / onChange hook）| 30 |
| `client/index.html` | Y.Text ↔ textarea 双向绑定 + awareness 广播 + importmap | ~90 行 JS |
| `test/sync.test.mjs` | 4 条 CRDT 单元测试（隔离 server :1235） | ~180 |
| `test/browser-shape.test.mjs` | 2 条端到端 dev server 验证（命中 :1234） | ~95 |

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
