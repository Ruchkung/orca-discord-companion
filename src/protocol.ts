export type Microphone = 'muted' | 'unmuted'

/** What the panel offers when Discord is unavailable. */
export type Fix = 'setup' | 'authorize' | 'open'

/** `volume` is Discord's per-person output level: 0 to 200, 100 by default. `id` is empty when Discord did not send one. */
export type Participant = { id: string; name: string; muted: boolean; speaking: boolean; self: boolean; volume: number }

export type DiscordState =
  | { kind: 'starting' }
  | { kind: 'unavailable'; reason: string; fix: Fix | null }
  | { kind: 'idle'; microphone: Microphone }
  | {
      kind: 'connected'
      room: string
      microphone: Microphone
      participants: Participant[]
    }

export type DiscordAction =
  | { kind: 'open' }
  | { kind: 'pop-out' }
  | { kind: 'microphone'; muted: boolean }
  | { kind: 'volume'; user: string; volume: number }
  | { kind: 'authorize' }
  | { kind: 'setup'; clientId: string; clientSecret: string }

declare module 'orca' {
  interface PluginRequests {
    'discord.state': { output: DiscordState }
    'discord.action': {
      input: DiscordAction
      output: { state: DiscordState; error: string | null }
    }
  }
  interface PluginPanelEvents {
    'discord.changed': DiscordState
  }
}
