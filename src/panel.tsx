import {
  atom, Badge, Button, Heading, List, ListItem, plugin, read, Row, set, Stack, Text,
  type PanelContext
} from 'orca'
import type { DiscordAction, DiscordState } from './protocol'

const state = atom<DiscordState>({ kind: 'starting' })
const busy = atom(false)
const error = atom<string | null>(null)

async function act(action: DiscordAction): Promise<void> {
  if (read(busy)) return
  set(busy, true)
  set(error, null)
  try {
    const result = await plugin.request('discord.action', action)
    set(state, result.state)
    set(error, result.error)
  } catch {
    set(error, 'Orca could not reach the Discord worker.')
  } finally {
    set(busy, false)
  }
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('discord.changed', next => set(state, next)))
  void plugin.request('discord.state').then(next => set(state, next)).catch(() => {
    set(state, { kind: 'unavailable', reason: 'Orca could not reach the Discord worker.', canOpen: false })
  })
}

export default function Panel() {
  const current = read(state)
  const pending = read(busy)
  const failure = read(error)
  const connected = current.kind === 'connected'
  const microphone = current.kind === 'idle' || connected ? current.microphone : 'unknown'
  const count = connected ? current.participants?.length : undefined
  const title = connected ? current.room ?? 'Voice connected' : 'Discord'
  const canOpen = current.kind !== 'starting' && (current.kind !== 'unavailable' || current.canOpen)

  return (
    <Stack gap="md">
      <Row justify="between" wrap>
        <Heading>{title}</Heading>
        {count !== undefined && <Badge tone="accent">{count} {count === 1 ? 'person' : 'people'}</Badge>}
      </Row>
      {current.kind === 'starting' && <Text muted>Reading Discord Desktop…</Text>}
      {current.kind === 'unavailable' && <Text muted>{current.reason}</Text>}
      {current.kind === 'idle' && <Text muted>You’re not in a voice room.</Text>}
      {microphone !== 'unknown' && (
        <Text muted size="sm">{microphone === 'muted' ? 'Microphone muted' : 'Microphone on'}</Text>
      )}
      {canOpen && <Row gap="xs" wrap>
        {microphone !== 'unknown' && (
          <Button disabled={pending} onPress={() => act({ kind: 'microphone', muted: microphone === 'unmuted' })}>
            {microphone === 'muted' ? 'Unmute mic' : 'Mute mic'}
          </Button>
        )}
        <Button variant="ghost" icon="open-external" disabled={pending}
          onPress={() => act({ kind: 'open' })}>
          {connected ? 'Switch to voice room' : 'Open Discord'}
        </Button>
        {connected && current.canPopOut && (
          <Button variant="ghost" disabled={pending} onPress={() => act({ kind: 'pop-out' })}>Pop out stream</Button>
        )}
      </Row>}
      {failure && <Text tone="danger">{failure}</Text>}
      {connected && current.participants === null && (
        <Text muted size="sm">Open the voice room in Discord to show its participant list.</Text>
      )}
      {connected && current.participants && current.participants.length > 0 && (
        <List label="Voice participants">
          {current.participants.map(({ name, muted }, index) => (
            <ListItem key={index} title={name} description={muted ? 'Muted' : undefined} />
          ))}
        </List>
      )}
    </Stack>
  )
}
