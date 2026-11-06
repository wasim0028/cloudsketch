// Browser-side parse + validate for instant feedback while typing.
// Mirrors backend/app/validate.py so live edits behave like generated output.
import { parse } from './parser.js'
import type { Graph, Issue } from './types'

const FALLBACK = 'generic-service'

export type ParseResult = { graph: Graph | null; issues: Issue[] }

export function parseAndValidate(dsl: string, iconKeys: Set<string>): ParseResult {
  let raw: Graph
  try {
    raw = parse(dsl)
  } catch (e) {
    const err = e as { message: string; location?: { start: { line: number } } }
    return { graph: null, issues: [{ level: 'error', code: 'parse_error', message: err.message, line: err.location?.start.line ?? null }] }
  }

  const issues: Issue[] = []
  const warn = (code: string, message: string, line?: number) =>
    issues.push({ level: 'warning', code, message, line: line ?? null })
  const seen = new Set<string>()
  const out: Graph = { nodes: [], groups: [], edges: [] }
  const knownIcon = (i?: string) => !i || iconKeys.size === 0 || iconKeys.has(i)

  for (const g of raw.groups) {
    if (seen.has(g.id)) { warn('duplicate_id', `Duplicate name '${g.id}' dropped`, g.loc?.line); continue }
    seen.add(g.id)
    if (!knownIcon(g.attrs.icon)) {
      warn('unknown_icon', `Unknown icon '${g.attrs.icon}' on group '${g.id}'`, g.loc?.line)
      out.groups.push({ ...g, attrs: { ...g.attrs, icon: undefined } })
    } else out.groups.push(g)
  }
  for (const n of raw.nodes) {
    if (seen.has(n.id)) { warn('duplicate_id', `Duplicate name '${n.id}' dropped`, n.loc?.line); continue }
    seen.add(n.id)
    let icon = n.attrs.icon ?? FALLBACK
    if (!knownIcon(icon)) { warn('unknown_icon', `Unknown icon '${icon}' on '${n.id}'`, n.loc?.line); icon = FALLBACK }
    out.nodes.push({ ...n, attrs: { ...n.attrs, icon } })
  }
  for (const e of raw.edges) {
    if (e.from === e.to) { warn('self_loop', `Self-loop on '${e.from}' dropped`, e.loc?.line); continue }
    for (const end of [e.from, e.to]) {
      if (!seen.has(end)) {
        seen.add(end)
        out.nodes.push({ id: end, attrs: { icon: FALLBACK }, parent: null, auto: true })
        warn('undeclared_node', `'${end}' used in an edge but never declared; added it`, e.loc?.line)
      }
    }
    out.edges.push(e)
  }
  return { graph: out, issues }
}
