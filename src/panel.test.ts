import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { assert, test } from 'orca/testing'
import type { DiscordAction, DiscordState } from './protocol'

type Node = {
  tag: string
  className: string
  text: string
  disabled: boolean
  children: Node[]
  listeners: Record<string, ((event: unknown) => void)[]>
  attributes: Record<string, string>
  style: Record<string, string>
  append(...items: (Node | string)[]): void
  replaceChildren(...items: Node[]): void
  addEventListener(type: string, handler: (event: unknown) => void): void
  setAttribute(name: string, value: string): void
  classList: { add(name: string): void }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
}

/** Just enough DOM to run the panel's own script and read what it draws. */
function fakeDocument() {
  const make = (tag: string, text = ''): Node => {
    const node: Node = {
      tag, className: '', text, disabled: false, children: [], listeners: {}, attributes: {}, style: {},
      append(...items) { node.children.push(...items.map(item => typeof item === 'string' ? make('#text', item) : item)) },
      replaceChildren(...items) { node.children = items },
      addEventListener(type, handler) { (node.listeners[type] ??= []).push(handler) },
      setAttribute(name, value) { node.attributes[name] = value },
      classList: { add(name) { node.className = node.className ? `${node.className} ${name}` : name } },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 })
    }
    Object.defineProperty(node, 'textContent', { get: () => node.text, set: (value: string) => { node.text = value } })
    return node
  }
  const app = make('main')
  const document = {
    getElementById: () => app,
    createElement: (tag: string) => make(tag),
    createTextNode: (text: string) => make('#text', text)
  }
  const flat = (node: Node): Node[] => [node, ...node.children.flatMap(flat)]
  return { app, document, flat, texts: () => flat(app).map(node => node.text).filter(Boolean) }
}

async function load(state: DiscordState, onAction: (action: DiscordAction) => DiscordState = () => state, extras = false) {
  const page = fakeDocument()
  const html = readFileSync(new URL('../panel/index.html', import.meta.url), 'utf8')
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const events: Record<string, (payload: unknown) => void> = {}
  const orca = {
    plugin: {
      request: async (name: string, input?: DiscordAction) =>
        name === 'discord.state' ? state : { state: onAction(input as DiscordAction), error: null },
      on: (event: string, handler: (payload: unknown) => void) => { events[event] = handler }
    }
  }
  const glass: Record<string, unknown>[] = []
  const stars: boolean[] = []
  const counts: number[] = []
  const layers: string[] = []
  const sparks: number[][] = []
  const discordGlass: Record<string, unknown> = { mountGlass: (_host: unknown, props: Record<string, unknown>) => { glass.push(props) } }
  if (extras) {
    discordGlass.showStar = (_host: unknown, on: boolean) => { stars.push(on) }
    discordGlass.mountCounter = (_host: unknown, value: number) => { counts.push(value) }
    discordGlass.mountBackdrop = () => { layers.push('backdrop') }
    discordGlass.mountSpark = () => { layers.push('spark') }
    discordGlass.spark = (_host: unknown, x: number, y: number) => { sparks.push([x, y]) }
  }
  const window = { discordGlass }
  runInNewContext(script, { document: page.document, orca, window, setTimeout, console })
  await new Promise(resolve => setTimeout(resolve, 0))
  return { ...page, events, glass, stars, counts, layers, sparks }
}

test('shows the room, the roster, who is speaking and who is muted', async () => {
  const { texts, flat, app } = await load({
    kind: 'connected', room: 'Planning', microphone: 'unmuted',
    participants: [
      { name: 'Ada Lovelace', muted: false, speaking: true },
      { name: 'Lin (ops)', muted: true, speaking: false }
    ]
  })
  assert.deepEqual(texts().filter(text => ['Planning', '2 people', 'Ada Lovelace', 'AL', 'Speaking', 'Lin (ops)', 'LO', 'Muted'].includes(text)),
    ['Planning', '2 people', 'AL', 'Ada Lovelace', 'Speaking', 'LO', 'Lin (ops)', 'Muted'])
  assert.deepEqual(flat(app).filter(node => node.tag === 'li').map(node => node.className),
    ['person speaking', 'person muted'])
})

test('keeps the speaking state of someone who is muted off', async () => {
  const { flat, app } = await load({
    kind: 'connected', room: 'Planning', microphone: 'unmuted',
    participants: [{ name: 'Ada', muted: true, speaking: true }]
  })
  assert.deepEqual(flat(app).filter(node => node.tag === 'li').map(node => node.className), ['person speaking muted'])
})

test('sends the microphone action and follows the worker’s next state', async () => {
  const actions: DiscordAction[] = []
  const { events, texts, glass } = await load({ kind: 'idle', microphone: 'muted' }, action => {
    actions.push(action)
    return { kind: 'idle', microphone: 'unmuted' }
  })
  assert.ok(texts().includes('Microphone muted'))
  const unmute = glass.find(props => props.label === 'Unmute mic')
  assert.ok(unmute)
  await (unmute.onPress as () => Promise<unknown>)()
  // The panel's script runs in its own realm, so compare plain JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(actions)), [{ kind: 'microphone', muted: false }])
  assert.ok(texts().includes('Microphone on'))
  assert.ok(glass.some(props => props.label === 'Mute mic'))
  events['discord.changed']?.({ kind: 'idle', microphone: 'muted' })
  assert.ok(texts().includes('Microphone muted'))
})

test('asks for the application ID and secret when setup is needed', async () => {
  const actions: DiscordAction[] = []
  const { flat, app } = await load({ kind: 'unavailable', reason: 'Connect your Discord application.', fix: 'setup' }, action => {
    actions.push(action)
    return { kind: 'unavailable', reason: 'Authorize Orca in Discord.', fix: 'authorize' }
  })
  const inputs = flat(app).filter(node => node.tag === 'input')
  assert.equal(inputs.length, 2)
  inputs[0]?.listeners.input?.[0]?.({})
  const form = flat(app).find(node => node.tag === 'form')
  assert.ok(form)
  form.listeners.submit?.[0]?.({ preventDefault() {} })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(actions[0]?.kind, 'setup')
})

test('draws the microphone as wide clear glass that keeps its red, and the rest as round icons', async () => {
  const muted = await load({ kind: 'connected', room: 'Planning', microphone: 'muted', participants: [] })
  const mic = muted.glass.find(props => props.label === 'Unmute mic')
  assert.ok(mic)
  assert.equal(mic.material, 'clear')
  assert.equal(mic.tintColor, '#e0475c')
  assert.deepEqual(muted.glass.filter(props => props.icon).map(props => [props.label, props.icon]),
    [['Switch to voice room', 'enter'], ['Pop out call', 'popout']])
  const live = await load({ kind: 'idle', microphone: 'unmuted' })
  assert.equal(live.glass.find(props => props.label === 'Mute mic')?.tintColor, '#2fbf74')
  assert.deepEqual(live.glass.map(props => props.label), ['Mute mic', 'Open Discord'])
})

test('puts the star on whoever is speaking and rolls the head count', async () => {
  const { stars, counts, events, flat, app } = await load({
    kind: 'connected', room: 'Planning', microphone: 'unmuted',
    participants: [{ name: 'Ada', muted: false, speaking: true }, { name: 'Lin', muted: false, speaking: false }]
  }, undefined, true)
  assert.deepEqual(stars, [true, false])
  assert.deepEqual(counts, [2])
  // The first draw only learns who is here, so nobody slides in; a newcomer does.
  assert.deepEqual(flat(app).filter(node => node.tag === 'li').map(node => node.className), ['person speaking', 'person'])
  events['discord.changed']?.({
    kind: 'connected', room: 'Planning', microphone: 'unmuted',
    participants: [{ name: 'Ada', muted: false, speaking: true }, { name: 'Lin', muted: false, speaking: false }, { name: 'Grace', muted: false, speaking: false }]
  })
  assert.deepEqual(flat(app).filter(node => node.tag === 'li').map(node => node.className), ['person speaking', 'person', 'person enter'])
  assert.equal(counts.at(-1), 3)
})

test('mounts the stage layers once and bursts sparks from the microphone button', async () => {
  const { layers, sparks, glass, events } = await load({ kind: 'idle', microphone: 'muted' }, undefined, true)
  assert.deepEqual(layers, ['backdrop', 'spark'])
  const mic = glass.find(props => props.label === 'Unmute mic')
  assert.ok(mic)
  await (mic.onPress as () => Promise<unknown>)()
  assert.equal(sparks.length, 1)
  // Redrawing keeps the same layers instead of building new canvases.
  events['discord.changed']?.({ kind: 'idle', microphone: 'unmuted' })
  assert.deepEqual(layers, ['backdrop', 'spark'])
})
