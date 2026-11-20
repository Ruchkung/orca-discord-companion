import type { DiscordState, Microphone } from './protocol'

type Element = {
  id: number
  role: string
  name: string
  parents: number[]
}

export type DiscordView = {
  state: Extract<DiscordState, { kind: 'idle' | 'connected' }>
  microphoneControl: number | null
  popOutControl: number | null
}

function elementsFromTree(tree: string): Element[] {
  const elements: Element[] = []
  const path: Element[] = []

  for (const line of tree.split('\n')) {
    const row = /^(\t*)(\d+) (\S+)(?: \([^)]*\))?(?: (.*))?$/.exec(line)
    if (!row) continue
    const depth = row[1].length
    path.splice(depth)
    const element = {
      id: Number(row[2]),
      role: row[3],
      name: row[4] ?? '',
      parents: path.map(parent => parent.id)
    }
    path[depth] = element
    elements.push(element)
  }

  return elements
}

function activeChannelParticipants(elements: Element[], channel: Element) {
  const rows = elements.filter(element => element.parents.at(-1) === channel.id)
  const participants = rows.flatMap((row, index) => {
    if (row.role !== 'container' || row.name) return []
    const profile = elements.find(element => element.parents.at(-1) === row.id && element.role === 'button')
    if (!profile?.name) return []

    const nameRow = rows[index + 1]
    const displayName = nameRow?.role === 'container' && !nameRow.name
      ? elements.find(element => element.parents.at(-1) === nameRow.id && element.role === 'text')?.name
      : undefined
    let muted = false
    for (const status of rows.slice(index + (displayName ? 2 : 1))) {
      if (status.role !== 'text') break
      if (status.name === 'Muted') muted = true
    }
    return [{ name: displayName || profile.name, muted }]
  })
  if (participants.length) return participants

  // The channel link names the callers even when Discord collapses its roster.
  const summary = / \(voice channel\), (.+), call duration /i.exec(channel.name)?.[1]
  if (!summary) return null
  const names = summary.split(', ').map(name => name.trim())
  if (names.some(name => !name || /^(?:and )?\d+ (?:more|others?)$/i.test(name))) return null
  return names.map(name => ({ name, muted: false }))
}

export function parseDiscordView(tree: string, disabled: ReadonlySet<number>): DiscordView | null {
  const elements = elementsFromTree(tree)
  const account = elements.find(element => element.role === 'container' && element.name === 'User status and settings')
  if (!account) return null

  const inAccount = (element: Element) => element.parents.includes(account.id)
  const mic = elements.find(element =>
    inAccount(element) && element.role === 'switch' && /^(?:Mute|Unmute), Value: [01]$/.test(element.name)
  )
  const microphone: Microphone = mic ? (mic.name.endsWith('1') ? 'muted' : 'unmuted') : 'unknown'
  const microphoneControl = mic && !disabled.has(mic.id) ? mic.id : null
  const accountSection = account.parents.at(-1)
  const voiceDetails = elements.find(element =>
    inAccount(element) && element.role === 'button' &&
    /^(?:Voice Details )?Voice Connected$/i.test(element.name)
  )
  const connection = voiceDetails ?? elements.find(element =>
    accountSection !== undefined && element.parents.includes(accountSection) &&
    !inAccount(element) &&
    ['button', 'text', 'link', 'container'].includes(element.role) &&
    /^(?:Voice Connected|Voice connection info|Disconnect(?: from (?:Voice|Call))?)$/i.test(element.name)
  )
  if (!connection) {
    return { state: { kind: 'idle', microphone }, microphoneControl, popOutControl: null }
  }

  const connectionGroup = voiceDetails
    ? voiceDetails.parents.at(-1)
    : connection.parents[connection.parents.indexOf(accountSection ?? -1) + 1] ?? accountSection
  const roomLink = elements.find(element =>
    connectionGroup !== undefined &&
    element.parents.includes(connectionGroup) &&
    inAccount(element) === Boolean(voiceDetails) &&
    element.id !== connection.id &&
    (element.role === 'link' || element.role === 'button') &&
    (element.name.includes(' / ') || /^Go to (?:voice channel|call): /i.test(element.name))
  )
  const linkLabel = roomLink?.name.match(/^\[(.*)\]\(https:\/\/discord\.com\/channels\/[^)]+\)$/)?.[1]
  const channelMatch = linkLabel
    ? elements.flatMap(element => {
        if (element.role !== 'link' || inAccount(element)) return []
        const name = /^(.*) \(voice channel\)(?:,|$)/.exec(element.name)?.[1]
        return name && (linkLabel === name || linkLabel.startsWith(name + ' / ')) ? [{ element, name }] : []
      }).sort((left, right) => right.name.length - left.name.length)[0]
    : undefined
  const serverSeparator = linkLabel?.lastIndexOf(' / ') ?? -1
  const room = channelMatch?.name ??
    (linkLabel && serverSeparator >= 0 ? linkLabel.slice(0, serverSeparator) :
      linkLabel ?? roomLink?.name.replace(/^Go to (?:voice channel|call): /i, '').split(' / ')[0])?.trim() ?? null

  // Discord keeps the call grid separate from the account panel. Read only explicit voice lists.
  const roster = elements.find(element =>
    ['list', 'container', 'group'].includes(element.role) &&
    /^(?:Voice (?:channel )?(?:participants|members|users)|Call participants)$/i.test(element.name)
  )
  const participants = roster ? elements.filter(element =>
    element.parents.at(-1) === roster.id && ['item', 'row', 'button', 'container'].includes(element.role)
  ).flatMap(element => {
    const label = element.name ||
      elements.find(child => child.parents.at(-1) === element.id && ['text', 'button'].includes(child.role))?.name || ''
    const name = label.replace(/, (?:muted|deafened|speaking|streaming)(?:,.*)?$/i, '').trim()
    return name ? [{ name, muted: /, muted(?:,|$)/i.test(label) }] : []
  }) : channelMatch ? activeChannelParticipants(elements, channelMatch.element) : null

  const callRegions = elements.filter(element => ['container', 'group', 'toolbar'].includes(element.role) &&
    /^(?:Voice (?:call|controls|channel controls)|Call (?:controls|view)|Video (?:call|controls))$/i.test(element.name))
  const popOut = elements.find(element =>
    element.role === 'button' &&
    /^(?:Pop Out(?: View| Player)?|Open Popout|Pop Out Video)$/i.test(element.name) &&
    callRegions.some(region => element.parents.includes(region.id)) &&
    !disabled.has(element.id)
  )

  return {
    state: { kind: 'connected', room, microphone, participants, canPopOut: popOut !== undefined },
    microphoneControl,
    popOutControl: popOut?.id ?? null
  }
}
