export type Microphone = 'muted' | 'unmuted' | 'unknown'

export type DiscordState =
  | { kind: 'starting' }
  | { kind: 'unavailable'; reason: string; canOpen: boolean }
  | { kind: 'idle'; microphone: Microphone }
  | {
      kind: 'connected'
      room: string | null
      microphone: Microphone
      participants: { name: string; muted: boolean }[] | null
      canPopOut: boolean
    }

export type DiscordAction =
  | { kind: 'open' }
  | { kind: 'pop-out' }
  | { kind: 'microphone'; muted: boolean }

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
