import { esc } from "./document.js"

export const NODE_TYPES = [
  "user",
  "client",
  "cdn",
  "gateway",
  "loadbalancer",
  "service",
  "worker",
  "database",
  "cache",
  "queue",
  "storage",
  "external",
  "other",
] as const
export type NodeType = (typeof NODE_TYPES)[number]

export interface DiagramNode {
  id: string
  label: string
  type?: NodeType
  /** Second line, e.g. the technology: "PostgreSQL 16". */
  detail?: string
  group?: string
  /** Tooltip text. */
  description?: string
}

export interface DiagramEdge {
  from: string
  to: string
  label?: string
  style?: "solid" | "dashed" | "dotted"
  /** Draw arrows on both ends. */
  bidirectional?: boolean
}

export interface Diagram {
  title: string
  description?: string
  direction?: "LR" | "TB"
  /** Edge shape: straight lines with rounded corners (default) or bezier curves. */
  routing?: "orthogonal" | "curved"
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  notes?: string[]
}

interface TypeStyle {
  color: string
  label: string
}

const TYPE_STYLE: Record<NodeType, TypeStyle> = {
  user: { color: "var(--color-secondary, #0891b2)", label: "User" },
  client: { color: "var(--color-info, #2563eb)", label: "Client" },
  cdn: { color: "var(--color-secondary, #0891b2)", label: "CDN" },
  gateway: { color: "var(--color-accent, #db2777)", label: "Gateway" },
  loadbalancer: { color: "var(--color-accent, #db2777)", label: "Load balancer" },
  service: { color: "var(--color-primary, #4f46e5)", label: "Service" },
  worker: { color: "var(--color-primary, #4f46e5)", label: "Worker" },
  database: { color: "var(--color-success, #16a34a)", label: "Database" },
  cache: { color: "var(--color-warning, #d97706)", label: "Cache" },
  queue: { color: "var(--color-danger, #dc2626)", label: "Queue / stream" },
  storage: { color: "var(--color-success, #16a34a)", label: "Object storage" },
  external: { color: "var(--color-muted, #64748b)", label: "External" },
  other: { color: "var(--color-muted, #64748b)", label: "Other" },
}

interface Item {
  key: string
  dummy: boolean
  node?: DiagramNode
  layer: number
  /** Size along the layer axis and along the order axis. */
  la: number
  lb: number
  a: number
  b: number
  ins: Item[]
  outs: Item[]
}

interface Route {
  edge: DiagramEdge
  items: Item[]
  reversed: boolean
}

const FONT = 13
const CHAR = 7.1
const NODE_H = 62
const MIN_W = 150
const LAYER_GAP = 96
const ORDER_GAP = 34
const DUMMY = 16
const PAD = 56

function nodeWidth(node: DiagramNode): number {
  const longest = Math.max(node.label.length, (node.detail?.length ?? 0) * 0.9)
  return Math.max(MIN_W, Math.min(280, Math.round(longest * CHAR + 64)))
}

function validate(diagram: Diagram) {
  if (!diagram.nodes.length) throw new Error("A system design needs at least one node.")
  const ids = new Set<string>()
  for (const node of diagram.nodes) {
    if (!node.id || ids.has(node.id)) throw new Error(`Duplicate or empty node id "${node.id}".`)
    ids.add(node.id)
  }
  for (const edge of diagram.edges) {
    if (!ids.has(edge.from)) throw new Error(`Edge references unknown node "${edge.from}".`)
    if (!ids.has(edge.to)) throw new Error(`Edge references unknown node "${edge.to}".`)
  }
}

function layout(diagram: Diagram) {
  const horizontal = (diagram.direction ?? "LR") === "LR"
  const items = new Map<string, Item>()
  for (const node of diagram.nodes) {
    const w = nodeWidth(node)
    items.set(node.id, {
      key: node.id,
      dummy: false,
      node,
      layer: 0,
      la: horizontal ? w : NODE_H,
      lb: horizontal ? NODE_H : w,
      a: 0,
      b: 0,
      ins: [],
      outs: [],
    })
  }

  // 1. break cycles with a DFS, remembering which edges were flipped
  const adjacency = new Map<string, string[]>()
  for (const node of diagram.nodes) adjacency.set(node.id, [])
  diagram.edges.forEach((edge) => {
    if (edge.from !== edge.to) adjacency.get(edge.from)!.push(edge.to)
  })
  const state = new Map<string, number>()
  const back = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const next of adjacency.get(id)!) {
      const s = state.get(next) ?? 0
      if (s === 1) back.add(`${id}>${next}`)
      else if (s === 0) visit(next)
    }
    state.set(id, 2)
  }
  for (const node of diagram.nodes) if (!state.has(node.id)) visit(node.id)

  const forward = diagram.edges
    .filter((edge) => edge.from !== edge.to)
    .map((edge) => {
      const reversed = back.has(`${edge.from}>${edge.to}`)
      return { edge, reversed, src: reversed ? edge.to : edge.from, dst: reversed ? edge.from : edge.to }
    })

  // 2. longest-path layering
  const preds = new Map<string, string[]>()
  for (const node of diagram.nodes) preds.set(node.id, [])
  for (const e of forward) preds.get(e.dst)!.push(e.src)
  const memo = new Map<string, number>()
  const depth = (id: string): number => {
    const known = memo.get(id)
    if (known !== undefined) return known
    memo.set(id, 0)
    const value = Math.max(-1, ...preds.get(id)!.map(depth)) + 1
    memo.set(id, value)
    return value
  }
  for (const node of diagram.nodes) items.get(node.id)!.layer = depth(node.id)

  // 3. split long edges into chains of dummy items
  const routes: Route[] = []
  forward.forEach((e, index) => {
    const src = items.get(e.src)!
    const dst = items.get(e.dst)!
    const chain: Item[] = [src]
    for (let layer = src.layer + 1; layer < dst.layer; layer++) {
      const dummy: Item = {
        key: `~${index}-${layer}`,
        dummy: true,
        layer,
        la: 0,
        lb: DUMMY,
        a: 0,
        b: 0,
        ins: [],
        outs: [],
      }
      items.set(dummy.key, dummy)
      chain.push(dummy)
    }
    chain.push(dst)
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i]!.outs.push(chain[i + 1]!)
      chain[i + 1]!.ins.push(chain[i]!)
    }
    routes.push({ edge: e.edge, items: chain, reversed: e.reversed })
  })

  const layerCount = Math.max(...[...items.values()].map((i) => i.layer)) + 1
  const layers: Item[][] = Array.from({ length: layerCount }, () => [])
  const groupRank = new Map<string, number>()
  for (const node of diagram.nodes) {
    if (node.group !== undefined && !groupRank.has(node.group)) groupRank.set(node.group, groupRank.size)
  }
  const initial = [...items.values()].sort((x, y) => {
    const gx = x.node?.group !== undefined ? groupRank.get(x.node.group)! : -1
    const gy = y.node?.group !== undefined ? groupRank.get(y.node.group)! : -1
    return gx - gy
  })
  for (const item of initial) layers[item.layer]!.push(item)

  // 4. reduce crossings with barycenter sweeps
  const position = new Map<Item, number>()
  const reindex = () => layers.forEach((layer) => layer.forEach((item, i) => position.set(item, i)))
  reindex()
  const sweep = (order: number[], neighbors: (item: Item) => Item[]) => {
    for (const l of order) {
      const layer = layers[l]!
      const keyed = layer.map((item, i) => {
        const n = neighbors(item)
        const key = n.length ? n.reduce((sum, o) => sum + position.get(o)!, 0) / n.length : i
        return { item, key, unit: key, group: item.node?.group, i }
      })
      // members of one group share a sort key so they stay contiguous and the group box stays compact
      const blocks = new Map<string, number[]>()
      for (const k of keyed) if (k.group !== undefined) blocks.set(k.group, [...(blocks.get(k.group) ?? []), k.key])
      for (const k of keyed) {
        if (k.group === undefined) continue
        const keys = blocks.get(k.group)!
        k.unit = keys.reduce((a, b) => a + b, 0) / keys.length
      }
      keyed.sort((x, y) => x.unit - y.unit || (x.group === y.group ? 0 : (groupRank.get(x.group ?? "") ?? -1) - (groupRank.get(y.group ?? "") ?? -1)) || x.key - y.key || x.i - y.i)
      layers[l] = keyed.map((k) => k.item)
      layers[l]!.forEach((item, i) => position.set(item, i))
    }
  }
  const down = Array.from({ length: layerCount - 1 }, (_, i) => i + 1)
  const up = Array.from({ length: layerCount - 1 }, (_, i) => layerCount - 2 - i)
  for (let round = 0; round < 6; round++) {
    sweep(down, (item) => item.ins)
    sweep(up, (item) => item.outs)
  }

  // 5. coordinates: layers along `a`, stacked items along `b`
  let cursor = 0
  const extent: number[] = []
  layers.forEach((layer) => {
    const size = Math.max(0, ...layer.map((i) => i.la))
    for (const item of layer) item.a = cursor + size / 2
    cursor += size + LAYER_GAP
  })
  layers.forEach((layer, l) => {
    const total = layer.reduce((sum, i) => sum + i.lb, 0) + ORDER_GAP * Math.max(0, layer.length - 1)
    extent[l] = total
  })
  const widest = Math.max(...extent)
  layers.forEach((layer, l) => {
    let at = (widest - extent[l]!) / 2
    for (const item of layer) {
      item.b = at + item.lb / 2
      at += item.lb + ORDER_GAP
    }
  })
  const relax = (order: number[], neighbors: (item: Item) => Item[]) => {
    for (const l of order) {
      const layer = layers[l]!
      const desired = layer.map((item) => {
        const n = neighbors(item)
        return n.length ? n.reduce((sum, o) => sum + o.b, 0) / n.length : item.b
      })
      const placed: number[] = []
      layer.forEach((item, i) => {
        const min = i === 0 ? -Infinity : placed[i - 1]! + layer[i - 1]!.lb / 2 + ORDER_GAP + item.lb / 2
        placed.push(Math.max(desired[i]!, min))
      })
      for (let i = layer.length - 1; i >= 0; i--) {
        const item = layer[i]!
        if (i < layer.length - 1) {
          const max = placed[i + 1]! - layer[i + 1]!.lb / 2 - ORDER_GAP - item.lb / 2
          placed[i] = Math.min(placed[i]!, Math.max(max, desired[i]!))
        }
      }
      layer.forEach((item, i) => {
        item.b = placed[i]!
      })
    }
  }
  for (let round = 0; round < 4; round++) {
    relax(down, (item) => item.ins)
    relax(up, (item) => item.outs)
  }

  // 5b. give every group its own band: groups that share layers must not overlap, and outsiders must stay out of group boxes
  const members = new Map<string, Item[]>()
  for (const item of items.values()) {
    const group = item.node?.group
    if (group !== undefined) members.set(group, [...(members.get(group) ?? []), item])
  }
  if (members.size) {
    const A_PAD = 26
    const B_LO = horizontal ? 44 : 26
    const B_HI = 26
    const GAP = 18
    const bounds = (list: Item[]) => ({
      a1: Math.min(...list.map((i) => i.a - i.la / 2)) - A_PAD,
      a2: Math.max(...list.map((i) => i.a + i.la / 2)) + A_PAD,
      b1: Math.min(...list.map((i) => i.b - i.lb / 2)) - B_LO,
      b2: Math.max(...list.map((i) => i.b + i.lb / 2)) + B_HI,
    })
    const grouped = new Set([...members.values()].flat())
    const outsiders = [...items.values()].filter((i) => !grouped.has(i))
    for (let round = 0; round < 12; round++) {
      let moved = false
      const names = [...members.keys()].sort((x, y) => bounds(members.get(x)!).b1 - bounds(members.get(y)!).b1)
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const p = bounds(members.get(names[i]!)!)
          const q = bounds(members.get(names[j]!)!)
          if (p.a2 <= q.a1 || q.a2 <= p.a1 || p.b2 <= q.b1 || q.b2 <= p.b1) continue
          const shift = p.b2 - q.b1 + GAP
          for (const item of members.get(names[j]!)!) item.b += shift
          moved = true
        }
      }
      for (const name of names) {
        const box = bounds(members.get(name)!)
        for (const item of outsiders) {
          const margin = item.dummy ? 6 : GAP
          const hit = item.a + item.la / 2 + margin > box.a1 && item.a - item.la / 2 - margin < box.a2 && item.b + item.lb / 2 > box.b1 && item.b - item.lb / 2 < box.b2
          if (!hit) continue
          item.b = box.b2 + GAP + item.lb / 2
          moved = true
        }
      }
      for (const layer of layers) {
        layer.sort((x, y) => x.b - y.b)
        for (let i = 1; i < layer.length; i++) {
          const need = layer[i - 1]!.b + layer[i - 1]!.lb / 2 + ORDER_GAP + layer[i]!.lb / 2
          if (layer[i]!.b < need) {
            layer[i]!.b = need
            moved = true
          }
        }
      }
      if (!moved) break
    }
  }

  // 6. map (a, b) onto x / y
  const all = [...items.values()]
  const minB = Math.min(...all.map((i) => i.b - i.lb / 2))
  for (const item of all) item.b -= minB
  return { horizontal, items, routes, layers }
}

interface Pt {
  x: number
  y: number
}

function smooth(points: Pt[], horizontal: boolean): string {
  let d = `M${points[0]!.x.toFixed(1)},${points[0]!.y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!
    const q = points[i]!
    if (horizontal) {
      const mx = (p.x + q.x) / 2
      d += ` C${mx.toFixed(1)},${p.y.toFixed(1)} ${mx.toFixed(1)},${q.y.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`
    } else {
      const my = (p.y + q.y) / 2
      d += ` C${p.x.toFixed(1)},${my.toFixed(1)} ${q.x.toFixed(1)},${my.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`
    }
  }
  return d
}

/** Straight segments joined by rounded corners. */
function rounded(points: Pt[], radius = 10): string {
  const pts = points.filter((p, i) => {
    if (i === 0) return true
    const q = points[i - 1]!
    return Math.abs(p.x - q.x) > 0.5 || Math.abs(p.y - q.y) > 0.5
  })
  const clean = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true
    const a = pts[i - 1]!
    const b = pts[i + 1]!
    return !((Math.abs(a.x - p.x) < 0.5 && Math.abs(p.x - b.x) < 0.5) || (Math.abs(a.y - p.y) < 0.5 && Math.abs(p.y - b.y) < 0.5))
  })
  const f = (n: number) => n.toFixed(1)
  let d = `M${f(clean[0]!.x)},${f(clean[0]!.y)}`
  for (let i = 1; i < clean.length - 1; i++) {
    const a = clean[i - 1]!
    const p = clean[i]!
    const b = clean[i + 1]!
    const l1 = Math.hypot(p.x - a.x, p.y - a.y)
    const l2 = Math.hypot(b.x - p.x, b.y - p.y)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    const s1 = { x: p.x - ((p.x - a.x) / l1) * r, y: p.y - ((p.y - a.y) / l1) * r }
    const s2 = { x: p.x + ((b.x - p.x) / l2) * r, y: p.y + ((b.y - p.y) / l2) * r }
    d += ` L${f(s1.x)},${f(s1.y)} Q${f(p.x)},${f(p.y)} ${f(s2.x)},${f(s2.y)}`
  }
  const end = clean[clean.length - 1]!
  if (clean.length > 1) d += ` L${f(end.x)},${f(end.y)}`
  return d
}

/** How far the node outline sits inside its bounding box at `off` from the middle of the side an edge attaches to. */
function sideInset(type: NodeType, horizontal: boolean, w: number, h: number, off: number): number {
  const o = Math.abs(off)
  const corner = (r: number, half: number) => {
    const d = o - (half - r)
    return d > 0 ? r - Math.sqrt(Math.max(0, r * r - d * d)) : 0
  }
  if (horizontal) {
    if (type === "gateway" || type === "loadbalancer") return (16 * o) / (h / 2)
    if (type === "queue") return corner(h / 2, h / 2)
    if (type === "user" || type === "external") return corner(h / 2.6, h / 2)
    return 0
  }
  if (type === "database" || type === "storage") return 9 - 9 * Math.sqrt(Math.max(0, 1 - (o / (w / 2)) ** 2))
  if (type === "queue") return corner(h / 2, w / 2)
  if (type === "user" || type === "external") return corner(h / 2.6, w / 2)
  return 0
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line)
      line = word
    } else line = (line + " " + word).trim()
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

function nodeShape(type: NodeType, x: number, y: number, w: number, h: number): string {
  const color = TYPE_STYLE[type].color
  const base = `fill="var(--sd-node, var(--color-background, #fff))" stroke="${color}" stroke-width="1.6"`
  if (type === "database" || type === "storage") {
    const ry = 9
    return (
      `<path ${base} d="M${x},${y + ry} v${h - 2 * ry} a${w / 2},${ry} 0 0 0 ${w},0 v${-(h - 2 * ry)} a${w / 2},${ry} 0 0 0 ${-w},0 z"/>` +
      `<path fill="none" stroke="${color}" stroke-width="1.6" d="M${x},${y + ry} a${w / 2},${ry} 0 0 0 ${w},0"/>`
    )
  }
  if (type === "queue") {
    return (
      `<rect ${base} x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>` +
      `<path fill="none" stroke="${color}" stroke-opacity=".35" d="M${x + 22},${y + 14} v${h - 28} M${x + w - 22},${y + 14} v${h - 28}"/>`
    )
  }
  if (type === "user" || type === "external") {
    const dash = type === "external" ? ' stroke-dasharray="6 4"' : ""
    return `<rect ${base}${dash} x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2.6}"/>`
  }
  if (type === "gateway" || type === "loadbalancer") {
    const c = 16
    return `<path ${base} d="M${x + c},${y} H${x + w - c} L${x + w},${y + h / 2} L${x + w - c},${y + h} H${x + c} L${x},${y + h / 2} Z"/>`
  }
  return `<rect ${base} x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`
}

export function renderSystemDesign(diagram: Diagram): string {
  validate(diagram)
  const { horizontal, items, routes, layers } = layout(diagram)
  const curved = diagram.routing === "curved"
  const place = (item: Item): Pt => (horizontal ? { x: item.a + PAD, y: item.b + PAD } : { x: item.b + PAD, y: item.a + PAD })

  const nodeBox = new Map<string, { x: number; y: number; w: number; h: number }>()
  let maxX = 0
  let maxY = 0
  for (const item of items.values()) {
    if (item.dummy) continue
    const p = place(item)
    const w = horizontal ? item.la : item.lb
    const h = horizontal ? item.lb : item.la
    nodeBox.set(item.key, { x: p.x - w / 2, y: p.y - h / 2, w, h })
    maxX = Math.max(maxX, p.x + w / 2)
    maxY = Math.max(maxY, p.y + h / 2)
  }

  // groups
  const groups = new Map<string, DiagramNode[]>()
  for (const node of diagram.nodes) {
    if (node.group === undefined) continue
    groups.set(node.group, [...(groups.get(node.group) ?? []), node])
  }
  let groupSvg = ""
  let g = 0
  for (const [name, members] of groups) {
    const boxes = members.map((m) => nodeBox.get(m.id)!)
    const x1 = Math.min(...boxes.map((b) => b.x)) - 22
    const y1 = Math.min(...boxes.map((b) => b.y)) - 40
    const x2 = Math.max(...boxes.map((b) => b.x + b.w)) + 22
    const y2 = Math.max(...boxes.map((b) => b.y + b.h)) + 22
    maxX = Math.max(maxX, x2)
    maxY = Math.max(maxY, y2)
    const tone = ["var(--color-primary, #4f46e5)", "var(--color-secondary, #0891b2)", "var(--color-accent, #db2777)", "var(--color-success, #16a34a)", "var(--color-warning, #d97706)"][g++ % 5]!
    groupSvg +=
      `<g><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" rx="16" fill="${tone}" fill-opacity=".06" stroke="${tone}" stroke-opacity=".5" stroke-dasharray="7 5"/>` +
      `<text x="${x1 + 16}" y="${y1 + 24}" class="sd-group">${esc(name)}</text></g>`
  }

  // edges: each edge gets its own port on the node side and its own channel in the gap between layers
  const ports = new Map<string, number>()
  const portKey = (r: number, side: "in" | "out") => `${r}:${side}`
  const bySide = new Map<string, { r: number; other: number }[]>()
  routes.forEach((route, r) => {
    const items = route.items
    const add = (item: Item, side: "in" | "out", other: Item) => {
      const key = `${item.key}:${side}`
      bySide.set(key, [...(bySide.get(key) ?? []), { r, other: other.b }])
    }
    add(items[0]!, "out", items[1]!)
    add(items[items.length - 1]!, "in", items[items.length - 2]!)
  })
  for (const [key, list] of bySide) {
    const item = items.get(key.slice(0, key.lastIndexOf(":")))!
    const side = key.endsWith(":in") ? "in" : "out"
    list.sort((x, y) => x.other - y.other || x.r - y.r)
    const max = Math.max(0, item.lb / 2 - (horizontal ? 12 : 24))
    const step = list.length > 1 ? Math.min(horizontal ? 14 : 22, (2 * max) / (list.length - 1)) : 0
    list.forEach((e, i) => ports.set(portKey(e.r, side), (i - (list.length - 1) / 2) * step))
  }
  const toXY = (a: number, b: number): Pt => (horizontal ? { x: a + PAD, y: b + PAD } : { x: b + PAD, y: a + PAD })
  const end = (item: Item, side: "in" | "out", r: number) => {
    if (item.dummy) return { a: item.a, b: item.b }
    const off = ports.get(portKey(r, side)) ?? 0
    const box = nodeBox.get(item.key)!
    const inset = sideInset(item.node!.type ?? "service", horizontal, box.w, box.h, off)
    return { a: side === "out" ? item.a + item.la / 2 - inset : item.a - item.la / 2 + inset, b: item.b + off }
  }
  const points = routes.map((route, r) => route.items.map((item, i) => (i === 0 ? end(item, "out", r) : i === route.items.length - 1 ? end(item, "in", r) : { a: item.a, b: item.b })))
  const span = layers.map((layer) => {
    const center = layer[0]?.a ?? 0
    const half = Math.max(0, ...layer.map((i) => i.la)) / 2
    return { from: center - half, to: center + half }
  })
  const channel = new Map<string, number>()
  const gaps = new Map<number, { key: string; b1: number; b2: number }[]>()
  routes.forEach((route, r) => {
    for (let i = 0; i < route.items.length - 1; i++) {
      const p = points[r]![i]!
      const q = points[r]![i + 1]!
      if (Math.abs(p.b - q.b) < 1) continue
      const layer = route.items[i]!.layer
      gaps.set(layer, [...(gaps.get(layer) ?? []), { key: `${r}:${i}`, b1: p.b, b2: q.b }])
    }
  })
  for (const [layer, segs] of gaps) {
    const from = span[layer]!.to + 14
    const to = (span[layer + 1]?.from ?? from + LAYER_GAP) - 14
    // downward segments that start higher turn further out (and the mirror for upward ones), which avoids most crossings
    const down = segs.filter((s) => s.b2 > s.b1).sort((x, y) => y.b1 - x.b1)
    const up = segs.filter((s) => s.b2 < s.b1).sort((x, y) => x.b1 - y.b1)
    const ordered = [...down, ...up]
    const width = Math.max(0, to - from)
    ordered.forEach((s, i) => channel.set(s.key, from + ((i + 0.5) * width) / ordered.length))
  }

  let edgeSvg = ""
  let labelSvg = ""
  const placed: { x1: number; x2: number; y1: number; y2: number }[] = []
  routes.forEach((route, r) => {
    const pts = points[r]!
    let flow: Pt[]
    if (curved) flow = pts.map((p) => toXY(p.a, p.b))
    else {
      const line: { a: number; b: number }[] = [pts[0]!]
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i]!
        const q = pts[i + 1]!
        const c = channel.get(`${r}:${i}`)
        if (c !== undefined) line.push({ a: c, b: p.b }, { a: c, b: q.b })
        line.push(q)
      }
      flow = line.map((p) => toXY(p.a, p.b))
    }
    // a flipped edge (cycle breaker) is laid out dst->src, so walk it backwards to follow the real flow
    if (route.reversed) flow.reverse()
    const style = route.edge.style ?? "solid"
    const dash = style === "dashed" ? ' stroke-dasharray="8 5"' : style === "dotted" ? ' stroke-dasharray="2 5" stroke-linecap="round"' : ""
    const start = route.edge.bidirectional ? ' marker-start="url(#sd-arrow-start)"' : ""
    edgeSvg += `<path class="sd-edge" d="${curved ? smooth(flow, horizontal) : rounded(flow)}"${dash}${start} marker-end="url(#sd-arrow)"/>`
    if (route.edge.label) {
      let lx: number
      let ly: number
      if (curved) {
        const at = Math.floor((flow.length - 1) / 2)
        const mid = flow[at]!
        const next = flow[at + 1] ?? mid
        lx = (mid.x + next.x) / 2
        ly = (mid.y + next.y) / 2
      } else {
        const width = route.edge.label.length * 6.4 + 14
        const segs = flow.slice(1).map((q, i) => ({ p: flow[i]!, q, len: Math.hypot(q.x - flow[i]!.x, q.y - flow[i]!.y) })).sort((x, y) => y.len - x.len)
        const free = (x: number, y: number) => {
          const box = { x1: x - width / 2 - 4, x2: x + width / 2 + 4, y1: y - 14, y2: y + 14 }
          const hit = (o: { x1: number; x2: number; y1: number; y2: number }) => box.x1 < o.x2 && o.x1 < box.x2 && box.y1 < o.y2 && o.y1 < box.y2
          return !placed.some(hit) && ![...nodeBox.values()].some((n) => hit({ x1: n.x, x2: n.x + n.w, y1: n.y, y2: n.y + n.h }))
        }
        let spot: Pt | undefined
        for (const seg of segs) {
          for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
            const x = seg.p.x + (seg.q.x - seg.p.x) * t
            const y = seg.p.y + (seg.q.y - seg.p.y) * t
            if (free(x, y)) {
              spot = { x, y }
              break
            }
          }
          if (spot) break
        }
        const fallback = segs[0] ?? { p: flow[0]!, q: flow[0]! }
        spot ??= { x: (fallback.p.x + fallback.q.x) / 2, y: (fallback.p.y + fallback.q.y) / 2 }
        lx = spot.x
        ly = spot.y
        placed.push({ x1: lx - width / 2, x2: lx + width / 2, y1: ly - 10, y2: ly + 10 })
      }
      const text = route.edge.label
      const width = text.length * 6.4 + 14
      labelSvg += `<g class="sd-edge-label"><rect x="${(lx - width / 2).toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="${width.toFixed(1)}" height="20" rx="10"/><text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle">${esc(text)}</text></g>`
    }
  })

  // nodes
  let nodeSvg = ""
  const used = new Set<NodeType>()
  for (const node of diagram.nodes) {
    const type = node.type ?? "service"
    used.add(type)
    const box = nodeBox.get(node.id)!
    const cx = box.x + box.w / 2
    const lines = wrap(node.label, Math.floor((box.w - 28) / CHAR))
    const hasDetail = Boolean(node.detail)
    const total = lines.length + (hasDetail ? 1 : 0)
    const lineH = 17
    const rim = type === "database" || type === "storage" ? 6 : 0
    let ty = box.y + box.h / 2 - ((total - 1) * lineH) / 2 + 4.5 + rim
    let text = ""
    for (const line of lines) {
      text += `<text x="${cx}" y="${ty.toFixed(1)}" text-anchor="middle" class="sd-label">${esc(line)}</text>`
      ty += lineH
    }
    if (hasDetail) text += `<text x="${cx}" y="${ty.toFixed(1)}" text-anchor="middle" class="sd-detail">${esc(node.detail)}</text>`
    nodeSvg +=
      `<g class="sd-node" data-id="${esc(node.id)}"><title>${esc(node.description ?? node.label)}</title>` +
      nodeShape(type, box.x, box.y, box.w, box.h) +
      text +
      `</g>`
  }

  const width = Math.ceil(maxX + PAD)
  const height = Math.ceil(maxY + PAD)
  const legend = [...used]
    .map((t) => `<span class="sd-key"><i style="background:${TYPE_STYLE[t].color}"></i>${TYPE_STYLE[t].label}</span>`)
    .join("")
  const notes = (diagram.notes ?? []).map((n) => `<li>${esc(n)}</li>`).join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(diagram.title)}</title>
<style>
:root{--sd-bg:var(--color-background,#fff);--sd-surface:var(--color-surface,#f6f7fb);--sd-text:var(--color-text,#0f172a);--sd-muted:var(--color-muted,#64748b);--sd-border:var(--color-border,#e2e8f0);--sd-line:#94a3b8;--sd-node:var(--sd-bg)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--sd-line:#64748b}}
[data-theme="dark"]{--sd-line:#64748b}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;display:flex;flex-direction:column;background:var(--sd-bg);color:var(--sd-text);font-family:var(--font-body,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif)}
header.sd-head{padding:18px 24px 12px;border-bottom:1px solid var(--sd-border);display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.sd-head h1{margin:0;font-size:20px;letter-spacing:-.01em}
.sd-head p{margin:4px 0 0;color:var(--sd-muted);font-size:14px;max-width:80ch}
.sd-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--sd-muted);align-items:center}
.sd-key{display:inline-flex;align-items:center;gap:6px}.sd-key i{width:10px;height:10px;border-radius:3px;display:inline-block}
.sd-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:radial-gradient(circle,var(--sd-border) 1px,transparent 1px) 0 0/22px 22px;cursor:grab;touch-action:none}
.sd-stage.drag{cursor:grabbing}
.sd-stage svg{position:absolute;left:0;top:0;transform-origin:0 0;overflow:visible}
.sd-tools{position:absolute;right:14px;bottom:14px;display:flex;gap:6px;z-index:2}
.sd-tools button{font:inherit;font-size:13px;line-height:1;padding:8px 11px;border-radius:8px;border:1px solid var(--sd-border);background:var(--sd-bg);color:var(--sd-text);cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.sd-tools button:hover{background:var(--sd-surface)}
.sd-edge{fill:none;stroke:var(--sd-line);stroke-width:1.7}
.sd-edge-label rect{fill:var(--sd-bg);stroke:var(--sd-border)}
.sd-edge-label text{font-size:11px;fill:var(--sd-muted);font-family:inherit}
.sd-label{font-size:${FONT}px;font-weight:600;fill:var(--sd-text);font-family:inherit}
.sd-detail{font-size:11px;fill:var(--sd-muted);font-family:var(--font-mono,ui-monospace,Menlo,monospace)}
.sd-group{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;fill:var(--sd-muted);font-family:inherit}
.sd-node{cursor:default}.sd-node:hover path,.sd-node:hover rect{filter:drop-shadow(0 4px 10px rgba(0,0,0,.18))}
footer.sd-notes{border-top:1px solid var(--sd-border);padding:10px 24px;font-size:13px;color:var(--sd-muted)}
.sd-notes ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px}
</style>
</head>
<body>
<header class="sd-head">
  <div><h1>${esc(diagram.title)}</h1>${diagram.description ? `<p>${esc(diagram.description)}</p>` : ""}</div>
  <div class="sd-legend">${legend}</div>
</header>
<div class="sd-stage" id="stage">
  <svg id="canvas" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(diagram.title)}">
    <defs>
      <marker id="sd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="var(--sd-line)"/></marker>
      <marker id="sd-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M10,1 L1,5 L10,9 z" fill="var(--sd-line)"/></marker>
    </defs>
    ${groupSvg}
    ${edgeSvg}
    ${nodeSvg}
    ${labelSvg}
  </svg>
  <div class="sd-tools"><button id="zin" title="Zoom in">+</button><button id="zout" title="Zoom out">-</button><button id="fit" title="Fit to screen">Fit</button></div>
</div>
${notes ? `<footer class="sd-notes"><ul>${notes}</ul></footer>` : ""}
<script>
(function(){
  var stage=document.getElementById('stage'),svg=document.getElementById('canvas');
  var W=${width},H=${height},s=1,x=0,y=0;
  function apply(){svg.style.transform='translate('+x+'px,'+y+'px) scale('+s+')'}
  function fit(){var r=stage.getBoundingClientRect();s=Math.min(1.6,(r.width-80)/W,(r.height-80)/H);x=(r.width-W*s)/2;y=(r.height-H*s)/2;apply()}
  function zoom(f,cx,cy){var r=stage.getBoundingClientRect();cx=cx==null?r.width/2:cx;cy=cy==null?r.height/2:cy;var n=Math.min(4,Math.max(.15,s*f));x=cx-(cx-x)*(n/s);y=cy-(cy-y)*(n/s);s=n;apply()}
  stage.addEventListener('wheel',function(e){e.preventDefault();var r=stage.getBoundingClientRect();if(e.ctrlKey||e.metaKey)zoom(Math.exp(-e.deltaY*.01),e.clientX-r.left,e.clientY-r.top);else{x-=e.deltaX;y-=e.deltaY;apply()}},{passive:false});
  var drag=null;
  stage.addEventListener('pointerdown',function(e){if(e.target.closest('.sd-tools'))return;drag={x:e.clientX-x,y:e.clientY-y};stage.classList.add('drag');stage.setPointerCapture(e.pointerId)});
  stage.addEventListener('pointermove',function(e){if(!drag)return;x=e.clientX-drag.x;y=e.clientY-drag.y;apply()});
  function end(){drag=null;stage.classList.remove('drag')}
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  document.getElementById('zin').onclick=function(){zoom(1.25)};
  document.getElementById('zout').onclick=function(){zoom(.8)};
  document.getElementById('fit').onclick=fit;
  addEventListener('resize',fit);fit();
})();
</script>
</body>
</html>`
}
