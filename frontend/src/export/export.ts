import { getNodesBounds, type Node } from '@xyflow/react'
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { toCanvas, toPng, toSvg } from 'html-to-image'
import type { Graph } from '../dsl/types'

const PAD = 40

// Flow animation: dashes march from source to target. One loop = one dash period,
// so the GIF repeats seamlessly. Keep in sync with the `flow` keyframes in index.css.
export const DASH = '8 6'
export const DASH_PERIOD = 14 // px, sum of DASH
export const GIF_FRAME_MS = 60 // 14 frames x 1px = 0.84s per loop

function exportOptions(nodes: Node[], pixelRatio: number) {
  const el = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!el) throw new Error('Canvas not ready')
  // child positions are parent-relative; top-level nodes (groups contain their children) give true bounds
  const bounds = getNodesBounds(nodes.filter((n) => !n.parentId))
  const width = Math.ceil(bounds.width + PAD * 2)
  const height = Math.ceil(bounds.height + PAD * 2)
  // 1:1 scale, content shifted so its bounds start at PAD
  const vp = { x: PAD - bounds.x, y: PAD - bounds.y, zoom: 1 }
  const bg = getComputedStyle(document.body).getPropertyValue('--canvas').trim() || '#fff'
  const opts = {
    backgroundColor: bg,
    width,
    height,
    pixelRatio,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
  }
  return { el, opts }
}

async function render(nodes: Node[], kind: 'svg' | 'png'): Promise<string> {
  const { el, opts } = exportOptions(nodes, 2)
  return kind === 'svg' ? toSvg(el, opts) : toPng(el, opts)
}

/**
 * Animated GIF of the flowing arrows. The live CSS animation is paused and the
 * dash offset is stepped 1px per frame through one full period, then each frame
 * is rasterised and encoded with a shared palette (stable colours, no flicker).
 */
export async function exportGif(nodes: Node[], name: string, onProgress?: (done: number, total: number) => void) {
  const canvasEl = document.querySelector<HTMLElement>('.canvas')
  if (!canvasEl) throw new Error('Canvas not ready')
  const { el, opts } = exportOptions(nodes, 1)
  const gif = GIFEncoder()
  let palette: ReturnType<typeof quantize> | null = null
  // The rasteriser copies inline styles as written, and CSS variables don't resolve
  // in the detached clone, so each frame writes concrete dash values onto the paths.
  const paths = [...el.querySelectorAll<SVGPathElement>('.react-flow__edge-path')]
  const saved = paths.map((p) => [p.style.strokeDasharray, p.style.strokeDashoffset] as const)
  canvasEl.classList.add('exporting') // pauses the live CSS animation
  try {
    for (let i = 0; i < DASH_PERIOD; i++) {
      for (const p of paths) {
        p.style.strokeDasharray = DASH
        p.style.strokeDashoffset = `${-i}px`
      }
      const frame = await toCanvas(el, opts)
      const { data, width, height } = frame.getContext('2d')!.getImageData(0, 0, frame.width, frame.height)
      palette ??= quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: GIF_FRAME_MS })
      onProgress?.(i + 1, DASH_PERIOD)
    }
  } finally {
    canvasEl.classList.remove('exporting')
    paths.forEach((p, k) => {
      p.style.strokeDasharray = saved[k][0]
      p.style.strokeDashoffset = saved[k][1]
    })
  }
  gif.finish()
  const blob = new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' })
  download(URL.createObjectURL(blob), `${name}.gif`)
}

function download(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

export async function exportImage(nodes: Node[], kind: 'svg' | 'png', name: string) {
  download(await render(nodes, kind), `${name}.${kind}`)
}

/** Stretch goal: Mermaid flowchart with subgraphs for groups. Icons are dropped. */
export function toMermaid(graph: Graph): string {
  const q = (s: string) => `"${s.replace(/"/g, "'")}"`
  const lines = ['flowchart LR']
  const write = (parent: string | null, indent: string) => {
    for (const g of graph.groups.filter((x) => x.parent === parent)) {
      lines.push(`${indent}subgraph ${g.id}[${q(g.attrs.label ?? g.id)}]`)
      write(g.id, indent + '  ')
      lines.push(`${indent}end`)
    }
    for (const n of graph.nodes.filter((x) => x.parent === parent)) {
      lines.push(`${indent}${n.id}[${q(n.attrs.label ?? n.id)}]`)
    }
  }
  write(null, '  ')
  const op = { forward: '-->', both: '<-->', none: '---' }
  for (const e of graph.edges) {
    lines.push(`  ${e.from} ${op[e.arrow]}${e.label ? `|${q(e.label)}|` : ''} ${e.to}`)
  }
  return lines.join('\n')
}

export function downloadText(text: string, filename: string) {
  download(URL.createObjectURL(new Blob([text], { type: 'text/plain' })), filename)
}
