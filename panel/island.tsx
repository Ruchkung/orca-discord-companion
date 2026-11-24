import { createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GlassButton } from './glass/glass-button'
import ClickSpark, { type ClickSparkHandle } from './react-bits/click-spark'
import Counter from './react-bits/counter'
import DotGrid from './react-bits/dot-grid'
import FloatingLines from './react-bits/floating-lines'
import Noise from './react-bits/noise'
import ShinyText from './react-bits/shiny-text'
import StarBorder from './react-bits/star-border'

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
    <GlassButton material={material} size="md" tint={tint} live className={className} disabled={disabled} onClick={onPress}>
      {label}
    </GlassButton>
  )
}

/** Draws a number whose digits roll to each new value. */
export function mountCounter(host: HTMLElement, value: number): void {
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(<Counter value={value} intro={false} fontSize="1em" fontWeight="inherit" textColor="currentColor" />)
}

/** Lays a star that circles the edge over a roster row (on) or removes it (off). */
export function showStar(host: HTMLElement, on: boolean): void {
  let root = roots.get(host)
  if (!on) {
    root?.render(null)
    return
  }
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(
    <StarBorder
      as="div"
      className="pointer-events-none !absolute !inset-0 !p-0"
      radius={12}
      thickness={1.5}
      color="#3ddc84"
      trailColor="#3ddc84"
      backgroundColor="transparent"
      borderColor="transparent"
      hover="none"
      clickPulse={false}
      duration={3}
    />
  )
}

export type Backdrop = 'dots' | 'lines'

/** Fills `host` with the moving backdrop that the glass buttons bend. */
export function mountBackdrop(host: HTMLElement, kind: Backdrop): void {
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(
    kind === 'dots'
      ? <DotGrid dotSize={5} gap={16} baseColor="#5b6bff" activeColor="#ffd166" proximity={90} clickShock={false} />
      : <FloatingLines interactive={false} intro={false} backgroundColor="transparent" />
  )
}

/** A faint film grain over the stage. */
export function mountNoise(host: HTMLElement): void {
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(<Noise opacity={0.06} fps={12} blendMode="overlay" />)
}

const sparks = new WeakMap<HTMLElement, RefObject<ClickSparkHandle | null>>()

/** A layer that can burst sparks anywhere inside it. */
export function mountSpark(host: HTMLElement): void {
  if (roots.has(host)) return
  const ref = createRef<ClickSparkHandle>()
  sparks.set(host, ref)
  const root = createRoot(host)
  roots.set(host, root)
  root.render(<ClickSpark ref={ref} sparkColor={['#ffd166', '#ff6b9d', '#ffffff']} sparkCount={9} sparkRadius={26} duration={500} />)
}

export function spark(host: HTMLElement, x: number, y: number): void {
  sparks.get(host)?.current?.spark(x, y)
}

/** Text with a light that sweeps across it. */
export function mountShiny(host: HTMLElement, text: string): void {
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(<ShinyText text={text} color="currentColor" shineColor="#ffffff" speed={2.4} />)
}

declare global {
  interface Window { discordGlass?: { mountGlass: typeof mountGlass; mountCounter: typeof mountCounter; showStar: typeof showStar; mountBackdrop: typeof mountBackdrop; mountNoise: typeof mountNoise; mountSpark: typeof mountSpark; spark: typeof spark; mountShiny: typeof mountShiny } }
}
window.discordGlass = { mountGlass, mountCounter, showStar, mountBackdrop, mountNoise, mountSpark, spark, mountShiny }
