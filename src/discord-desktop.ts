import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { findPopOut } from './accessibility'
import type { DiscordAction, DiscordState, Fix, Microphone } from './protocol'
import { connectRpc, RpcError, type RpcConnection } from './rpc'

const exec = promisify(execFile)
const secretKey = 'discord-rpc'
const scopes = ['rpc', 'rpc.voice.read', 'rpc.voice.write']
const redirectUri = 'http://localhost'
const closedMessage = 'Discord Desktop is closed. Select Open Discord to launch it.'
// Orca starts the worker without APPDATA or LOCALAPPDATA, and the Orca CLI needs APPDATA to find Orca.
const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
const windowsEnv = {
  ...process.env,
  APPDATA: process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
  LOCALAPPDATA: localAppData
}

type Token = { accessToken: string; refreshToken: string; expiresAt: number }
type Credentials = { clientId: string; clientSecret: string; token: Token | null }
type Grant = { code: string } | { refreshToken: string }

/** The plugin's encrypted secrets, as Orca's `secrets` API provides them. */
export type Vault = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}
export type RunComputer = (command: string, args?: string[]) => Promise<unknown>

export type DesktopOptions = {
  platform?: NodeJS.Platform
  vault: Vault
  pipes?: () => Promise<string[]>
  exchange?: (credentials: Credentials, grant: Grant) => Promise<Token>
  launch?: () => Promise<void>
  show?: (url: string | null) => Promise<void>
  computer?: RunComputer
}

export interface Desktop {
  read(): Promise<DiscordState>
  act(action: DiscordAction): Promise<void>
  /** Calls the listener when Discord reports a voice change or the connection closes. */
  onChange(listener: () => void): () => void
}

class Unavailable extends Error {
  readonly fix: Fix | null
  constructor(message: string, fix: Fix | null) {
    super(message)
    this.fix = fix
  }
}

class Closed extends Unavailable {
  constructor() {
    super(closedMessage, 'open')
  }
}

function get(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

type Platform = {
  app: string
  cli: string[]
  env?: NodeJS.ProcessEnv
  pipes(): Promise<string[]>
  launch(): Promise<void>
  show(url: string | null): Promise<void>
}

const ipcNames = Array.from({ length: 10 }, (_, index) => 'discord-ipc-' + index)
let darwinTemp: Promise<string | null> | undefined

// Raises Discord's main window, even from the system tray, then opens the room link.
const showWindowsScript = String.raw`
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class DiscordWindow {
  delegate bool Visit(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(Visit visit, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint relation);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  public static bool Show(int[] processes) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((window, data) => {
      uint process; GetWindowThreadProcessId(window, out process);
      if (Array.IndexOf(processes, (int)process) < 0 || GetWindow(window, 4) != IntPtr.Zero) return true;
      var kind = new StringBuilder(64); GetClassName(window, kind, 64);
      var title = new StringBuilder(512); GetWindowText(window, title, 512);
      if (kind.ToString() != "Chrome_WidgetWin_1" || !title.ToString().EndsWith("Discord")) return true;
      found = window;
      return false;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return false;
    ShowWindow(found, IsIconic(found) ? 9 : 5);
    SetForegroundWindow(found);
    return true;
  }
}
"@
$shown = [DiscordWindow]::Show([int[]](Get-Process Discord -ErrorAction SilentlyContinue).Id)
if ($env:DISCORD_URL) { Start-Process $env:DISCORD_URL }
if (-not $shown -and -not $env:DISCORD_URL) { exit 3 }
`

const platforms: Partial<Record<NodeJS.Platform, Platform>> = {
  darwin: {
    app: 'com.hnc.Discord',
    cli: [
      '/Applications/Orca.app/Contents/Resources/bin/orca',
      '/opt/homebrew/bin/orca',
      '/usr/local/bin/orca'
    ],
    async pipes() {
      // Discord listens in the per-user temp folder, which Orca may not pass to the worker as TMPDIR.
      darwinTemp ??= exec('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8', timeout: 2000 })
        .then(({ stdout }) => stdout.trim() || null, () => null)
      const folders = [...new Set([process.env.TMPDIR, await darwinTemp, '/tmp'].filter((folder): folder is string => !!folder))]
      return folders.flatMap(folder => ipcNames.map(name => join(folder, name)))
    },
    async launch() {
      await exec('/usr/bin/open', ['-b', 'com.hnc.Discord'], { timeout: 3500 }).catch(() => {
        throw new Error('Install Discord Desktop to open it from Orca.')
      })
    },
    async show(url) {
      await exec('/usr/bin/open', url ? [url] : ['-b', 'com.hnc.Discord'], { timeout: 3500 })
    }
  },
  win32: {
    app: 'Discord',
    env: windowsEnv,
    // The worker runs inside Orca.exe, which ships its CLI beside it.
    cli: [
      join(dirname(process.execPath), 'resources', 'bin', 'orca.exe'),
      join(localAppData, 'Programs', 'orca', 'resources', 'bin', 'orca.exe')
    ],
    async pipes() {
      return ipcNames.map(name => '\\\\?\\pipe\\' + name)
    },
    async launch() {
      // The accessibility switch lets Orca find Discord's Pop Out control.
      await exec(join(localAppData, 'Discord', 'Update.exe'), [
        '--processStart', 'Discord.exe', '--process-start-args', '--force-renderer-accessibility'
      ], { timeout: 3500, env: windowsEnv }).catch(() => {
        throw new Error('Install Discord Desktop to open it from Orca.')
      })
    },
    async show(url) {
      await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', showWindowsScript], {
        timeout: 15000, env: { ...windowsEnv, DISCORD_URL: url ?? '' }
      }).catch(() => {
        throw new Error('Orca could not bring Discord forward.')
      })
    }
  }
}

function computerFor(platform: Platform): RunComputer {
  return async (command, args = []) => {
    const cli = platform.cli.find(existsSync)
    if (!cli) throw new Error(platform.app === 'Discord' ? 'Install Orca or the Orca CLI.' : 'Install Orca in Applications or install the Orca CLI.')
    const { stdout } = await exec(cli, [
      'computer', command, '--environment', 'local', '--app', platform.app,
      '--session', 'local.discord-companion', '--no-screenshot', '--json', ...args
    ], {
      timeout: 5000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', env: platform.env
    }).catch((error: unknown) => {
      const stdout = get(error, 'stdout')
      if (typeof stdout === 'string' && stdout.trim()) return { stdout }
      throw new Error('Orca could not control Discord Desktop.')
    })
    return decodeComputerResponse(stdout)
  }
}

export function decodeComputerResponse(stdout: string): unknown {
  let response: unknown
  try {
    response = JSON.parse(stdout)
  } catch {
    throw new Error('Orca could not control Discord Desktop.')
  }
  if (get(response, 'ok') === true) return get(response, 'result')
  const code = get(get(response, 'error'), 'code')
  if (typeof code === 'string' && /permission|accessibility|denied/i.test(code)) {
    throw new Error('Allow Orca in macOS Privacy & Security → Accessibility to pop out calls.')
  }
  if (typeof code === 'string' && /app_not|window/i.test(code)) throw new Error('Restore or open a Discord Desktop window.')
  throw new Error('Orca could not control Discord Desktop.')
}

async function exchangeToken(credentials: Credentials, grant: Grant): Promise<Token> {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      ...('code' in grant
        ? { grant_type: 'authorization_code', code: grant.code, redirect_uri: redirectUri }
        : { grant_type: 'refresh_token', refresh_token: grant.refreshToken })
    })
  }).catch(() => {
    throw new Unavailable('Orca could not reach Discord to authorize. Check your connection.', 'authorize')
  })
  const body: unknown = await response.json().catch(() => null)
  const accessToken = text(get(body, 'access_token'))
  const refreshToken = text(get(body, 'refresh_token'))
  const expiresIn = get(body, 'expires_in')
  if (response.ok && accessToken && refreshToken && typeof expiresIn === 'number') {
    return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 }
  }
  if (get(body, 'error') === 'invalid_client') {
    throw new Unavailable('Discord rejected the application ID or client secret. Enter them again.', 'setup')
  }
  throw new Unavailable('Discord did not accept the authorization. Authorize again.', 'authorize')
}

function parseCredentials(stored: string | null): Credentials | null {
  if (!stored) return null
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return null
  }
  const clientId = text(get(value, 'clientId'))
  const clientSecret = text(get(value, 'clientSecret'))
  if (!clientId || !clientSecret) return null
  const token = get(value, 'token')
  const accessToken = text(get(token, 'accessToken'))
  const refreshToken = text(get(token, 'refreshToken'))
  const expiresAt = get(token, 'expiresAt')
  return {
    clientId,
    clientSecret,
    token: accessToken && refreshToken && typeof expiresAt === 'number' ? { accessToken, refreshToken, expiresAt } : null
  }
}

function participantsOf(channel: unknown, self: string | null, microphone: Microphone, speaking: ReadonlySet<string>) {
  const states = get(channel, 'voice_states')
  return (Array.isArray(states) ? states : []).flatMap(entry => {
    const user = get(entry, 'user')
    const voice = get(entry, 'voice_state')
    const name = text(get(entry, 'nick')) ?? text(get(user, 'global_name')) ?? text(get(user, 'username'))
    if (!name) return []
    // Discord reports the caller's own voice state late after a change, so use their live settings.
    const muted = get(user, 'id') === self
      ? microphone === 'muted'
      : ['mute', 'self_mute', 'deaf', 'self_deaf'].some(key => get(voice, key) === true)
    const id = text(get(user, 'id'))
    return [{ name, muted, speaking: !muted && id !== null && speaking.has(id) }]
  })
}

export function createDesktop(options: DesktopOptions): Desktop {
  const platform = options.platform ?? process.platform
  const host = platforms[platform]
  const vault = options.vault
  const exchange = options.exchange ?? exchangeToken
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of listeners) listener() }
  let rpc: RpcConnection | null = null
  let self: string | null = null
  // Discord reports speaking per channel, so follow the one the caller is in and forget the rest.
  let followed: string | null = null
  let speaking = new Set<string>()

  async function credentials() {
    return parseCredentials(await vault.get(secretKey))
  }

  async function save(value: Credentials | null) {
    await vault.set(secretKey, value ? JSON.stringify(value) : '')
  }

  function forget() {
    self = null
    followed = null
    speaking = new Set()
  }

  function disconnect() {
    rpc?.close()
    rpc = null
    forget()
  }

  async function follow(open: RpcConnection, channel: string | null) {
    if (channel === followed) return
    const previous = followed
    followed = channel
    speaking = new Set()
    const change = (method: 'subscribe' | 'unsubscribe', id: string) => Promise.all(
      ['SPEAKING_START', 'SPEAKING_STOP'].map(event => open[method](event, { channel_id: id }).catch(() => undefined))
    )
    if (previous) await change('unsubscribe', previous)
    if (channel) await change('subscribe', channel)
  }

  async function pipes() {
    return options.pipes ? options.pipes() : host ? host.pipes() : []
  }

  async function connection(stored: Credentials): Promise<RpcConnection> {
    if (rpc) return rpc
    const opened = await connectRpc(await pipes(), stored.clientId, (event, data) => {
      if (event === 'SPEAKING_START' || event === 'SPEAKING_STOP') {
        const user = text(get(data, 'user_id'))
        if (!user || text(get(data, 'channel_id')) !== followed) return
        if (event === 'SPEAKING_START') speaking.add(user)
        else speaking.delete(user)
        notify()
      } else if (event === 'VOICE_SETTINGS_UPDATE' || event === 'VOICE_CHANNEL_SELECT') notify()
    }).catch((error: unknown) => {
      if (error instanceof RpcError && error.code === 4000) {
        throw new Unavailable('Discord did not recognize the application ID. Enter it again.', 'setup')
      }
      throw new Unavailable('Discord did not answer. Trying again…', null)
    })
    if (!opened) throw new Closed()
    rpc = opened
    void opened.closed.then(() => {
      if (rpc !== opened) return
      rpc = null
      forget()
      notify()
    })
    return opened
  }

  async function session(): Promise<RpcConnection> {
    const stored = await credentials()
    if (!stored) throw new Unavailable('Connect your Discord application to show your voice room.', 'setup')
    const open = await connection(stored)
    if (self !== null) return open
    if (!stored.token) throw new Unavailable('Authorize Orca in Discord to show your voice room.', 'authorize')

    let token = stored.token
    if (token.expiresAt < Date.now() + 60_000) {
      token = await exchange(stored, { refreshToken: token.refreshToken }).catch(async (error: unknown) => {
        if (error instanceof Unavailable && error.fix === 'setup') await save(null)
        else await save({ ...stored, token: null })
        throw error
      })
      await save({ ...stored, token })
    }
    const authenticated = await open.request('AUTHENTICATE', { access_token: token.accessToken }).catch(async () => {
      await save({ ...stored, token: null })
      throw new Unavailable('Discord signed Orca out. Authorize again.', 'authorize')
    })
    self = text(get(get(authenticated, 'user'), 'id')) ?? ''
    await Promise.all(['VOICE_SETTINGS_UPDATE', 'VOICE_CHANNEL_SELECT'].map(event =>
      open.subscribe(event).catch(() => undefined)
    ))
    return open
  }

  async function voice(open: RpcConnection) {
    const [settings, channel] = await Promise.all([
      open.request('GET_VOICE_SETTINGS'),
      open.request('GET_SELECTED_VOICE_CHANNEL')
    ])
    const microphone: Microphone = get(settings, 'mute') === true || get(settings, 'deaf') === true ? 'muted' : 'unmuted'
    return { microphone, channel: channel ?? null }
  }

  async function authorize() {
    const stored = await credentials()
    if (!stored) throw new Unavailable('Connect your Discord application first.', 'setup')
    disconnect()
    const open = await connection(stored)
    const answer = await open.request('AUTHORIZE', { client_id: stored.clientId, scopes }, 120_000).catch(() => {
      throw new Error('Discord did not authorize Orca. Select Authorize in Discord and try again.')
    })
    const code = text(get(answer, 'code'))
    if (!code) throw new Error('Discord did not authorize Orca.')
    const token = await exchange(stored, { code }).catch(async (error: unknown) => {
      if (error instanceof Unavailable && error.fix === 'setup') await save(null)
      throw error
    })
    await save({ ...stored, token })
    self = null
  }

  async function popOut() {
    if (!host) throw new Error('Discord Companion requires macOS or Windows.')
    const computer = options.computer ?? computerFor(host)
    const result = await computer('get-app-state', ['--max-elements', '3500'])
    const snapshot = get(result, 'snapshot')
    const tree = get(snapshot, 'treeText')
    const disabled = get(snapshot, 'disabledElementIndexes')
    if (typeof tree !== 'string') throw new Error('Discord did not return its window contents.')
    const control = findPopOut(tree, new Set(Array.isArray(disabled) ? disabled.filter(id => typeof id === 'number') : []))
    if (control === null) {
      if (platform === 'win32' && !/^\t*\d+ document /m.test(tree)) {
        throw new Error('Quit Discord from the system tray, then select Open Discord to enable Pop out.')
      }
      throw new Error('Open the call in Discord to show its Pop Out control.')
    }
    await computer('click', ['--element-index', String(control)])
  }

  return {
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async read() {
      if (!host) return { kind: 'unavailable', reason: 'Discord Companion requires macOS or Windows.', fix: null }
      // A request on a connection Discord just closed fails; reconnect once to learn whether Discord quit.
      for (let attempt = 0; ; attempt++) {
        try {
          const open = await session()
          const { microphone, channel } = await voice(open)
          await follow(open, text(get(channel, 'id')))
          if (!channel) return { kind: 'idle', microphone }
          return {
            kind: 'connected',
            room: text(get(channel, 'name')) ?? 'Discord call',
            microphone,
            participants: participantsOf(channel, self, microphone, speaking)
          }
        } catch (error) {
          if (error instanceof Unavailable) return { kind: 'unavailable', reason: error.message, fix: error.fix }
          disconnect()
          if (attempt > 0) return { kind: 'unavailable', reason: 'Discord did not answer. Trying again…', fix: null }
        }
      }
    },

    async act(action) {
      if (!host) throw new Error('Discord Companion requires macOS or Windows.')
      switch (action.kind) {
        case 'setup': {
          const clientId = action.clientId.trim()
          const clientSecret = action.clientSecret.trim()
          if (!/^\d{17,20}$/.test(clientId)) throw new Error('Enter the Application ID from the Discord Developer Portal.')
          if (!clientSecret) throw new Error('Enter the client secret from the Discord Developer Portal.')
          await save({ clientId, clientSecret, token: null })
          await authorize()
          return
        }
        case 'authorize':
          await authorize()
          return
        case 'microphone': {
          const open = await session()
          const settings = await open.request('SET_VOICE_SETTINGS', { mute: action.muted })
          if (get(settings, 'mute') !== action.muted) throw new Error('Discord did not confirm the microphone change.')
          notify()
          return
        }
        case 'open': {
          const launch = options.launch ?? host.launch
          const outcome = await session().then(voice).then(({ channel }) => channel, (error: unknown) => error)
          if (outcome instanceof Closed) {
            await launch()
            return
          }
          const channel = outcome instanceof Error ? null : outcome
          const id = text(get(channel, 'id'))
          const guild = text(get(channel, 'guild_id')) ?? '@me'
          await (options.show ?? host.show)(id && /^(?:\d+|@me)$/.test(guild) && /^\d+$/.test(id)
            ? `discord://-/channels/${guild}/${id}`
            : null).catch(launch)
          return
        }
        case 'pop-out':
          await popOut()
          return
      }
    }
  }
}
