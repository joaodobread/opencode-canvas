export type RGB = [number, number, number]

export function parseHex(input: string): RGB | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim())
  if (!match) return undefined
  let hex = match[1]!
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

export function toHex([r, g, b]: RGB): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
  return `#${part(r)}${part(g)}${part(b)}`
}

export function normalize(input: string): string | undefined {
  const rgb = parseHex(input)
  return rgb ? toHex(rgb) : undefined
}

/** Mixes `a` into `b`: t=0 gives b, t=1 gives a. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a) ?? [0, 0, 0]
  const y = parseHex(b) ?? [0, 0, 0]
  return toHex([x[0] * t + y[0] * (1 - t), x[1] * t + y[1] * (1 - t), x[2] * t + y[2] * (1 - t)] as RGB)
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0]
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as RGB
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Readable foreground (near-white or near-black) for text placed on `background`. */
export function onColor(background: string): string {
  return contrast(background, "#ffffff") >= contrast(background, "#0b0f19") ? "#ffffff" : "#0b0f19"
}

export function darken(hex: string, amount: number): string {
  return mix("#000000", hex, amount)
}

export function lighten(hex: string, amount: number): string {
  return mix("#ffffff", hex, amount)
}
