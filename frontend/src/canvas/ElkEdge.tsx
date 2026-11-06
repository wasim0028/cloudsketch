import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react'
import type { Point } from '../layout/elk'

export type ElkEdgeData = { points?: Point[]; labelPos?: Point }

/** Rounded orthogonal polyline through ELK's route. */
function roundedPath(pts: Point[], r = 6): string {
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]]
    const r1 = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    const dir = (p: Point, q: Point) => {
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
      return { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    }
    const d1 = dir(b, a)
    const d2 = dir(b, c)
    d += ` L ${b.x + d1.x * r1} ${b.y + d1.y * r1} Q ${b.x} ${b.y} ${b.x + d2.x * r1} ${b.y + d2.y * r1}`
  }
  const last = pts[pts.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

/**
 * Uses ELK's route while it is valid. Once a connected node is dragged the route
 * is cleared (data.points = undefined) and we fall back to React Flow's smoothstep.
 */
export function ElkEdge(props: EdgeProps<Edge<ElkEdgeData>>) {
  const { data, label, markerEnd, markerStart, style } = props
  let path: string
  let lx: number
  let ly: number

  if (data?.points && data.points.length >= 2) {
    path = roundedPath(data.points)
    // label sits on the line: middle of the longest segment
    {
      // middle of the longest segment
      let best = 0
      for (let i = 1; i < data.points.length; i++) {
        const [a, b] = [data.points[i - 1], data.points[i]]
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len > best) { best = len; lx = (a.x + b.x) / 2; ly = (a.y + b.y) / 2 }
      }
    }
  } else {
    ;[path, lx, ly] = getSmoothStepPath({ ...props, borderRadius: 6, offset: 16 })
  }

  return (
    <>
      {/* stroke + dash set inline (not only via CSS) so SVG/PNG/GIF export keeps them.
          --edge-dash / --edge-dash-offset come from the canvas (flow animation, GIF frames). */}
      <BaseEdge path={path} markerEnd={markerEnd} markerStart={markerStart}
        style={{
          stroke: 'var(--edge)', strokeWidth: 1.25,
          strokeDasharray: 'var(--edge-dash, none)', strokeDashoffset: 'var(--edge-dash-offset, 0)',
          ...style,
        }} />
      {label && (
        <EdgeLabelRenderer>
          <div className="edge-label" style={{ transform: `translate(-50%, -50%) translate(${lx!}px, ${ly!}px)` }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { elk: ElkEdge }
