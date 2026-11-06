import ELK, { type ElkExtendedEdge, type ElkNode, type LayoutOptions } from 'elkjs/lib/elk.bundled.js'
import type { Graph } from '../dsl/types'

const elk = new ELK()

// Service node box: narrow so edges end right at the icon; the label is allowed
// to overhang horizontally (ELK spacing below leaves room for it).
export const NODE_W = 64
export const NODE_H = 96
export const ICON_SIZE = 44
export const ICON_TOP = 4
export const PORT_Y = ICON_TOP + ICON_SIZE / 2 // edges attach at icon centre height
const GROUP_HEADER = 36

export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }
export type EdgeRoute = { points: Point[]; label?: Point }
/** Node/group boxes are relative to their parent group (React Flow's convention).
 *  Edge routes are absolute canvas coordinates. */
export type Layout = { boxes: Record<string, Box>; edges: Record<string, EdgeRoute> }

const base: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '56',
  'elk.layered.spacing.nodeNodeBetweenLayers': '96',
  'elk.spacing.edgeNode': '24',
  'elk.spacing.edgeEdge': '14',
  'elk.spacing.edgeLabel': '6',
  'elk.edgeLabels.placement': 'CENTER',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.mergeEdges': 'true',
}

export const edgeId = (i: number, from: string, to: string) => `e${i}-${from}-${to}`

/**
 * previous: last layout. When given, nodes start at their previous coordinates
 * and ELK runs semi-interactive crossing minimization, which keeps the existing
 * ordering instead of reshuffling everything after a small edit.
 */
export async function layoutGraph(graph: Graph, previous?: Layout): Promise<Layout> {
  const stable = !!previous && Object.keys(previous.boxes).length > 0
  const semi: LayoutOptions = stable ? { 'elk.layered.crossingMinimization.semiInteractive': 'true' } : {}
  const elkNodes = new Map<string, ElkNode>()
  const isGroup = new Set(graph.groups.map((g) => g.id))

  for (const g of graph.groups) {
    elkNodes.set(g.id, {
      id: g.id,
      children: [],
      // spacing is per hierarchy level, so groups repeat the root's values
      layoutOptions: {
        'elk.padding': `[top=${GROUP_HEADER + 20},left=40,bottom=36,right=40]`,
        'elk.spacing.nodeNode': base['elk.spacing.nodeNode'],
        'elk.layered.spacing.nodeNodeBetweenLayers': base['elk.layered.spacing.nodeNodeBetweenLayers'],
        ...semi,
      },
    })
  }
  for (const n of graph.nodes) {
    const p = previous?.boxes[n.id]
    elkNodes.set(n.id, {
      id: n.id,
      width: NODE_W,
      height: NODE_H,
      ...(p ? { x: p.x, y: p.y } : {}),
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [
        { id: `${n.id}:in`, x: 0, y: PORT_Y, width: 1, height: 1, layoutOptions: { 'elk.port.side': 'WEST' } },
        { id: `${n.id}:out`, x: NODE_W, y: PORT_Y, width: 1, height: 1, layoutOptions: { 'elk.port.side': 'EAST' } },
      ],
    })
  }

  const edges: ElkExtendedEdge[] = graph.edges.map((e, i) => ({
    id: edgeId(i, e.from, e.to),
    sources: [isGroup.has(e.from) ? e.from : `${e.from}:out`],
    targets: [isGroup.has(e.to) ? e.to : `${e.to}:in`],
    labels: e.label ? [{ text: e.label, width: e.label.length * 6.6 + 14, height: 20 }] : [],
  }))

  const root: ElkNode = { id: '__root', layoutOptions: { ...base, ...semi }, children: [], edges }
  for (const item of [...graph.groups, ...graph.nodes]) {
    const parent = item.parent ? elkNodes.get(item.parent) : root
    ;(parent ?? root).children!.push(elkNodes.get(item.id)!)
  }

  const result = await elk.layout(root)

  const boxes: Layout['boxes'] = {}
  const absolute: Record<string, Point> = { __root: { x: 0, y: 0 } }
  const walk = (n: ElkNode, origin: Point) => {
    for (const c of n.children ?? []) {
      boxes[c.id] = { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? NODE_W, height: c.height ?? NODE_H }
      absolute[c.id] = { x: origin.x + (c.x ?? 0), y: origin.y + (c.y ?? 0) }
      walk(c, absolute[c.id])
    }
  }
  walk(result, { x: 0, y: 0 })

  // Edge coordinates are relative to the edge's container node
  const routes: Layout['edges'] = {}
  const collect = (n: ElkNode) => {
    for (const e of (n.edges ?? []) as (ElkExtendedEdge & { container?: string })[]) {
      const o = absolute[e.container ?? n.id] ?? { x: 0, y: 0 }
      const s = e.sections?.[0]
      if (!s) continue
      const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({ x: p.x + o.x, y: p.y + o.y }))
      const l = e.labels?.[0]
      routes[e.id] = {
        points: pts,
        label: l?.x != null ? { x: l.x + o.x + (l.width ?? 0) / 2, y: (l.y ?? 0) + o.y + (l.height ?? 0) / 2 } : undefined,
      }
    }
    for (const c of n.children ?? []) collect(c)
  }
  collect(result)

  return { boxes, edges: routes }
}
