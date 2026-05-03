# Yjs CRDT Collab Demo

> Minimal real-time collaborative editor demo showing how **Yjs CRDT + Hocuspocus + WebSocket** sync edits across multiple browsers in real time.

[中文 README →](./README.md)

## What this demo shows

Open two browser tabs → type into either textarea → edits sync instantly with **zero conflict-resolution code** (CRDT auto-merges).

**Architecture:**

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

## Why I built this

During my internship at botoolai I worked on a similar real-time collaboration feature (multi-user PPT editor). The team chose **Yjs CRDT + Hocuspocus + Supabase Realtime** as a dual-channel architecture (same pattern as Microsoft Office Online / Google Docs / Figma).

This demo is a **clean-room rewrite stripped of all company-specific code**, built to:

1. **Verify my understanding of Yjs / Hocuspocus internals** (not just API-level usage)
2. **Serve as a portable, demonstrable artifact during interviews** ("I worked on CRDT collaboration" is no longer a verbal claim)
3. **Practice esm.sh CDN-based ESM consumption** (zero-build minimal stack)

## Stack

- **Yjs 13.6** — CRDT data structures (Y.Text for shared text)
- **y-websocket 2.0** — Yjs standard WebSocket provider (client side)
- **@hocuspocus/server 3.4** — Production-grade Yjs WebSocket server, with:
  - Database extension (persistence)
  - Authentication hooks
  - onChange / onConnect / onDisconnect lifecycle
- **Zero build**: HTML uses `<script type="module">` + esm.sh CDN

## Run

```bash
# 1. Install deps
pnpm install
# or npm install

# 2. Start Hocuspocus server (port 1234)
node server.mjs

# 3. Serve the static client (in another terminal)
npx serve client -p 5173

# 4. Open two browser tabs
open http://localhost:5173
open http://localhost:5173
```

Type in either tab — edits sync in real time, and the peer list at top shows who's online.

## Where to look in the code

| File | What it shows |
|---|---|
| `server.mjs` | Minimal Hocuspocus server config (~30 lines) |
| `client/index.html` | Y.Text ↔ textarea two-way binding + awareness broadcast (~80 lines JS) |

## What I learned building this

1. **Y.Text suits text scenarios better than Y.Map** — Y.Text internally maintains an ordered list of items, supporting efficient character-level ops; Y.Map would broadcast the entire string on each set.

2. **The observe callback needs a feedback-loop guard** — Local edit → input event → Y.Text update → observe fires → updates textarea again → infinite loop. Code uses `applyingRemote` flag plus `document.activeElement` check to break it.

3. **Awareness is ephemeral** — Only broadcast while clients are connected; vanishes on disconnect. Y.Doc persistence needs `@hocuspocus/extension-database` or a custom `onLoadDocument` hook.

4. **CRDT needs no server-side arbitration** — The server only forwards and optionally persists; conflict resolution is fully algorithmic (based on client ID + Lamport-like operation clock). Two clients editing the same position simultaneously? CRDT decides order deterministically.

## End-to-end latency budget (P50 estimate)

```
client A keypress → Y.Text op (~5ms)
  → WebSocket frame → Hocuspocus (~10-20ms incl. relay)
    → broadcast → client B WebSocket frame
      → Y.Doc apply (~5-10ms)
        → observe → DOM update (~5ms)
```

Total: **P50 ~60-130ms within a single region**, ~200-300ms cross-region (e.g., China ↔ US).

## License

MIT
