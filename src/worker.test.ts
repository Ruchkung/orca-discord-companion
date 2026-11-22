import { assert, mockHost, mountWorker, test } from 'orca/testing'
import type { Desktop } from './discord-desktop'
import type { DiscordState } from './protocol'
import { start } from './worker'

test('shows the active room in the status bar and clears it on disconnect', async () => {
  let state: DiscordState = {
    kind: 'connected', room: 'Planning', microphone: 'unmuted',
    participants: [{ name: 'Ada', muted: false }]
  }
  const connection: Desktop = {
    read: async () => state,
    act: async () => { state = { kind: 'idle', microphone: 'unmuted' } },
    onChange: () => () => undefined
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

test('refreshes as soon as Discord reports a voice change', async () => {
  let state: DiscordState = { kind: 'idle', microphone: 'muted' }
  let changed = () => undefined as void
  const connection: Desktop = {
    read: async () => state,
    act: async () => undefined,
    onChange: listener => { changed = listener; return () => undefined }
  }
  let stop: (() => void) | undefined
  const worker = await mountWorker({ default: orca => { stop = start(orca, connection) } }, { host: mockHost() })
  try {
    assert.deepEqual(await worker.request('discord.state'), { kind: 'idle', microphone: 'muted' })
    state = { kind: 'idle', microphone: 'unmuted' }
    changed()
    assert.deepEqual(await worker.request('discord.state'), { kind: 'idle', microphone: 'unmuted' })
  } finally {
    stop?.()
    await worker.deactivate()
  }
})
