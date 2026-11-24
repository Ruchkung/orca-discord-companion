import { createRoot, type Root } from 'react-dom/client'
import { GlassButton } from './glass/glass-button'
import Strands from './strands/strands'

export type GlassProps = {
  label: string
  material: 'clear' | 'tinted'
  /** Tinted glass takes its colour from the `bg-*` class. */
  className?: string
  /** Clear glass: how much tint covers what lies behind (0 to 1). */
  tint?: number
  disabled: boolean
  /** A returned promise keeps the button pending until it settles. */
  onPress: () => unknown
}

const roots = new WeakMap<HTMLElement, Root>()

/** Draws a glass button into `host`; call again with new props to update it in place. */
export function mountGlass(host: HTMLElement, { label, material, className, tint, disabled, onPress }: GlassProps): void {
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(
    <GlassButton material={material} size="md" tint={tint} className={className} disabled={disabled} onClick={onPress}>
      {label}
    </GlassButton>
  )
}

/** Draws the Strands orb into `host`; `level` (0 to 1) is how loud the room is. */
export function mountStrands(host: HTMLElement, level: number): void {
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(<Strands level={level} energy={0.3} interactive={false} clickPulse={false} intro={false} glassSize={1.1} />)
}

declare global {
  interface Window { discordGlass?: { mountGlass: typeof mountGlass; mountStrands: typeof mountStrands } }
}
window.discordGlass = { mountGlass, mountStrands }
