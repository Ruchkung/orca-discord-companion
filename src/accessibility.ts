type Element = {
  id: number
  role: string
  name: string
  parents: number[]
}

function elementsFromTree(tree: string): Element[] {
  const elements: Element[] = []
  const path: Element[] = []

  for (const line of tree.split('\n')) {
    const row = /^(\t*)(\d+) (\S+)(?: \([^)]*\))?(?: (.*))?$/.exec(line)
    if (!row) continue
    const depth = row[1].length
    path.splice(depth)
    // Windows appends the UI Automation patterns and value to each name; macOS appends only the value.
    const label = (row[4] ?? '').replace(/, Secondary Actions: [A-Za-z]+(?:, [A-Za-z]+)*$/, '')
    const element = {
      id: Number(row[2]),
      role: row[3],
      name: label.replace(/, Value: .*$/, ''),
      parents: path.map(parent => parent.id)
    }
    path[depth] = element
    elements.push(element)
  }

  return elements
}

/** Finds Discord's enabled Pop Out button in the call view, or null when the call view is not showing. */
export function findPopOut(tree: string, disabled: ReadonlySet<number>): number | null {
  const elements = elementsFromTree(tree)
  const account = elements.find(element => element.name === 'User status and settings')
  const inAccount = (element: Element) => account !== undefined && element.parents.includes(account.id)
  const callRegions = elements.filter(element => ['container', 'group', 'toolbar'].includes(element.role) &&
    /^(?:Voice (?:call|controls|channel controls)|Call (?:controls|view)|Video (?:call|controls))$/i.test(element.name))
  // Windows puts the call view's controls beside its Disconnect button instead of in a named region.
  const callControls = elements.flatMap(element =>
    element.role === 'button' && element.name === 'Disconnect' && !inAccount(element) ? [element.parents.at(-1)] : []
  )
  return elements.find(element =>
    element.role === 'button' &&
    /^(?:Pop Out(?: View| Player)?|Open Popout|Pop Out Video)$/i.test(element.name) &&
    (callRegions.some(region => element.parents.includes(region.id)) || callControls.includes(element.parents.at(-1))) &&
    !disabled.has(element.id)
  )?.id ?? null
}
