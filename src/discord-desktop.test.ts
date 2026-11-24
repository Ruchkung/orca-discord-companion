import { randomUUID } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, test } from 'orca/testing'
import { createDesktop, type Vault } from './discord-desktop'

type Channel = { id: string; guild_id: string | null; name: string; voice_states: unknown[] } | null

/** A stand-in Discord client that speaks the local RPC protocol over a real pipe. */
async function fakeDiscord(options: { clientId?: string } = {}) {
  const path = process.platform === 'win32'
    ? '\\\\?\\pipe\\orca-discord-test-' + randomUUID()
    : join(tmpdir(), 'orca-discord-' + randomUUID() + '.sock')
  const discord = {
    path,
    mute: true,
    channel: null as Channel,
    tokens: new Set(['access-1']),
    commands: [] as string[],
    subscribed: new Set<string>(),
    /** Commands Discord receives but never answers. */
    stalled: new Set<string>(),
    sockets: new Set<Socket>(),
    server: null as Server | null
  }
  const send = (socket: Socket, op: number, payload: unknown) => {
    const body = Buffer.from(JSON.stringify(payload))
    const header = Buffer.alloc(8)
    header.writeInt32LE(op, 0)
    header.writeInt32LE(body.length, 4)
    socket.write(Buffer.concat([header, body]))
  }
  discord.server = createServer(socket => {
    discord.sockets.add(socket)
    socket.on('close', () => discord.sockets.delete(socket))
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 8 && buffer.length >= 8 + buffer.readInt32LE(4)) {
        const op = buffer.readInt32LE(0)
        const message = JSON.parse(buffer.subarray(8, 8 + buffer.readInt32LE(4)).toString())
        buffer = buffer.subarray(8 + buffer.readInt32LE(4))
        if (op === 0) {
          if (options.clientId && message.client_id !== options.clientId) {
            send(socket, 2, { code: 4000, message: 'Invalid Client ID' })
            socket.end()
          } else send(socket, 1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } })
          continue
        }
        discord.commands.push(message.cmd)
        if (discord.stalled.has(message.cmd)) continue
        const reply = (data: unknown) => send(socket, 1, { cmd: message.cmd, nonce: message.nonce, data })
        const fail = (code: number, text: string) =>
          send(socket, 1, { cmd: message.cmd, nonce: message.nonce, evt: 'ERROR', data: { code, message: text } })
        switch (message.cmd) {
          case 'AUTHORIZE': reply({ code: 'code-1' }); break
          case 'AUTHENTICATE':
            if (discord.tokens.has(message.args.access_token)) reply({ user: { id: 'me' } })
            else fail(4009, 'Invalid OAuth2 access token')
            break
          case 'SUBSCRIBE':
            if (typeof message.evt === 'string') {
              discord.subscribed.add(message.evt)
              if (message.args.channel_id) discord.subscribed.add(message.evt + ':' + message.args.channel_id)
              reply({ evt: message.evt })
            }
            else fail(4004, 'Invalid event: undefined')
            break
          case 'UNSUBSCRIBE':
            discord.subscribed.delete(message.evt)
            discord.subscribed.delete(message.evt + ':' + message.args.channel_id)
            reply({ evt: message.evt })
            break
          case 'GET_VOICE_SETTINGS': reply({ mute: discord.mute, deaf: false }); break
          case 'GET_SELECTED_VOICE_CHANNEL': reply(discord.channel); break
          case 'SET_VOICE_SETTINGS':
            discord.mute = message.args.mute
            reply({ mute: discord.mute })
            if (discord.subscribed.has('VOICE_SETTINGS_UPDATE')) {
              send(socket, 1, { cmd: 'DISPATCH', evt: 'VOICE_SETTINGS_UPDATE', data: { mute: discord.mute } })
            }
            break
          default: fail(4000, 'Unknown command')
        }
      }
    })
  })
  await new Promise<void>(resolve => discord.server?.listen(path, resolve))
  return Object.assign(discord, {
    /** Changes the microphone the way a press in Discord does. */
    pressMute(mute: boolean) {
      discord.mute = mute
      if (!discord.subscribed.has('VOICE_SETTINGS_UPDATE')) return
      for (const socket of discord.sockets) send(socket, 1, { cmd: 'DISPATCH', evt: 'VOICE_SETTINGS_UPDATE', data: { mute } })
    },
    /** Reports someone starting or stopping speaking, as Discord does for a channel the client follows. */
    speak(user: string, speaking: boolean, channel = '222') {
      const evt = speaking ? 'SPEAKING_START' : 'SPEAKING_STOP'
      if (!discord.subscribed.has(evt + ':' + channel)) return
      for (const socket of discord.sockets) send(socket, 1, { cmd: 'DISPATCH', evt, data: { channel_id: channel, user_id: user } })
    },
    async quit() {
      for (const socket of discord.sockets) socket.destroy()
      await new Promise(resolve => discord.server?.close(resolve))
    }
  })
}

function memoryVault(initial: Record<string, string> = {}): Vault & { values: Record<string, string> } {
  const values = { ...initial }
  return {
    values,
    get: async key => values[key] ?? null,
    set: async (key, value) => { values[key] = value }
  }
}

const savedCredentials = (token: string | null = 'access-1') => JSON.stringify({
  clientId: '123456789012345678',
  clientSecret: 'secret',
  token: token && { accessToken: token, refreshToken: 'refresh-1', expiresAt: Date.now() + 3_600_000 }
})

const planning: Channel = {
  id: '222', guild_id: '111', name: 'Planning',
  voice_states: [
    { nick: 'Ada', user: { id: 'me', username: 'ada' }, voice_state: { self_mute: false } },
    { user: { id: 'lin', global_name: 'Lin', username: 'lin' }, voice_state: { self_mute: true } }
  ]
}

test('asks for setup, authorizes in Discord, and reads the room and roster', async () => {
  const discord = await fakeDiscord({ clientId: '123456789012345678' })
  const vault = memoryVault()
  const grants: unknown[] = []
  const desktop = createDesktop({
    platform: 'win32', vault, pipes: async () => [discord.path],
    exchange: async (_credentials, grant) => {
      grants.push(grant)
      return { accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: Date.now() + 3_600_000 }
    }
  })
  try {
    const first = await desktop.read()
    assert.equal(first.kind === 'unavailable' && first.fix, 'setup')

    await desktop.act({ kind: 'setup', clientId: ' 123456789012345678 ', clientSecret: 'secret' })
    assert.deepEqual(grants, [{ code: 'code-1' }])
    discord.channel = planning
    // Discord reports the caller's own voice state late, so the roster follows the live microphone setting.
    assert.deepEqual(await desktop.read(), {
      kind: 'connected', room: 'Planning', microphone: 'muted',
      participants: [{ name: 'Ada', muted: true, speaking: false }, { name: 'Lin', muted: true, speaking: false }]
    })
    assert.match(vault.values['discord-rpc'] ?? '', /access-1/)
  } finally {
    await discord.quit()
  }
})

test('reports a mute pressed in Discord as soon as Discord sends it', async () => {
  const discord = await fakeDiscord()
  const desktop = createDesktop({ platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [discord.path] })
  const changed = new Promise<void>(resolve => desktop.onChange(resolve))
  try {
    assert.deepEqual(await desktop.read(), { kind: 'idle', microphone: 'muted' })
    discord.pressMute(false)
    await changed
    assert.deepEqual(await desktop.read(), { kind: 'idle', microphone: 'unmuted' })
  } finally {
    await discord.quit()
  }
})

test('shows who is speaking as Discord reports it, and follows the room the caller moves to', async () => {
  const discord = await fakeDiscord()
  const desktop = createDesktop({ platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [discord.path] })
  const roster = async () => {
    const state = await desktop.read()
    return state.kind === 'connected' ? state.participants.map(({ name, speaking }) => name + (speaking ? ' speaking' : '')) : []
  }
  const next = () => new Promise<void>(resolve => { const off = desktop.onChange(() => { off(); resolve() }) })
  const talkative = { ...planning, voice_states: [
    { user: { id: 'lin', global_name: 'Lin', username: 'lin' }, voice_state: { self_mute: false } }
  ] }
  try {
    discord.mute = false
    discord.channel = talkative
    assert.deepEqual(await roster(), ['Lin'])
    let changed = next()
    discord.speak('lin', true)
    await changed
    assert.deepEqual(await roster(), ['Lin speaking'])
    changed = next()
    discord.speak('lin', false)
    await changed
    assert.deepEqual(await roster(), ['Lin'])

    discord.speak('lin', true, '999')
    discord.channel = { ...talkative, id: '333' }
    assert.deepEqual(await roster(), ['Lin'])
    assert.equal(discord.subscribed.has('SPEAKING_START:222'), false)
    assert.equal(discord.subscribed.has('SPEAKING_START:333'), true)
  } finally {
    await discord.quit()
  }
})

test('mutes and unmutes over RPC without a window', async () => {
  const discord = await fakeDiscord()
  const desktop = createDesktop({ platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [discord.path] })
  let changes = 0
  desktop.onChange(() => { changes++ })
  try {
    assert.deepEqual(await desktop.read(), { kind: 'idle', microphone: 'muted' })
    await desktop.act({ kind: 'microphone', muted: false })
    assert.deepEqual(await desktop.read(), { kind: 'idle', microphone: 'unmuted' })
    assert.ok(changes >= 1)
    assert.equal(discord.commands.filter(command => command === 'AUTHENTICATE').length, 1)
  } finally {
    await discord.quit()
  }
})

test('offers to open Discord when it quits and reconnects after it returns', async () => {
  let discord = await fakeDiscord()
  const path = discord.path
  const launches: string[] = []
  const desktop = createDesktop({
    platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [path],
    launch: async () => { launches.push('launch') }
  })
  let changes = 0
  desktop.onChange(() => { changes++ })
  assert.equal((await desktop.read()).kind, 'idle')
  await discord.quit()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.ok(changes >= 1)
  const closed = await desktop.read()
  assert.equal(closed.kind === 'unavailable' && closed.reason, 'Discord Desktop is closed. Select Open Discord to launch it.')
  assert.equal(closed.kind === 'unavailable' && closed.fix, 'open')
  await desktop.act({ kind: 'open' })
  assert.deepEqual(launches, ['launch'])

  discord = await fakeDiscord()
  try {
    assert.equal((await createDesktop({
      platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [discord.path]
    }).read()).kind, 'idle')
  } finally {
    await discord.quit()
  }
})

test('reports Discord as closed when it quits during a read', async () => {
  const discord = await fakeDiscord()
  const desktop = createDesktop({ platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [discord.path] })
  assert.equal((await desktop.read()).kind, 'idle')
  discord.stalled.add('GET_VOICE_SETTINGS')
  const reading = desktop.read()
  await new Promise(resolve => setTimeout(resolve, 20))
  await discord.quit()
  const state = await reading
  assert.deepEqual(state, { kind: 'unavailable', reason: 'Discord Desktop is closed. Select Open Discord to launch it.', fix: 'open' })
})

test('opens the current room with a Discord link, or just shows Discord when idle', async () => {
  const discord = await fakeDiscord()
  const shown: (string | null)[] = []
  const desktop = createDesktop({
    platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [discord.path],
    launch: async () => { throw new Error('Discord is already running') },
    show: async url => { shown.push(url) }
  })
  try {
    await desktop.act({ kind: 'open' })
    discord.channel = planning
    await desktop.act({ kind: 'open' })
    discord.channel = { ...planning, guild_id: null }
    await desktop.act({ kind: 'open' })
    assert.deepEqual(shown, [null, 'discord://-/channels/111/222', 'discord://-/channels/@me/222'])
  } finally {
    await discord.quit()
  }
})

test('asks to authorize again when Discord rejects the saved token', async () => {
  const discord = await fakeDiscord()
  const vault = memoryVault({ 'discord-rpc': savedCredentials('revoked') })
  const desktop = createDesktop({ platform: 'win32', vault, pipes: async () => [discord.path] })
  try {
    const state = await desktop.read()
    assert.equal(state.kind === 'unavailable' && state.fix, 'authorize')
    assert.ok(!(vault.values['discord-rpc'] ?? '').includes('revoked'))
  } finally {
    await discord.quit()
  }
})

test('returns to setup when Discord rejects the application ID or client secret', async () => {
  const discord = await fakeDiscord({ clientId: '999999999999999999' })
  const desktop = createDesktop({ platform: 'win32', vault: memoryVault({ 'discord-rpc': savedCredentials() }), pipes: async () => [discord.path] })
  try {
    const state = await desktop.read()
    assert.equal(state.kind === 'unavailable' && state.fix, 'setup')
    await assert.rejects(desktop.act({ kind: 'setup', clientId: 'abc', clientSecret: 'secret' }), /Application ID/)
  } finally {
    await discord.quit()
  }
})

test('pops out the call through Discord’s Pop Out control', async () => {
  const clicks: string[] = []
  const tree = '0 window Discord\n\t1 button Disconnect\n\t2 button Pop Out'
  const desktop = createDesktop({
    platform: 'win32', vault: memoryVault(),
    computer: async (command, args = []) => {
      if (command === 'click') clicks.push(args.join(' '))
      return { snapshot: { treeText: command === 'get-app-state' ? tree : '', disabledElementIndexes: [] } }
    }
  })
  await desktop.act({ kind: 'pop-out' })
  assert.deepEqual(clicks, ['--element-index 2'])

  const shell = createDesktop({
    platform: 'win32', vault: memoryVault(),
    computer: async () => ({ snapshot: { treeText: '0 window Discord\n\t1 region\n\t\t2 region', disabledElementIndexes: [] } })
  })
  await assert.rejects(shell.act({ kind: 'pop-out' }), /Quit Discord from the system tray/)
})

test('does not start anything on unsupported platforms', async () => {
  const desktop = createDesktop({ platform: 'linux', vault: memoryVault() })
  assert.deepEqual(await desktop.read(), {
    kind: 'unavailable', reason: 'Discord Companion requires macOS or Windows.', fix: null
  })
  await assert.rejects(desktop.act({ kind: 'open' }), /requires macOS or Windows/)
})
