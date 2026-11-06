import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { Graph } from '../dsl/types'
import { edgeId, type Layout } from '../layout/elk'
import type { ElkEdgeData } from './ElkEdge'

const humanize = (id: string) => id.replace(/([a-z0-9])([A-Z])/g, '$1 $2')

/** Convert validated graph + layout into React Flow nodes/edges. Parents must precede children. */
export function toFlow(graph: Graph, layout: Layout): { nodes: Node[]; edges: Edge<ElkEdgeData>[] } {
  const depth = new Map<string, number>()
  const groupById = new Map(graph.groups.map((g) => [g.id, g]))
  const depthOf = (id: string | null): number => {
    if (!id) return 0
    if (!depth.has(id)) depth.set(id, 1 + depthOf(groupById.get(id)?.parent ?? null))
    return depth.get(id)!
  }

  const groups: Node[] = [...graph.groups]
    .sort((a, b) => depthOf(a.id) - depthOf(b.id))
    .map((g) => {
      const b = layout.boxes[g.id]
      return {
        id: g.id,
        type: 'group',
        position: { x: b?.x ?? 0, y: b?.y ?? 0 },
        style: { width: b?.width ?? 200, height: b?.height ?? 120 },
        data: { label: g.attrs.label ?? humanize(g.id), icon: g.attrs.icon, depth: depthOf(g.id) },
        ...(g.parent ? { parentId: g.parent } : {}),
        zIndex: depthOf(g.id) - 10,
      }
    })

  const services: Node[] = graph.nodes.map((n) => {
    const b = layout.boxes[n.id]
    return {
      id: n.id,
      type: 'service',
      position: { x: b?.x ?? 0, y: b?.y ?? 0 },
      data: { label: n.attrs.label ?? humanize(n.id), icon: n.attrs.icon, auto: n.auto },
      ...(n.parent ? { parentId: n.parent } : {}),
      zIndex: 10,
    }
  })

  const marker = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--edge)' }
  const edges: Edge<ElkEdgeData>[] = graph.edges.map((e, i) => {
    const id = edgeId(i, e.from, e.to)
    const route = layout.edges[id]
    return {
      id,
      source: e.from,
      target: e.to,
      type: 'elk',
      label: e.label,
      data: { points: route?.points, labelPos: route?.label },
      markerEnd: e.arrow === 'none' ? undefined : marker,
      markerStart: e.arrow === 'both' ? marker : undefined,
    }
  })

  return { nodes: [...groups, ...services], edges }
}
