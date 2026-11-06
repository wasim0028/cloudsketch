import type { Graph, IconInfo, Issue } from '../dsl/types'

const BASE = import.meta.env.VITE_API_URL ?? ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.detail ?? `${r.status} ${r.statusText}`)
  }
  return r.json()
}

export type GenResult = {
  ok: boolean
  dsl: string
  graph: Graph | null
  issues: Issue[]
  parse_error: { message: string; line?: number } | null
  attempts: number
  provider: string
  model: string
  latency_ms: number
  log_id: number | null
}

export type SavedDiagram = { id: number; title: string; prompt: string | null; dsl: string; positions: Record<string, { x: number; y: number }> | null }

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  config: () => call<{ providers: string[]; default_provider: string; default_model: string | null }>('/api/config'),
  icons: () => call<IconInfo[]>('/api/icons'),
  generate: (prompt: string, provider?: string, model?: string) =>
    call<GenResult>('/api/generate', post({ prompt, provider, model: model || undefined })),
  edit: (prompt: string, dsl: string, provider?: string, model?: string) =>
    call<GenResult>('/api/edit', post({ prompt, dsl, provider, model: model || undefined })),
  list: () => call<{ id: number; title: string; updated_at: string }[]>('/api/diagrams'),
  get: (id: number) => call<SavedDiagram>(`/api/diagrams/${id}`),
  save: (d: Omit<SavedDiagram, 'id'>, id?: number) =>
    id
      ? call<{ id: number }>(`/api/diagrams/${id}`, { method: 'PUT', body: JSON.stringify(d) })
      : call<{ id: number }>('/api/diagrams', post(d)),
}
