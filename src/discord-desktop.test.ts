import { assert, test } from 'orca/testing'
import { createDesktop, decodeComputerResponse } from './discord-desktop'

const idleSnapshot = {
  snapshot: {
    treeText: [
      '0 standard window Discord',
      '\t1 container User status and settings',
      '\t\t2 switch (settable) Mute, Value: 1'
    ].join('\n'),
    disabledElementIndexes: []
  }
}

test('offers to open Discord when it is closed and reads it after startup', async () => {
  let running = false
  const actions: string[] = []
  const desktop = createDesktop('darwin', async command => {
    actions.push(command)
    return running ? idleSnapshot : decodeComputerResponse('{"ok":false,"error":{"code":"app_not_found"}}')
  }, async () => { running = true })

  assert.deepEqual(await desktop.read(), {
    kind: 'unavailable', reason: 'Discord Desktop is closed. Select Open Discord to launch it.', canOpen: true
  })
  await desktop.act({ kind: 'open' })
  assert.deepEqual(await desktop.read(), { kind: 'idle', microphone: 'muted' })
  assert.deepEqual(actions, ['get-app-state', 'get-app-state', 'get-app-state'])
})

test('reports hidden windows, missing permissions, and transient replies and recovers', async () => {
  let reply = '{"ok":false,"error":{"code":"window_not_found"}}'
  const desktop = createDesktop('darwin', async () => decodeComputerResponse(reply))
  const state = async () => {
    const current = await desktop.read()
    return current.kind === 'unavailable' ? current.reason : current.kind
  }

  assert.match(await state(), /Restore or open/)
  reply = '{"ok":false,"error":{"code":"accessibility_permission_denied"}}'
  assert.match(await state(), /Privacy & Security/)
  reply = ''
  assert.match(await state(), /Trying again/)
  reply = JSON.stringify({ ok: true, result: idleSnapshot })
  assert.equal(await state(), 'idle')
})

test('does not invoke macOS commands on Windows', async () => {
  const unexpected = async () => { throw new Error('Unexpected process launch') }
  const desktop = createDesktop('win32', unexpected, unexpected)
  assert.deepEqual(await desktop.read(), {
    kind: 'unavailable', reason: 'Discord Companion requires macOS.', canOpen: false
  })
  await assert.rejects(desktop.act({ kind: 'open' }), /requires macOS/)
})

test('reports a failed launch while keeping the closed state readable', async () => {
  const desktop = createDesktop('darwin',
    async () => decodeComputerResponse('{"ok":false,"error":{"code":"app_not_found"}}'),
    async () => { throw new Error('Install Discord Desktop to open it from Orca.') }
  )
  await assert.rejects(desktop.act({ kind: 'open' }), /Install Discord Desktop/)
  assert.equal((await desktop.read()).kind, 'unavailable')
})
