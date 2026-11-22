import { assert, test } from 'orca/testing'
import { findPopOut } from './accessibility'

test('finds the macOS Pop Out button inside a named call region', () => {
  const tree = [
    '0 standard window Discord',
    '\t10 container Voice call',
    '\t\t11 container Call controls',
    '\t\t\t12 button Pop Out View'
  ].join('\n')
  assert.equal(findPopOut(tree, new Set()), 12)
  assert.equal(findPopOut(tree, new Set([12])), null)
})

// Redacted from Discord Desktop 1.0.9269 on Windows 11, started with --force-renderer-accessibility.
const windowsAccount = [
  '\t10 region User status and settings',
  '\t\t11 button Voice Details Voice Connected',
  '\t\t12 link Office // Floor 5 / Engineering, Value: https://discord.com/channels/123/456, Secondary Actions: SetValue',
  '\t\t13 button Disconnect',
  '\t\t14 switch Mute, Secondary Actions: SetValue, Toggle'
]

test('finds the Windows call view Pop Out button beside its Disconnect button', () => {
  const tree = [
    '0 window Office // Floor 5 | Engineering - Discord',
    ...windowsAccount,
    '\t20 heading Voice Channel Office // Floor 5',
    '\t21 button Disconnect',
    '\t22 button Pop Out',
    '\t23 button Full Screen'
  ].join('\n')
  assert.equal(findPopOut(tree, new Set()), 22)
})

test('ignores Pop Out buttons outside the call controls', () => {
  const tree = ['0 window Discord', ...windowsAccount, '\t20 group', '\t\t21 button Pop Out'].join('\n')
  assert.equal(findPopOut(tree, new Set()), null)
  assert.equal(findPopOut('0 window Discord\n\t1 region Discord\n\t\t2 region', new Set()), null)
})
