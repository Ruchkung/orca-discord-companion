export type Microphone = 'muted' | 'unmuted'

/** What the panel offers when Discord is unavailable. */
export type Fix = 'setup' | 'authorize' | 'open'

export type DiscordState =
  | { kind: 'starting' }
  | { kind: 'unavailable'; reason: string; fix: Fix | null }
  | { kind: 'idle'; microphone: Microphone }
  | {
      kind: 'connected'
      room: string
      microphone: Microphone
      participants: { name: string; muted: boolean; speaking: boolean }[]
    }

export type DiscordAction =
  | { kind: 'open' }
  | { kind: 'pop-out' }
  | { kind: 'microphone'; muted: boolean }
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
