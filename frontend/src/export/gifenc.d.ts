declare module 'gifenc' {
  type Palette = number[][]
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: Palette; delay?: number; repeat?: number }): void
    finish(): void
    bytes(): Uint8Array
  }
  export function quantize(rgba: Uint8ClampedArray, maxColors: number, opts?: { format?: string }): Palette
  export function applyPalette(rgba: Uint8ClampedArray, palette: Palette, format?: string): Uint8Array
}
