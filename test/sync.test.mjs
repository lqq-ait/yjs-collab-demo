/**
 * End-to-end CRDT sync tests.
 *
 * Spawns a private Hocuspocus server on port 1235 (separate from dev's 1234),
 * connects two HocuspocusProvider clients, and verifies four core CRDT
 * properties:
 *
 *   1. Real-time sync       — A writes, B converges
 *   2. Concurrent merge     — A & B write to different positions, both kept
 *   3. Offline + reconnect  — edits made while disconnected merge on reconnect
 *   4. Awareness            — connected peer count is correct
 *
 * Why @hocuspocus/provider (not y-websocket): Hocuspocus extends the standard
 * y-protocols with stateless/auth message types. y-websocket throws "Unknown
 * message type" on those frames when used against @hocuspocus/server. The
 * official pairing (@hocuspocus/provider ↔ @hocuspocus/server) handles the full
 * message set correctly.
 *
 * Uses node:test (built-in, no jest/mocha). Pass criteria:
 *   • Both docs converge to identical text
 *   • No data loss in any scenario
 *
 * Run: npm test
 */

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { Server } from '@hocuspocus/server'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import WebSocket from 'ws'

const TEST_PORT = 1235
const TEST_URL = `ws://localhost:${TEST_PORT}`

let server

before(async () => {
  server = new Server({ port: TEST_PORT })
  await server.listen()
})

after(async () => {
  await server.destroy()
})

/** Wait until predicate() returns truthy or timeout. Resolves to the value. */
async function waitFor(predicate, { timeout = 5000, interval = 30 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = predicate()
    if (v) return v
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`waitFor timed out after ${timeout}ms`)
}

/** Spawn a peer connected to a fresh room. Returns peer + helpers. */
function makePeer(room) {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({
    url: TEST_URL,
    name: room,
    document: doc,
    WebSocketPolyfill: WebSocket,
    // Suppress noisy console errors during expected disconnect/reconnect tests
    onAuthenticationFailed: () => {},
  })
  const ytext = doc.getText('shared')
  return {
    doc,
    ytext,
    provider,
    async ready() {
      // HocuspocusProvider exposes both `status` and `synced` events.
      // We need synced=true (initial sync complete) to safely write.
      await waitFor(() => provider.synced, { timeout: 5000 })
    },
    destroy() {
      provider.destroy()
      doc.destroy()
    },
  }
}

test('1. real-time sync: A writes → B converges', async () => {
  const room = `room-sync-${Date.now()}`
  const a = makePeer(room)
  const b = makePeer(room)
  await a.ready()
  await b.ready()

  a.ytext.insert(0, 'hello from A')
  await waitFor(() => b.ytext.toString() === 'hello from A')

  assert.equal(b.ytext.toString(), 'hello from A')
  assert.equal(a.ytext.toString(), b.ytext.toString())

  a.destroy()
  b.destroy()
})

test('2. concurrent merge: simultaneous edits at different positions both kept', async () => {
  const room = `room-concurrent-${Date.now()}`
  const a = makePeer(room)
  const b = makePeer(room)
  await a.ready()
  await b.ready()

  // Seed shared text and let both peers see it
  a.ytext.insert(0, 'XXXXX')
  await waitFor(() => b.ytext.toString() === 'XXXXX')

  // Both edit simultaneously — A prepends 'A', B appends 'B'
  a.ytext.insert(0, 'A')
  b.ytext.insert(b.ytext.length, 'B')

  // Wait for both peers to see each other's edit
  await waitFor(
    () =>
      a.ytext.toString().includes('A') && a.ytext.toString().includes('B') &&
      b.ytext.toString().includes('A') && b.ytext.toString().includes('B')
  )

  // CRDT guarantee: both peers converge to the *same* string (no split-brain)
  assert.equal(
    a.ytext.toString(),
    b.ytext.toString(),
    `divergence: A="${a.ytext.toString()}" B="${b.ytext.toString()}"`
  )
  // And no character was lost — final text contains all of A, XXXXX, B
  assert.ok(a.ytext.toString().includes('A'), 'A char missing')
  assert.ok(a.ytext.toString().includes('XXXXX'), 'seed missing')
  assert.ok(a.ytext.toString().includes('B'), 'B char missing')

  a.destroy()
  b.destroy()
})

test('3. offline + reconnect: B disconnects, both edit, reconnect → merged', async () => {
  const room = `room-offline-${Date.now()}`
  const a = makePeer(room)
  const b = makePeer(room)
  await a.ready()
  await b.ready()

  a.ytext.insert(0, 'shared')
  await waitFor(() => b.ytext.toString() === 'shared')

  // B goes offline. HocuspocusProvider has no public connect()/isConnected —
  // operate on the underlying websocketProvider (HocuspocusProvider.ts:414
  // explicitly forwards disconnect there; we use the same layer to reconnect).
  const ws = b.provider.configuration.websocketProvider
  ws.disconnect()
  // `status` is a string ('disconnected' | 'connecting' | 'connected') — much
  // more reliable than non-existent properties like `isConnected`.
  await waitFor(() => ws.status === 'disconnected')

  // Both edit while B is offline. Yjs is local-first: each doc accepts edits
  // independently and queues updates locally.
  a.ytext.insert(a.ytext.length, ' [from A online]')
  b.ytext.insert(b.ytext.length, ' [from B offline]')

  // A's edit must NOT have reached B yet (proves the disconnect took effect).
  assert.ok(
    !b.ytext.toString().includes('[from A online]'),
    'B should not see A edits while disconnected'
  )

  // B reconnects via the websocket layer.
  ws.connect()
  // The merged state should land on both peers via the standard sync handshake.
  // Wait directly on the visible CRDT outcome — that's both the user-facing
  // contract AND a reliable signal regardless of provider internals.
  await waitFor(
    () =>
      a.ytext.toString().includes('[from B offline]') &&
      b.ytext.toString().includes('[from A online]'),
    { timeout: 10000 }
  )

  assert.equal(
    a.ytext.toString(),
    b.ytext.toString(),
    `divergence after reconnect: A="${a.ytext.toString()}" B="${b.ytext.toString()}"`
  )

  a.destroy()
  b.destroy()
})

test('4. awareness: peer count reflects connected clients', async () => {
  const room = `room-awareness-${Date.now()}`
  const a = makePeer(room)
  await a.ready()
  a.provider.awareness.setLocalStateField('user', { id: 'alice' })

  const b = makePeer(room)
  await b.ready()
  b.provider.awareness.setLocalStateField('user', { id: 'bob' })

  // Both peers should see 2 awareness states
  await waitFor(() => a.provider.awareness.getStates().size === 2)
  await waitFor(() => b.provider.awareness.getStates().size === 2)

  // B leaves
  b.destroy()

  // A's view should drop back to 1 within a few seconds (awareness gossip)
  await waitFor(() => a.provider.awareness.getStates().size === 1, { timeout: 8000 })

  a.destroy()
})
