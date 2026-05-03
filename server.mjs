/**
 * Minimal Hocuspocus collaboration server.
 *
 * What this demonstrates:
 * - Yjs document persistence in memory (per-room Y.Doc)
 * - WebSocket awareness broadcast (presence + cursors)
 * - CRDT auto-merge (no manual conflict resolution)
 *
 * Run: node server.mjs
 * Listens on ws://localhost:1234
 */

import { Server } from '@hocuspocus/server'

const PORT = parseInt(process.env.PORT || '1234', 10)

const server = new Server({
  port: PORT,

  async onConnect({ documentName }) {
    console.log(`[connect] room=${documentName}`)
  },

  async onDisconnect({ documentName }) {
    console.log(`[disconnect] room=${documentName}`)
  },

  async onChange({ documentName, update }) {
    console.log(`[change] room=${documentName} bytes=${update.byteLength}`)
  },
})

server.listen()
console.log(`Hocuspocus listening on ws://localhost:${PORT}`)
console.log(`Open client/index.html in two browser tabs to see real-time sync.`)
