import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type OnNodeDrag,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type GenResult } from './api/client'
import { edgeTypes, type ElkEdgeData } from './canvas/ElkEdge'
import { nodeTypes } from './canvas/nodes'
import { toFlow } from './canvas/toFlow'
import { parseAndValidate } from './dsl'
import type { Graph, Issue } from './dsl/types'
import { DslEditor } from './editor/DslEditor'
import { downloadText, exportGif, exportImage, toMermaid } from './export/export'
import { setIconMeta } from './icons/registry'
import { layoutGraph, type Layout } from './layout/elk'

const SAMPLE = `// Edit me, or describe a system on the left and press Generate
User [icon: user]
AWS [icon: aws-cloud] {
  VPC [icon: aws-vpc] {
    PublicSubnet [icon: aws-subnet-public] {
      ALB [icon: aws-elb, label: "Application LB"]
    }
    PrivateSubnet [icon: aws-subnet-private] {
      EKS [icon: aws-eks, label: "App cluster"]
      RDS [icon: aws-rds, label: "Postgres"]
      Cache [icon: aws-elasticache, label: "Redis"]
    }
  }
}
User > ALB: "HTTPS"
ALB > EKS
EKS > RDS
EKS > Cache`

export default function App() {
  const [dsl, setDsl] = useState(SAMPLE)
  const [prompt, setPrompt] = useState('')
  const [change, setChange] = useState('')
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [iconKeys, setIconKeys] = useState<Set<string>>(new Set())
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState<'' | 'generate' | 'edit'>('')
  const [lastRun, setLastRun] = useState<GenResult | null>(null)
  const [error, setError] = useState('')
  const [stable, setStable] = useState(true)
  const [flow, setFlow] = useState(true)
  const [gifProgress, setGifProgress] = useState('')
  const [title, setTitle] = useState('Untitled diagram')
  const [diagramId, setDiagramId] = useState<number | undefined>()
  const [saved, setSaved] = useState<{ id: number; title: string }[]>([])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ElkEdgeData>>([])
  const { fitView } = useReactFlow()

  const graphRef = useRef<Graph | null>(null)
  const layoutRef = useRef<Layout>({ boxes: {}, edges: {} })
  const pinned = useRef<Set<string>>(new Set()) // nodes the user dragged
  const resetLayout = useRef(true) // fresh generation -> full relayout + fit

  // ---- bootstrap ----
  useEffect(() => {
    api.config().then((c) => { setProviders(c.providers); setProvider(c.default_provider) }).catch(() => {})
    api.icons().then((list) => { setIconMeta(list); setIconKeys(new Set(list.map((i) => i.key))) }).catch(() => {})
    api.list().then(setSaved).catch(() => {})
  }, [])

  // ---- DSL -> parse -> validate -> ELK -> React Flow (debounced) ----
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      const { graph, issues } = parseAndValidate(dsl, iconKeys)
      setIssues(issues)
      if (!graph) return // keep last good diagram on screen while the user types
      const fresh = resetLayout.current
      const prev = !fresh && stable ? layoutRef.current : undefined
      const layout = await layoutGraph(graph, prev)
      if (cancelled) return
      if (prev) {
        // Dragged nodes keep their spot; their ELK routes no longer match, so drop them (smoothstep fallback)
        for (const id of pinned.current) {
          const p = prev.boxes[id]
          if (p && layout.boxes[id]) layout.boxes[id] = { ...layout.boxes[id], x: p.x, y: p.y }
        }
        if (pinned.current.size) {
          for (const [i, e] of graph.edges.entries()) {
            if (pinned.current.has(e.from) || pinned.current.has(e.to)) delete layout.edges[`e${i}-${e.from}-${e.to}`]
          }
        }
      } else {
        pinned.current.clear()
      }
      layoutRef.current = layout
      graphRef.current = graph
      const flow = toFlow(graph, layout)
      setNodes(flow.nodes)
      setEdges(flow.edges)
      if (fresh) {
        resetLayout.current = false
        requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }))
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [dsl, iconKeys, stable, setNodes, setEdges, fitView])

  // Dragging invalidates ELK routes for edges touching the node (or anything inside a dragged group)
  const affected = useCallback((id: string) => {
    const g = graphRef.current
    const ids = new Set([id])
    if (g) {
      let grew = true
      while (grew) {
        grew = false
        for (const x of [...g.groups, ...g.nodes]) if (x.parent && ids.has(x.parent) && !ids.has(x.id)) { ids.add(x.id); grew = true }
      }
    }
    return ids
  }, [])

  const onDragStart: OnNodeDrag = useCallback((_, node) => {
    const ids = affected(node.id)
    setEdges((es) => es.map((e) => (ids.has(e.source) || ids.has(e.target) ? { ...e, data: {} } : e)))
  }, [affected, setEdges])

  const onDragStop: OnNodeDrag = useCallback((_, node) => {
    for (const id of affected(node.id)) pinned.current.add(id)
    const b = layoutRef.current.boxes[node.id]
    if (b) layoutRef.current.boxes[node.id] = { ...b, x: node.position.x, y: node.position.y }
  }, [affected])

  // ---- AI actions ----
  async function runAI(mode: 'generate' | 'edit') {
    const text = mode === 'generate' ? prompt : change
    if (text.trim().length < 3) return setError('Write a longer description first.')
    setBusy(mode); setError('')
    try {
      const r = mode === 'generate' ? await api.generate(text, provider, model) : await api.edit(text, dsl, provider, model)
      setLastRun(r)
      if (!r.dsl) throw new Error(r.parse_error?.message ?? 'Model returned nothing')
      if (mode === 'generate') resetLayout.current = true
      setDsl(r.dsl)
      if (mode === 'edit') setChange('')
      if (!r.ok) setError(`Model output still failed to parse after ${r.attempts} attempts. Fix it in the editor.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  // ---- persistence ----
  async function save() {
    const positions = Object.fromEntries(Object.entries(layoutRef.current.boxes).map(([k, b]) => [k, { x: b.x, y: b.y }]))
    try {
      const { id } = await api.save({ title, prompt, dsl, positions }, diagramId)
      setDiagramId(id)
      setSaved(await api.list())
    } catch (e) { setError((e as Error).message) }
  }

  async function load(id: number) {
    const d = await api.get(id)
    layoutRef.current = { boxes: Object.fromEntries(Object.entries(d.positions ?? {}).map(([k, p]) => [k, { ...p, width: 0, height: 0 }])), edges: {} }
    resetLayout.current = !d.positions
    setDiagramId(d.id); setTitle(d.title); setPrompt(d.prompt ?? ''); setDsl(d.dsl)
    requestAnimationFrame(() => setTimeout(() => fitView({ padding: 0.15 }), 400))
  }

  const errors = useMemo(() => issues.filter((i) => i.level === 'error'), [issues])
  const fileName = title.trim().replace(/\s+/g, '-').toLowerCase() || 'diagram'

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Cloudsketch</span>
        <input className="title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Diagram title" />
        <div className="spacer" />
        <label className="field-inline">
          Provider
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <input className="model" placeholder="model (default)" value={model} onChange={(e) => setModel(e.target.value)} />
        <label className="field-inline" title="Keep node order and dragged positions when the DSL changes">
          <input type="checkbox" checked={stable} onChange={(e) => setStable(e.target.checked)} /> Stable layout
        </label>
        <label className="field-inline" title="Animate arrows with flowing dashes">
          <input type="checkbox" checked={flow} onChange={(e) => setFlow(e.target.checked)} /> Flow
        </label>
        <button onClick={save}>Save</button>
        <button onClick={() => exportImage(nodes, 'svg', fileName)}>SVG</button>
        <button onClick={() => exportImage(nodes, 'png', fileName)}>PNG</button>
        <button
          disabled={!!gifProgress}
          title="Animated GIF with flowing arrows (one seamless loop)"
          onClick={async () => {
            try { await exportGif(nodes, fileName, (d, t) => setGifProgress(`${d}/${t}`)) }
            catch (e) { setError((e as Error).message) }
            finally { setGifProgress('') }
          }}
        >
          {gifProgress ? `GIF ${gifProgress}` : 'GIF'}
        </button>
        <button onClick={() => graphRef.current && downloadText(toMermaid(graphRef.current), `${fileName}.mmd`)}>Mermaid</button>
      </header>

      <aside className="panel">
        <section>
          <h2>Describe your system</h2>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Users hit CloudFront and an ALB in front of EKS, which uses Aurora Postgres, ElastiCache and SQS workers"
          />
          <button className="primary" disabled={!!busy} onClick={() => runAI('generate')}>
            {busy === 'generate' ? 'Generating…' : 'Generate'}
          </button>
        </section>

        <section>
          <h2>Change it</h2>
          <div className="row">
            <input
              value={change}
              onChange={(e) => setChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runAI('edit')}
              placeholder="add Redis between API and DB"
            />
            <button disabled={!!busy} onClick={() => runAI('edit')}>{busy === 'edit' ? '…' : 'Apply'}</button>
          </div>
        </section>

        {error && <p className="msg error">{error}</p>}
        {lastRun && (
          <p className="msg meta">
            {lastRun.provider}/{lastRun.model} · {Math.round(lastRun.latency_ms)} ms · {lastRun.attempts} attempt{lastRun.attempts > 1 ? 's' : ''}
          </p>
        )}

        <section className="grow">
          <h2>Diagram code</h2>
          <DslEditor value={dsl} onChange={setDsl} />
          {issues.length > 0 && (
            <ul className="issues">
              {issues.map((i, k) => (
                <li key={k} className={i.level}>
                  {i.line ? <span className="line">L{i.line}</span> : null}
                  {i.level === 'error' && errors.length ? i.message.split('\n')[0] : i.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {saved.length > 0 && (
          <section>
            <h2>Saved</h2>
            <ul className="saved">
              {saved.map((d) => (
                <li key={d.id}><button className={d.id === diagramId ? 'link active' : 'link'} onClick={() => load(d.id)}>{d.title}</button></li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <main className={`canvas${flow ? ' flow' : ''}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onDragStart}
          onNodeDragStop={onDragStop}
          minZoom={0.2}
          fitView
        >
          <Background gap={24} size={1} color="var(--grid)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {errors.length > 0 && <div className="stale">Showing last valid diagram — fix the code error to update</div>}
      </main>
    </div>
  )
}
