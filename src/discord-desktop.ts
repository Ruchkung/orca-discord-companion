import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { parseDiscordView } from './accessibility'
import type { DiscordAction, DiscordState } from './protocol'

const exec = promisify(execFile)
const app = 'com.hnc.Discord'
const cliCandidates = [
  '/Applications/Orca.app/Contents/Resources/bin/orca',
  '/opt/homebrew/bin/orca',
  '/usr/local/bin/orca'
]
const session = 'local.discord-companion'

export interface Desktop {
  read(): Promise<DiscordState>
  act(action: DiscordAction): Promise<void>
}

function get(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

async function computer(command: string, args: string[] = []): Promise<unknown> {
  const cli = cliCandidates.find(existsSync)
  if (!cli) throw new Error('Install Orca in Applications or install the Orca CLI.')
  const { stdout } = await exec(cli, [
    'computer', command, '--environment', 'local', '--app', app,
    '--session', session, '--no-screenshot', '--json', ...args
  ], { timeout: 3500, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' }).catch((error: unknown) => {
    const stdout = get(error, 'stdout')
    if (typeof stdout === 'string' && stdout.trim()) return { stdout }
    throw new Error('Orca could not read or control Discord Desktop.')
  })

  return decodeComputerResponse(stdout)
}

export function decodeComputerResponse(stdout: string): unknown {
  let response: unknown
  try {
    response = JSON.parse(stdout)
  } catch {
    throw new Error('Orca did not return a Discord snapshot. Trying again…')
  }
  if (get(response, 'ok') === true) return get(response, 'result')

  const code = get(get(response, 'error'), 'code')
  if (typeof code === 'string' && /permission|accessibility|denied/i.test(code)) {
    throw new Error('Allow Orca in macOS Privacy & Security → Accessibility.')
  }
  if (code === 'app_not_found' || code === 'app_not_running') {
    throw new Error('Discord Desktop is closed. Select Open Discord to launch it.')
  }
  if (typeof code === 'string' && /window.*(?:not_found|unavailable)|no_window|minimized/i.test(code)) {
    throw new Error('Restore or open a Discord Desktop window.')
  }
  throw new Error('Orca could not read or control Discord Desktop.')
}

async function inspect(runComputer: typeof computer) {
  const result = await runComputer('get-app-state', ['--max-elements', '3500'])
  const snapshot = get(result, 'snapshot')
  const tree = get(snapshot, 'treeText')
  const disabled = get(snapshot, 'disabledElementIndexes')
  if (typeof tree !== 'string') throw new Error('Discord did not return an accessibility view.')
  const view = parseDiscordView(tree, new Set(
    Array.isArray(disabled) ? disabled.filter((id): id is number => typeof id === 'number') : []
  ))
  if (!view) throw new Error('Keep a Discord window open and set Discord’s interface language to English.')
  return view
}

async function launchDiscord(): Promise<void> {
  await exec('/usr/bin/open', ['-b', app], { timeout: 3500 }).catch(() => {
    throw new Error('Install Discord Desktop to open it from Orca.')
  })
}

export function createDesktop(
  platform = process.platform,
  runComputer = computer,
  launch = launchDiscord
): Desktop {
  const supported = platform === 'darwin'
  const unsupportedMessage = 'Discord Companion requires macOS.'
  const desktop: Desktop = {
    async read() {
      if (!supported) return { kind: 'unavailable', reason: unsupportedMessage, canOpen: false }
      try {
        return (await inspect(runComputer)).state
      } catch (error) {
        return {
          kind: 'unavailable',
          reason: error instanceof Error ? error.message : 'Discord Desktop is unavailable.',
          canOpen: true
        }
      }
    },

    async act(action) {
      if (!supported) throw new Error(unsupportedMessage)
      if (action.kind === 'open') {
        const state = await desktop.read()
        await launch()
        if (state.kind === 'connected') await runComputer('hotkey', ['--key', 'Cmd+Shift+Alt+V'])
        return
      }

      // Use the fresh snapshot's element index before a later poll can replace it.
      const view = await inspect(runComputer)
      if (action.kind === 'pop-out') {
        if (view.popOutControl === null) throw new Error('Open the stream in Discord to show its Pop Out control.')
        await runComputer('click', ['--element-index', String(view.popOutControl)])
        return
      }

      if (view.microphoneControl === null) throw new Error('Discord’s microphone control is unavailable.')
      if ((view.state.microphone === 'muted') === action.muted) return
      await runComputer('click', ['--element-index', String(view.microphoneControl)])
      const updated = await inspect(runComputer)
      if (updated.state.microphone !== (action.muted ? 'muted' : 'unmuted')) {
        throw new Error('Discord did not confirm the microphone change.')
      }
    }
  }
  return desktop
}

export const desktop = createDesktop()
