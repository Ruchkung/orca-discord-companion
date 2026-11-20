import { assert, test } from 'orca/testing'
import { parseDiscordView } from './accessibility'

const account = [
  '0 standard window Discord',
  '\t1 container',
  '\t\t2 container User status and settings',
  '\t\t\t3 container',
  '\t\t\t\t4 switch (settable) Mute, Value: 1',
  '\t\t\t\t5 text Unmute'
]
const connected = [
  ...account,
  '\t\t6 container',
  '\t\t\t7 button Voice Connected',
  '\t\t\t8 link Planning / Engineering',
  '\t\t\t9 button Disconnect',
  '\t10 container Voice call',
  '\t\t11 container Call controls',
  '\t\t\t12 button Pop Out View',
  '\t\t13 list Voice participants',
  '\t\t\t14 item Ada',
  '\t\t\t15 item Lin, muted'
]

test('reads the account switch and ignores chat text that mentions a call', () => {
  const text = [...account, '\t20 container Messages', '\t\t21 text Voice Connected'].join('\n')
  assert.deepEqual(parseDiscordView(text, new Set()), {
    state: { kind: 'idle', microphone: 'muted' }, microphoneControl: 4, popOutControl: null
  })
})

test('reads the connected room and its roster and scoped pop-out control', () => {
  assert.deepEqual(parseDiscordView(connected.join('\n'), new Set()), {
    state: {
      kind: 'connected', room: 'Planning', microphone: 'muted',
      participants: [{ name: 'Ada', muted: false }, { name: 'Lin', muted: true }],
      canPopOut: true
    },
    microphoneControl: 4, popOutControl: 12
  })
})

test('keeps an unavailable roster distinct from an empty room and skips disabled controls', () => {
  const view = parseDiscordView(connected.slice(0, 12).join('\n'), new Set([4, 12]))
  assert.deepEqual(view, {
    state: { kind: 'connected', room: 'Planning', microphone: 'muted', participants: null, canPopOut: false },
    microphoneControl: null, popOutControl: null
  })
})

test('reads the live Discord account layout and the active channel roster', () => {
  const tree = [
    '0 standard window Discord',
    '\t1 container',
    '\t\t2 container',
    '\t\t\t3 link โต๊ะ / ทีม // Office (voice channel), Ada, Lin, call duration 1 minute',
    '\t\t\t\t4 container, Text: Voice Open Chat 1 minute',
    '\t\t\t\t\t5 button Set a channel status',
    '\t\t\t\t6 container',
    '\t\t\t\t\t7 button Ada',
    '\t\t\t\t8 container',
    '\t\t\t\t\t9 text Ada',
    '\t\t\t\t10 container',
    '\t\t\t\t\t11 button Lin',
    '\t\t\t\t12 container',
    '\t\t\t\t\t13 text Lin',
    '\t\t\t\t14 text Muted',
    '\t\t20 container User status and settings',
    '\t\t\t21 container',
    '\t\t\t\t22 button Voice Details Voice Connected',
    '\t\t\t\t23 link [โต๊ะ / ทีม // Office / Engineering](https://discord.com/channels/123/456)',
    '\t\t\t\t24 button Disconnect',
    '\t\t\t25 container',
    '\t\t\t\t26 switch (settable) Mute, Value: 1'
  ].join('\n')

  assert.deepEqual(parseDiscordView(tree, new Set()), {
    state: {
      kind: 'connected', room: 'โต๊ะ / ทีม // Office', microphone: 'muted',
      participants: [{ name: 'Ada', muted: false }, { name: 'Lin', muted: true }],
      canPopOut: false
    },
    microphoneControl: 26,
    popOutControl: null
  })
})

test('uses the accessible call summary when the active channel roster is collapsed', () => {
  const tree = [
    '0 standard window Discord',
    '\t1 container',
    '\t\t2 container',
    '\t\t\t3 link Planning (voice channel), Ada, Lin, call duration 2 minutes',
    '\t\t4 container User status and settings',
    '\t\t\t5 container',
    '\t\t\t\t6 button Voice Details Voice Connected',
    '\t\t\t\t7 link [Planning / Engineering](https://discord.com/channels/123/456)'
  ].join('\n')

  const state = parseDiscordView(tree, new Set())?.state
  assert.deepEqual(state?.kind === 'connected' && state.participants, [
    { name: 'Ada', muted: false }, { name: 'Lin', muted: false }
  ])
})
