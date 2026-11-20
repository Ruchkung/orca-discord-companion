import { assert, mockHost, mountWorker, test } from 'orca/testing'
import type { Desktop } from './discord-desktop'
import type { DiscordState } from './protocol'
import { start } from './worker'

test('shows the active room in the status bar and clears it on disconnect', async () => {
  let state: DiscordState = {
    kind: 'connected', room: 'Planning', microphone: 'unmuted', canPopOut: false,
    participants: [{ name: 'Ada', muted: false }]
  }
  const connection: Desktop = {
    read: async () => state,
    act: async () => { state = { kind: 'idle', microphone: 'unmuted' } }
  }
  const host = mockHost()
  let stop: (() => void) | undefined
  const worker = await mountWorker({ default: orca => { stop = start(orca, connection) } }, { host })
  try {
    assert.equal((await worker.request('discord.state')).kind, 'connected')
    assert.deepEqual(host.callsOf('statusBar.update'), [{
      id: 'discord-voice', text: 'Planning · 1', tooltip: 'Planning · Switch to Discord',
      tone: 'accent', visible: true
    }])
    await worker.request('discord.action', { kind: 'open' })
    assert.equal((await worker.request('discord.state')).kind, 'idle')
    assert.deepEqual(host.callsOf('statusBar.update').at(-1), { id: 'discord-voice', visible: false })
    assert.deepEqual(worker.refusals, [])
  } finally {
    stop?.()
    await worker.deactivate()
  }
})
