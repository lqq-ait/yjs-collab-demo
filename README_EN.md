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
- **@hocuspocus/provider 3.4** — Official Hocuspocus client (browser side)
- **@hocuspocus/server 3.4** — Production-grade Yjs WebSocket server, with:
  - Database extension (persistence)
  - Authentication hooks
  - onChange / onConnect / onDisconnect lifecycle
- **Zero build**: HTML uses `<script type="module">` + esm.sh CDN

> **Why not `y-websocket` on the client** — I tried it; the very first sync
> message threw `Unexpected end of array`. Hocuspocus extends standard
> y-protocols with stateless / auth frames that y-websocket doesn't recognize.
> No upstream warning — you only find out by running it. The matched pair is
> **@hocuspocus/provider ↔ @hocuspocus/server**; even at the cost of a
> heavier client bundle, use the official one. This gotcha is now pinned in
> `test/browser-shape.test.mjs` to prevent regression.

## Run

### One-shot (recommended)

```bash
npm install
npm start              # Spawns server :1234 + client :5173 in parallel, color-prefixed logs
```

Open http://localhost:5173 in two browser tabs. Start typing — edits sync live and the peer list shows who's online.

### Run separately (for debugging)

```bash
npm run server         # Hocuspocus only (:1234)
npm run client         # Static client only (:5173)
```

### Ports

| Port | Purpose | Used by |
|---|---|---|
| `1234` | Hocuspocus WebSocket | `server.mjs` (dev) |
| `1235` | Hocuspocus WebSocket | `test/sync.test.mjs` (isolated test instance) |
| `5173` | Static client | `npx serve client` |

You can run tests **without stopping the dev server** — tests use port 1235.

## Tests

```bash
npm test               # CRDT unit tests against an isolated server :1235, ~700ms
npm run test:browser   # End-to-end against running dev server :1234 — start dev first
```

### `npm test` matrix (4 cases, isolated server)

Uses `node:test` + `@hocuspocus/provider`, no jest/mocha:

| # | Scenario | CRDT property verified |
|---|---|---|
| 1 | A writes → B receives | One-way real-time sync |
| 2 | A prepends, B appends concurrently | Concurrent convergence (no split-brain, both peers end up identical) |
| 3 | B disconnects, both edit, B reconnects | Offline buffer + auto-merge on reconnect, no data loss |
| 4 | Two-peer awareness + one leaves | Live presence count reflects actual connections |

### `npm run test:browser` matrix (2 cases, hits dev server)

Uses the same client library `client/index.html` loads, proving "open two
browser tabs and it works" is not a verbal claim. Auto-skips when dev is
not running.

| # | Scenario | What it proves |
|---|---|---|
| 5 | Two HocuspocusProvider clients sync text via dev server | Wire protocol matches between browser-shape client and our server |
| 6 | Two clients exchange awareness | Presence broadcast across the actual dev pipeline |

## Where to look in the code

| File | What it shows | Lines |
|---|---|---|
| `server.mjs` | Minimal Hocuspocus server (onConnect / onChange hooks) | 30 |
| `client/index.html` | Y.Text ↔ textarea two-way binding + awareness + importmap | ~90 JS |
| `test/sync.test.mjs` | 4 CRDT unit tests (isolated server :1235) | ~180 |
| `test/browser-shape.test.mjs` | 2 end-to-end checks against dev server (:1234) | ~95 |

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
