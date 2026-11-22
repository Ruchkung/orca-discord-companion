import {
  atom, Badge, Button, Code, Heading, Input, Link, List, ListItem, plugin, read, Row, set, Stack, Text,
  type PanelContext
} from 'orca'
import type { DiscordAction, DiscordState } from './protocol'

const state = atom<DiscordState>({ kind: 'starting' })
const busy = atom(false)
const error = atom<string | null>(null)
const clientId = atom('')
const clientSecret = atom('')

async function act(action: DiscordAction): Promise<void> {
  if (read(busy)) return
  set(busy, true)
  set(error, null)
  try {
    const result = await plugin.request('discord.action', action)
    set(state, result.state)
    set(error, result.error)
    if (action.kind === 'setup' && !result.error) set(clientSecret, '')
  } catch {
    set(error, 'Orca could not reach the Discord worker.')
  } finally {
    set(busy, false)
  }
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('discord.changed', next => set(state, next)))
  void plugin.request('discord.state').then(next => set(state, next)).catch(() => {
    set(state, { kind: 'unavailable', reason: 'Orca could not reach the Discord worker.', fix: null })
  })
}

function SetupForm({ pending }: { pending: boolean }) {
  return (
    <Stack gap="sm">
      <Text muted size="sm">
        Create an application in the <Link href="https://discord.com/developers/applications">Discord Developer Portal</Link>.
        Add <Code>http://localhost</Code> under OAuth2 → Redirects, then copy its Application ID and client secret here.
      </Text>
      <Input label="Application ID" value={read(clientId)} onChange={value => set(clientId, value)} disabled={pending} />
      <Input label="Client secret" type="password" value={read(clientSecret)}
        onChange={value => set(clientSecret, value)} disabled={pending} />
      <Row>
        <Button disabled={pending || !read(clientId).trim() || !read(clientSecret).trim()}
          onPress={() => act({ kind: 'setup', clientId: read(clientId), clientSecret: read(clientSecret) })}>
          Connect to Discord
        </Button>
      </Row>
      {pending && <Text muted size="sm">Select Authorize in Discord to finish.</Text>}
    </Stack>
  )
}

export default function Panel() {
  const current = read(state)
  const pending = read(busy)
  const failure = read(error)
  const connected = current.kind === 'connected'
  const microphone = current.kind === 'idle' || connected ? current.microphone : null
  const fix = current.kind === 'unavailable' ? current.fix : null

  return (
    <Stack gap="md">
      <Row justify="between" wrap>
        <Heading>{connected ? current.room : 'Discord'}</Heading>
        {connected && (
          <Badge tone="accent">{current.participants.length} {current.participants.length === 1 ? 'person' : 'people'}</Badge>
        )}
      </Row>
      {current.kind === 'starting' && <Text muted>Connecting to Discord Desktop…</Text>}
      {current.kind === 'unavailable' && <Text muted>{current.reason}</Text>}
      {current.kind === 'idle' && <Text muted>You’re not in a voice room.</Text>}
      {microphone && <Text muted size="sm">{microphone === 'muted' ? 'Microphone muted' : 'Microphone on'}</Text>}
      {fix === 'setup' && <SetupForm pending={pending} />}
      {fix === 'authorize' && (
        <Row>
          <Button disabled={pending} onPress={() => act({ kind: 'authorize' })}>Authorize in Discord</Button>
        </Row>
      )}
      {(microphone || fix === 'open') && <Row gap="xs" wrap>
        {microphone && (
          <Button disabled={pending} onPress={() => act({ kind: 'microphone', muted: microphone === 'unmuted' })}>
            {microphone === 'muted' ? 'Unmute mic' : 'Mute mic'}
          </Button>
        )}
        <Button variant="ghost" icon="open-external" disabled={pending} onPress={() => act({ kind: 'open' })}>
          {connected ? 'Switch to voice room' : 'Open Discord'}
        </Button>
        {connected && (
          <Button variant="ghost" disabled={pending} onPress={() => act({ kind: 'pop-out' })}>Pop out call</Button>
        )}
      </Row>}
      {failure && <Text tone="danger">{failure}</Text>}
      {connected && current.participants.length > 0 && (
        <List label="Voice participants">
          {current.participants.map(({ name, muted }, index) => (
            <ListItem key={index} title={name} description={muted ? 'Muted' : undefined} />
          ))}
        </List>
      )}
    </Stack>
  )
}
