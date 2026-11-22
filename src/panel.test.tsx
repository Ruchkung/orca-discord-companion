import { assert, mockHost, mount, test } from 'orca/testing'
import type { DiscordAction, DiscordState } from './protocol'
import * as panel from './panel'

test('shows the current room, sends explicit mic state, and updates when the call ends', async () => {
  let state: DiscordState & { kind: 'connected' } = {
    kind: 'connected', room: 'Planning', microphone: 'unmuted',
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
    await view.press({ text: 'Pop out call' })
    assert.deepEqual(actions, [{ kind: 'microphone', muted: true }, { kind: 'open' }, { kind: 'pop-out' }])
    await view.post('discord.changed', { kind: 'idle', microphone: 'muted' })
    assert.ok(view.find({ text: 'You’re not in a voice room.' }))
    assert.equal(view.find({ text: 'Pop out call' }), null)
    assert.deepEqual(view.errors, [])
  } finally {
    await view.unmount()
  }
})

test('collects the Discord application and asks to authorize it', async () => {
  const actions: DiscordAction[] = []
  let state: DiscordState = { kind: 'unavailable', reason: 'Connect your Discord application.', fix: 'setup' }
  const view = await mount(panel, { host: mockHost({ requests: {
    'discord.state': () => state,
    'discord.action': action => {
      actions.push(action)
      state = { kind: 'idle', microphone: 'muted' }
      return { state, error: null }
    }
  } }) })
  try {
    await view.type({ label: 'Application ID' }, '123456789012345678')
    await view.type({ label: 'Client secret' }, 'secret')
    await view.press({ text: 'Connect to Discord' })
    assert.deepEqual(actions, [{ kind: 'setup', clientId: '123456789012345678', clientSecret: 'secret' }])
    assert.ok(view.find({ text: 'Microphone muted' }))

    await view.post('discord.changed', { kind: 'unavailable', reason: 'Discord signed Orca out.', fix: 'authorize' })
    await view.press({ text: 'Authorize in Discord' })
    assert.deepEqual(actions.at(-1), { kind: 'authorize' })
    assert.deepEqual(view.errors, [])
  } finally {
    await view.unmount()
  }
})

test('shows Open Discord only when the desktop can launch it', async () => {
  const view = await mount(panel, { host: mockHost({ requests: {
    'discord.state': {
      kind: 'unavailable', reason: 'Discord Desktop is closed. Select Open Discord to launch it.', fix: 'open'
    }
  } }) })
  try {
    assert.ok(view.find({ text: 'Open Discord' }))
    assert.equal(view.find({ text: 'Unmute mic' }), null)
    await view.post('discord.changed', {
      kind: 'unavailable', reason: 'Discord Companion requires macOS or Windows.', fix: null
    })
    assert.ok(view.find({ text: 'Discord Companion requires macOS or Windows.' }))
    assert.equal(view.find({ text: 'Open Discord' }), null)
  } finally {
    await view.unmount()
  }
})
