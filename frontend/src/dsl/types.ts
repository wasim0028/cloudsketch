export type Attrs = { icon?: string; label?: string; [k: string]: string | undefined }
export type Loc = { line: number; column: number; offset: number }

export type GNode = { id: string; attrs: Attrs; parent: string | null; loc?: Loc; auto?: boolean }
export type GGroup = { id: string; attrs: Attrs; parent: string | null; loc?: Loc }
export type GEdge = { from: string; to: string; arrow: 'forward' | 'both' | 'none'; label?: string; loc?: Loc }
export type Graph = { nodes: GNode[]; groups: GGroup[]; edges: GEdge[] }

export type Issue = { level: 'error' | 'warning'; code: string; message: string; line: number | null }

export type IconInfo = { key: string; label: string; provider: string; category: string }
