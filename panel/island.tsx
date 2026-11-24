import { createRoot, type Root } from 'react-dom/client'
import { GlassActionButton } from './glass/glass-action-button'

export type MicProps = {
  muted: boolean
  disabled: boolean
  /** Resolves when the worker has applied the change. */
  toggle: () => Promise<unknown>
}

const roots = new WeakMap<HTMLElement, Root>()

/** Draws the microphone button into `host`; call again with new props to update it in place. */
export function mountMic(host: HTMLElement, { muted, disabled, toggle }: MicProps): void {
  let root = roots.get(host)
  if (!root) {
    root = createRoot(host)
    roots.set(host, root)
  }
  root.render(
    <GlassActionButton
      material="tinted"
      className={muted ? 'border-white/40 bg-[#6d7cff] text-white' : 'border-white/40 bg-[#e0475c] text-white'}
      disabled={disabled}
      resetKey={muted}
      resetAfter={900}
      pendingLabel={muted ? 'Unmuting…' : 'Muting…'}
      successLabel={muted ? 'Mic on' : 'Muted'}
      onAction={toggle}
    >
      {muted ? 'Unmute mic' : 'Mute mic'}
    </GlassActionButton>
  )
}

declare global {
  interface Window { discordGlass?: { mountMic: typeof mountMic } }
}
window.discordGlass = { mountMic }
