import type { Graph } from './types'

export function parse(input: string): Graph
export class SyntaxError extends Error {
  location: { start: { line: number; column: number } }
}
