import type { OrcaWorkerApi } from 'orca/worker'
import { createDesktop, type Desktop } from './discord-desktop'
import type { DiscordAction, DiscordState } from './protocol'

function updateStatusBar(orca: OrcaWorkerApi, state: DiscordState) {
  if (state.kind !== 'connected') {
    return orca.host.call('statusBar.update', { id: 'discord-voice', visible: false })
  }

  const count = state.participants.length
  const room = state.room
  const microphone = state.microphone === 'muted' ? ' · Microphone muted' : ''
  return orca.host.call('statusBar.update', {
    id: 'discord-voice',
    text: room + ' · ' + count,
    tooltip: room + microphone + ' · Switch to Discord',
    tone: state.microphone === 'muted' ? 'neutral' : 'accent',
    visible: true
  })
}

function isDiscordAction(input: unknown): input is DiscordAction {
  if (typeof input !== 'object' || input === null || !('kind' in input)) return false
  return input.kind === 'open' || input.kind === 'pop-out' || input.kind === 'authorize' ||
    (input.kind === 'microphone' && 'muted' in input && typeof input.muted === 'boolean') ||
    (input.kind === 'setup' && 'clientId' in input && typeof input.clientId === 'string' &&
      'clientSecret' in input && typeof input.clientSecret === 'string')
}

export function start(orca: OrcaWorkerApi, connection: Desktop): () => void {
  let state: DiscordState = { kind: 'starting' }
  let pending: Promise<unknown> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  function run<T>(operation: () => Promise<T>): Promise<T> {
    const current = pending.then(operation)
    pending = current.catch(() => undefined)
    return current
  }

  async function refresh(): Promise<DiscordState> {
    const next = await connection.read()
    if (!stopped && JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      orca.panels.post('discord.changed', state)
      await updateStatusBar(orca, state).catch(() => undefined)
    }
    return state
  }

  async function poll(): Promise<void> {
    if (stopped) return
    try {
      await run(refresh)
    } catch {
      // Keep checking after a failed desktop read.
    } finally {
      if (!stopped) timer = setTimeout(() => { void poll() }, 2500)
    }
  }

  function act(action: DiscordAction) {
    return run(async () => {
      let error: string | null = null
      try {
        if (stopped) throw new Error('Discord Companion is disabled.')
        if (!isDiscordAction(action)) throw new Error('This Discord action is unavailable.')
        await connection.act(action)
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Discord could not complete the action.'
      }
      return { state: await refresh(), error }
    })
  }

  const subscriptions = [
    orca.panels.handle('discord.state', async () => {
      await pending
      return state
    }),
    orca.panels.handle('discord.action', act),
    orca.commands.register('open-discord', async () => {
      const result = await act({ kind: 'open' })
      return result.error ?? 'Switched to Discord.'
    })
  ]

  // Discord reports voice changes as they happen; the poll catches what it does not report.
  const unwatch = connection.onChange(() => { void run(refresh).catch(() => undefined) })
  void poll()

  return () => {
    stopped = true
    clearTimeout(timer)
    unwatch()
    for (const subscription of subscriptions) subscription.dispose()
  }
}

let stop: (() => void) | undefined

export default function activate(orca: OrcaWorkerApi): void {
  stop = start(orca, createDesktop({ vault: orca.secrets }))
}

export function deactivate(): void {
  stop?.()
  stop = undefined
}
