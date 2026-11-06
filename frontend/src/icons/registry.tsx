import { useState, type ReactNode } from 'react'
import type { IconInfo } from '../dsl/types'

// Official icon SVGs live in /public/icons/<key>.svg (see scripts/import-icons.mjs).
// When a file is missing we draw a provider-coloured tile with a category glyph,
// so the diagram still reads cleanly before any icon pack is installed.

const meta = new Map<string, IconInfo>()
export function setIconMeta(list: IconInfo[]) {
  meta.clear()
  for (const i of list) meta.set(i.key, i)
}

const PROVIDER_COLOR: Record<string, string> = {
  aws: 'var(--accent-aws)',
  gcp: 'var(--accent-cloud)',
  azure: 'var(--accent-cloud)',
}

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const GLYPHS: Record<string, ReactNode> = {
  compute: <g {...s}><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" /></g>,
  database: <g {...s}><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></g>,
  network: <g {...s}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" /></g>,
  storage: <g {...s}><path d="M5 7h14l-1.5 12h-11z" /><path d="M4 7c0-1.5 3.6-2.5 8-2.5S20 5.5 20 7" /></g>,
  integration: <g {...s}><rect x="4" y="8" width="4" height="8" rx="1" /><rect x="10" y="8" width="4" height="8" rx="1" /><rect x="16" y="8" width="4" height="8" rx="1" /></g>,
  monitoring: <g {...s}><path d="M3 12h4l2-5 4 10 2-5h6" /></g>,
  security: <g {...s}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></g>,
  person: <g {...s}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></g>,
  client: <g {...s}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M9 20h6M12 16v4" /></g>,
  devops: <g {...s}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></g>,
  analytics: <g {...s}><path d="M5 20V12M10 20V6M15 20v-9M20 20V4" /></g>,
  group: <g {...s}><path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1.2A4 4 0 0 1 17 18z" /></g>,
}

export function Icon({ iconKey, size = 44 }: { iconKey?: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const key = iconKey || 'generic-service'
  const info = meta.get(key)
  if (!failed) {
    return (
      <img src={`/icons/${key}.svg`} width={size} height={size} alt={info?.label ?? key}
        draggable={false} onError={() => setFailed(true)} style={{ display: 'block' }} />
    )
  }
  const color = PROVIDER_COLOR[info?.provider ?? key.split('-')[0]] ?? 'var(--accent-neutral)'
  if (size < 28) {
    // group header: glyph only, tinted
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, flex: 'none' }} aria-hidden>
        {GLYPHS[info?.category ?? 'group'] ?? GLYPHS.group}
      </svg>
    )
  }
  return (
    <div className="icon-fallback" style={{ width: size, height: size, background: color }} title={info?.label ?? key}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" aria-hidden>
        {GLYPHS[info?.category ?? 'compute'] ?? GLYPHS.compute}
      </svg>
    </div>
  )
}
