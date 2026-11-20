import { assert, mockHost, mount, test } from 'orca/testing'
import type { DiscordAction, DiscordState } from './protocol'
import * as panel from './panel'

test('shows the current room, sends explicit mic state, and updates when the call ends', async () => {
  let state: DiscordState & { kind: 'connected' } = {
    kind: 'connected', room: 'Planning', microphone: 'unmuted', canPopOut: true,
    participants: [{ name: 'Ada', muted: false }, { name: 'Lin', muted: true }]
  }
  const actions: DiscordAction[] = []
  const host = mockHost({ requests: {
    'discord.state': () => state,
    'discord.action': action => {
      actions.push(action)
      if (action.kind === 'microphone') state = { ...state, microphone: action.muted ? 'muted' : 'unmuted' }
      return { state, error: null }
    }
  } })
  const view = await mount(panel, { host })
  try {
    assert.ok(view.find({ role: 'heading', text: 'Planning' }))
    assert.ok(view.find({ text: '2 people' }))
    assert.ok(view.find({ label: 'Lin', text: /Muted/ }))
    await view.press({ text: 'Mute mic' })
    assert.ok(view.find({ text: 'Unmute mic' }))
    await view.press({ text: 'Switch to voice room' })
    await view.press({ text: 'Pop out stream' })
    assert.deepEqual(actions, [{ kind: 'microphone', muted: true }, { kind: 'open' }, { kind: 'pop-out' }])
    await view.post('discord.changed', { kind: 'idle', microphone: 'muted' })
    assert.ok(view.find({ text: 'You’re not in a voice room.' }))
    assert.equal(view.find({ text: 'Pop out stream' }), null)
    assert.deepEqual(view.errors, [])
  } finally {
    await view.unmount()
  }
})

test('shows Open Discord only when the desktop can launch it', async () => {
  const view = await mount(panel, { host: mockHost({ requests: {
    'discord.state': {
      kind: 'unavailable',
      reason: 'Discord Desktop is closed. Select Open Discord to launch it.',
      canOpen: true
    }
  } }) })
  try {
    assert.ok(view.find({ text: 'Open Discord' }))
    assert.equal(view.find({ text: 'Unmute mic' }), null)
    await view.post('discord.changed', {
      kind: 'unavailable', reason: 'Discord Companion requires macOS.', canOpen: false
    })
    assert.ok(view.find({ text: 'Discord Companion requires macOS.' }))
    assert.equal(view.find({ text: 'Open Discord' }), null)
  } finally {
    await view.unmount()
  }
})
