/**
 * Browser-shape integration test.
 *
 * `test/sync.test.mjs` runs against an isolated test server on port 1235 to
 * validate CRDT semantics. This test instead hits the **actual dev server**
 * (port 1234) using the **same client library the browser loads**
 * (`@hocuspocus/provider` via esm.sh in client/index.html). If this passes,
 * opening client/index.html in two browser tabs will work end-to-end.
 *
 * Skipped automatically if dev server is not running on :1234. Run:
 *
 *   npm start                  # one terminal
 *   npm run test:browser       # other terminal
 */

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import WebSocket from 'ws'

const DEV_URL = 'ws://localhost:1234'

let serverReachable = false

before(async () => {
  // Quick WS probe so the test self-skips when dev isn't up.
  // Hocuspocus expects /<roomName> path; root path may be slow to accept.
  serverReachable = await new Promise((resolve) => {
    const ws = new WebSocket(`${DEV_URL}/probe-${Date.now()}`)
    const timer = setTimeout(() => { ws.terminate(); resolve(false) }, 3000)
    ws.on('open', () => { clearTimeout(timer); ws.close(); resolve(true) })
    ws.on('error', () => { clearTimeout(timer); resolve(false) })
  })
})

after(async () => {
  // Brief settle so dangling sockets close cleanly.
  await new Promise((r) => setTimeout(r, 200))
})

async function waitFor(predicate, { timeout = 5000, interval = 30 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`waitFor timed out after ${timeout}ms`)
}

function makeBrowserPeer(room) {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({
    url: DEV_URL,
    name: room,
    document: doc,
    WebSocketPolyfill: WebSocket,
  })
  return { doc, provider, ytext: doc.getText('shared') }
}

test('browser-shape: two clients sync edits via dev server', async (t) => {
  if (!serverReachable) {
    t.skip('dev server not running on ws://localhost:1234 — start with `npm start` to enable')
    return
  }

  const room = `browser-shape-${Date.now()}`
  const a = makeBrowserPeer(room)
  const b = makeBrowserPeer(room)

  await waitFor(() => a.provider.synced, { timeout: 3000 })
  await waitFor(() => b.provider.synced, { timeout: 3000 })

  a.ytext.insert(0, 'browser-tab-A says hi')
  await waitFor(() => b.ytext.toString() === 'browser-tab-A says hi', { timeout: 3000 })

  assert.equal(b.ytext.toString(), 'browser-tab-A says hi')

  a.provider.destroy()
  b.provider.destroy()
  a.doc.destroy()
  b.doc.destroy()
})

test('browser-shape: awareness propagates between two clients', async (t) => {
  if (!serverReachable) {
    t.skip('dev server not running on ws://localhost:1234')
    return
  }

  const room = `browser-aware-${Date.now()}`
  const a = makeBrowserPeer(room)
  await waitFor(() => a.provider.synced, { timeout: 3000 })
  a.provider.awareness.setLocalStateField('user', { id: 'alice', color: '#f00' })

  const b = makeBrowserPeer(room)
  await waitFor(() => b.provider.synced, { timeout: 3000 })
  b.provider.awareness.setLocalStateField('user', { id: 'bob', color: '#0f0' })

  await waitFor(() => a.provider.awareness.getStates().size === 2, { timeout: 5000 })
  await waitFor(() => b.provider.awareness.getStates().size === 2, { timeout: 5000 })

  a.provider.destroy(); a.doc.destroy()
  b.provider.destroy(); b.doc.destroy()
})
