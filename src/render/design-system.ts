import { contrast, darken, lighten, mix, normalize, onColor } from "./color.js"
import { esc } from "./document.js"

export interface Tokens {
  name: string
  description?: string
  colors: Record<string, string>
  dark?: Record<string, string>
  fonts: { body: string; heading: string; mono: string; import?: string }
  baseSize: number
  scaleRatio: number
  spacingUnit: number
  radius: number
}

export interface TokenInput {
  name: string
  description?: string
  colors?: Record<string, string>
  dark?: Record<string, string>
  fonts?: { body?: string; heading?: string; mono?: string; import?: string }
  baseSize?: number
  scaleRatio?: number
  spacingUnit?: number
  radius?: number
}

export const NEUTRALS = ["background", "surface", "text", "muted", "border"] as const

const LIGHT_DEFAULTS: Record<string, string> = {
  primary: "#4f46e5",
  secondary: "#0891b2",
  accent: "#db2777",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#2563eb",
  background: "#ffffff",
  surface: "#f6f7fb",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
}

const DARK_NEUTRALS: Record<string, string> = {
  background: "#0b0f1a",
  surface: "#131a2b",
  text: "#e8ecf6",
  muted: "#98a2b8",
  border: "#263049",
}

const SYSTEM_SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const SYSTEM_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]
const TEXT_STEPS: [string, number][] = [
  ["xs", -1],
  ["sm", -0.5],
  ["base", 0],
  ["lg", 0.5],
  ["xl", 1],
  ["2xl", 2],
  ["3xl", 3],
  ["4xl", 4],
  ["5xl", 5],
]

function cssName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function fontStack(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback
  const clean = value.trim().replace(/[;{}<>]/g, "")
  return /,/.test(clean) ? clean : `${/\s/.test(clean) && !/^['"]/.test(clean) ? `'${clean}'` : clean}, ${fallback}`
}

const rem = (px: number) => `${Math.round((px / 16) * 1000) / 1000}rem`

export function resolveTokens(input: TokenInput): Tokens {
  const colors: Record<string, string> = { ...LIGHT_DEFAULTS }
  for (const [key, value] of Object.entries(input.colors ?? {})) {
    const hex = normalize(value)
    const name = cssName(key)
    if (!name) continue
    if (!hex) throw new Error(`Color "${key}" must be a hex value like #4f46e5 (got "${value}").`)
    colors[name] = hex
  }
  const dark: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.dark ?? {})) {
    const hex = normalize(value)
    const name = cssName(key)
    if (!name) continue
    if (!hex) throw new Error(`Dark color "${key}" must be a hex value (got "${value}").`)
    dark[name] = hex
  }
  const clamp = (value: number | undefined, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
  const body = fontStack(input.fonts?.body, SYSTEM_SANS)
  return {
    name: input.name,
    description: input.description,
    colors,
    dark,
    fonts: {
      body,
      heading: input.fonts?.heading ? fontStack(input.fonts.heading, SYSTEM_SANS) : body,
      mono: fontStack(input.fonts?.mono, SYSTEM_MONO),
      import: input.fonts?.import?.trim() || undefined,
    },
    baseSize: clamp(input.baseSize, 16, 12, 22),
    scaleRatio: clamp(input.scaleRatio, 1.25, 1.1, 1.6),
    spacingUnit: clamp(input.spacingUnit, 4, 2, 8),
    radius: clamp(input.radius, 8, 0, 32),
  }
}

export function brandNames(tokens: Tokens): string[] {
  return Object.keys(tokens.colors).filter((name) => !(NEUTRALS as readonly string[]).includes(name))
}

function darkColors(tokens: Tokens): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of NEUTRALS) out[name] = tokens.dark?.[name] ?? DARK_NEUTRALS[name]!
  for (const name of brandNames(tokens)) out[name] = tokens.dark?.[name] ?? lighten(tokens.colors[name]!, 0.18)
  return out
}

function colorDeclarations(colors: Record<string, string>, tokens: Tokens): string[] {
  const background = colors.background!
  const declarations: string[] = []
  for (const name of NEUTRALS) declarations.push(`--color-${name}:${colors[name]}`)
  for (const name of brandNames(tokens)) {
    const base = colors[name]!
    const bright = onColor(base) === "#ffffff"
    declarations.push(
      `--color-${name}:${base}`,
      `--color-${name}-on:${onColor(base)}`,
      `--color-${name}-hover:${bright ? darken(base, 0.12) : lighten(base, 0.14)}`,
      `--color-${name}-soft:${mix(base, background, 0.14)}`,
    )
  }
  return declarations
}

function shadowDeclarations(dark: boolean): string[] {
  const a = dark ? 0.5 : 0.1
  const b = dark ? 0.4 : 0.06
  const tint = dark ? "0,0,0" : "15,23,42"
  return [
    `--shadow-sm:0 1px 2px rgba(${tint},${a * 0.6})`,
    `--shadow-md:0 4px 12px rgba(${tint},${a}),0 1px 3px rgba(${tint},${b})`,
    `--shadow-lg:0 16px 40px rgba(${tint},${a * 1.4}),0 4px 10px rgba(${tint},${b})`,
  ]
}

function scaleDeclarations(tokens: Tokens): string[] {
  const out: string[] = []
  for (const [name, step] of TEXT_STEPS) {
    out.push(`--text-${name}:${rem(tokens.baseSize * tokens.scaleRatio ** step)}`)
  }
  for (const n of SPACE_STEPS) out.push(`--space-${n}:${rem(tokens.spacingUnit * n)}`)
  out.push(
    `--radius-sm:${rem(tokens.radius * 0.5)}`,
    `--radius:${rem(tokens.radius)}`,
    `--radius-lg:${rem(tokens.radius * 1.6)}`,
    "--radius-full:9999px",
  )
  return out
}

export function buildCss(tokens: Tokens, extra?: string): string {
  const brand = brandNames(tokens)
  const dark = darkColors(tokens)
  const light = [
    ...colorDeclarations(tokens.colors, tokens),
    `--font-body:${tokens.fonts.body}`,
    `--font-heading:${tokens.fonts.heading}`,
    `--font-mono:${tokens.fonts.mono}`,
    ...scaleDeclarations(tokens),
    ...shadowDeclarations(false),
  ]
  const darkVars = [...colorDeclarations(dark, tokens), ...shadowDeclarations(true)]
  const out: string[] = []
  if (tokens.fonts.import) {
    const url = tokens.fonts.import.replace(/['"()\s]/g, "")
    if (/^https:\/\//.test(url)) out.push(`@import url("${url}");`)
  }
  out.push(`/* ${tokens.name.replace(/\*\//g, "")} - generated by opencode-canvas */`)
  out.push(`:root{color-scheme:light;${light.join(";")}}`)
  out.push(`@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${darkVars.join(";")}}}`)
  out.push(`[data-theme="dark"]{color-scheme:dark;${darkVars.join(";")}}`)
  out.push(`[data-theme="light"]{color-scheme:light}`)
  out.push(BASE_CSS)
  for (const name of brand) {
    out.push(
      `.btn-${name}{background:var(--color-${name});color:var(--color-${name}-on)}` +
        `.btn-${name}:hover:not(:disabled){background:var(--color-${name}-hover)}` +
        `.btn-outline-${name}{background:transparent;color:var(--color-${name});border-color:var(--color-${name})}` +
        `.btn-outline-${name}:hover:not(:disabled){background:var(--color-${name}-soft)}` +
        `.badge-${name}{background:var(--color-${name}-soft);color:var(--color-${name})}` +
        `.alert-${name}{background:var(--color-${name}-soft);border-color:var(--color-${name});color:var(--color-text)}` +
        `.text-${name}{color:var(--color-${name})}.bg-${name}{background:var(--color-${name});color:var(--color-${name}-on)}`,
    )
  }
  if (extra?.trim()) out.push(`/* custom */\n${extra.trim()}`)
  return out.join("\n")
}

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--color-background);color:var(--color-text);font-family:var(--font-body);font-size:var(--text-base);line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4,h5,h6{font-family:var(--font-heading);line-height:1.2;margin:0 0 var(--space-3);font-weight:700;letter-spacing:-0.01em}
h1{font-size:var(--text-4xl)}h2{font-size:var(--text-3xl)}h3{font-size:var(--text-2xl)}h4{font-size:var(--text-xl)}h5{font-size:var(--text-lg)}h6{font-size:var(--text-base)}
p{margin:0 0 var(--space-4)}
a{color:var(--color-primary);text-decoration:none}a:hover{text-decoration:underline}
img,svg,video{max-width:100%}
code,kbd,pre{font-family:var(--font-mono);font-size:.92em}
code{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:.1em .4em}
pre{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius);padding:var(--space-4);overflow:auto}
pre code{background:none;border:0;padding:0}
kbd{background:var(--color-surface);border:1px solid var(--color-border);border-bottom-width:2px;border-radius:var(--radius-sm);padding:.1em .45em}
hr,.divider{border:0;border-top:1px solid var(--color-border);margin:var(--space-6) 0}
.container{width:100%;max-width:1120px;margin:0 auto;padding:0 var(--space-6)}
.container-sm{max-width:720px}.container-lg{max-width:1360px}
.stack{display:flex;flex-direction:column;gap:var(--space-4)}.stack-sm{gap:var(--space-2)}.stack-lg{gap:var(--space-8)}
.row{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap}.row-between{justify-content:space-between}.row-end{justify-content:flex-end}.row-nowrap{flex-wrap:nowrap}
.grid{display:grid;gap:var(--space-4)}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.grid-auto{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
@media (max-width:720px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}.container{padding:0 var(--space-4)}}
.grow{flex:1 1 0;min-width:0}
.text-muted{color:var(--color-muted)}.text-center{text-align:center}.text-right{text-align:right}
.text-xs{font-size:var(--text-xs)}.text-sm{font-size:var(--text-sm)}.text-lg{font-size:var(--text-lg)}.text-xl{font-size:var(--text-xl)}.text-2xl{font-size:var(--text-2xl)}.text-3xl{font-size:var(--text-3xl)}
.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.mono{font-family:var(--font-mono)}
.eyebrow{font-size:var(--text-xs);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--color-muted)}
.surface{background:var(--color-surface)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);font:inherit;font-size:var(--text-sm);font-weight:600;line-height:1;padding:var(--space-3) var(--space-5);border:1px solid transparent;border-radius:var(--radius);cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s,box-shadow .15s,transform .05s;background:var(--color-surface);color:var(--color-text);border-color:var(--color-border)}
.btn:hover:not(:disabled){text-decoration:none}
.btn:active:not(:disabled){transform:translateY(1px)}
.btn:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-sm{padding:var(--space-2) var(--space-3);font-size:var(--text-xs)}.btn-lg{padding:var(--space-4) var(--space-6);font-size:var(--text-base)}.btn-block{display:flex;width:100%}
.btn-ghost{background:transparent;border-color:transparent;color:var(--color-text)}.btn-ghost:hover:not(:disabled){background:var(--color-surface)}
.btn-icon{padding:var(--space-3);aspect-ratio:1}
.card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-6)}
.card-elevated{background:var(--color-background);box-shadow:var(--shadow-md);border-color:transparent}
.card-hover{transition:box-shadow .15s,transform .15s}.card-hover:hover{box-shadow:var(--shadow-lg);transform:translateY(-2px)}
.card-flush{padding:0;overflow:hidden}
.label{display:block;font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-2)}
.help{font-size:var(--text-xs);color:var(--color-muted);margin-top:var(--space-1)}
.input,.select,.textarea{display:block;width:100%;font:inherit;font-size:var(--text-sm);color:var(--color-text);background:var(--color-background);border:1px solid var(--color-border);border-radius:var(--radius);padding:var(--space-3) var(--space-4);transition:border-color .15s,box-shadow .15s}
.input::placeholder,.textarea::placeholder{color:var(--color-muted)}
.input:focus,.select:focus,.textarea:focus{outline:none;border-color:var(--color-primary);box-shadow:0 0 0 3px var(--color-primary-soft)}
.textarea{min-height:96px;resize:vertical}
.field{display:block}
.check{display:inline-flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm)}.check input{accent-color:var(--color-primary);width:1rem;height:1rem}
.badge{display:inline-flex;align-items:center;gap:var(--space-1);font-size:var(--text-xs);font-weight:600;padding:.2em .7em;border-radius:var(--radius-full);background:var(--color-surface);color:var(--color-muted)}
.alert{border:1px solid var(--color-border);border-left-width:4px;border-radius:var(--radius);padding:var(--space-3) var(--space-4);font-size:var(--text-sm)}
.table{width:100%;border-collapse:collapse;font-size:var(--text-sm)}
.table th{text-align:left;font-weight:600;color:var(--color-muted);font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.05em}
.table th,.table td{padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border)}
.table tbody tr:hover{background:var(--color-surface)}
.avatar{display:inline-flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border-radius:var(--radius-full);background:var(--color-primary-soft);color:var(--color-primary);font-weight:700;font-size:var(--text-sm);flex:none}
.avatar-sm{width:2rem;height:2rem;font-size:var(--text-xs)}.avatar-lg{width:3.5rem;height:3.5rem;font-size:var(--text-lg)}
.navbar{display:flex;align-items:center;justify-content:space-between;gap:var(--space-6);padding:var(--space-4) var(--space-6);background:var(--color-background);border-bottom:1px solid var(--color-border)}
.navbar-brand{font-family:var(--font-heading);font-weight:800;font-size:var(--text-lg);color:var(--color-text)}
.nav-links{display:flex;align-items:center;gap:var(--space-5)}.nav-links a{color:var(--color-muted);font-size:var(--text-sm);font-weight:500}.nav-links a:hover,.nav-links a.active{color:var(--color-text);text-decoration:none}
.sidebar{display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-4);background:var(--color-surface);border-right:1px solid var(--color-border)}
.sidebar a{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) var(--space-3);border-radius:var(--radius);color:var(--color-muted);font-size:var(--text-sm);font-weight:500}
.sidebar a:hover{background:var(--color-background);color:var(--color-text);text-decoration:none}
.sidebar a.active{background:var(--color-primary-soft);color:var(--color-primary)}
.tabs{display:flex;gap:var(--space-1);border-bottom:1px solid var(--color-border)}
.tabs a{padding:var(--space-3) var(--space-4);color:var(--color-muted);font-size:var(--text-sm);font-weight:600;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a:hover{text-decoration:none;color:var(--color-text)}.tabs a.active{color:var(--color-primary);border-color:var(--color-primary)}
.stat{display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-1)}.stat-value{font-family:var(--font-heading);font-size:var(--text-3xl);font-weight:800;line-height:1}.stat-label{font-size:var(--text-sm);color:var(--color-muted)}
.hero{padding:var(--space-16) 0;text-align:center}
.shadow-sm{box-shadow:var(--shadow-sm)}.shadow-md{box-shadow:var(--shadow-md)}.shadow-lg{box-shadow:var(--shadow-lg)}
.rounded{border-radius:var(--radius)}.rounded-lg{border-radius:var(--radius-lg)}.rounded-full{border-radius:var(--radius-full)}
`.trim()

export function classCheatSheet(tokens: Tokens): string {
  const brand = brandNames(tokens)
  return [
    `Colors (CSS vars): ${[...NEUTRALS, ...brand].map((n) => `--color-${n}`).join(", ")}; each brand color also has -on, -hover and -soft variants.`,
    `Brand colors: ${brand.join(", ")} -> classes .btn-<c>, .btn-outline-<c>, .badge-<c>, .alert-<c>, .text-<c>, .bg-<c>.`,
    "Type: --font-body, --font-heading, --font-mono; --text-xs|sm|base|lg|xl|2xl|3xl|4xl|5xl. Utilities: .text-sm .text-lg ..., .text-muted, .eyebrow, .mono, .font-semibold.",
    "Space: --space-1|2|3|4|5|6|8|10|12|16. Radius: --radius-sm, --radius, --radius-lg, --radius-full. Shadows: --shadow-sm|md|lg.",
    "Layout: .container(.container-sm|-lg), .stack(.stack-sm|-lg), .row(.row-between|.row-end), .grid + .grid-2|3|4|auto, .grow, .hero, .divider.",
    "Components: .btn (+ .btn-primary, .btn-ghost, .btn-sm, .btn-lg, .btn-block), .card(.card-elevated|.card-hover|.card-flush), .input .select .textarea .label .help .check, .badge, .alert, .table, .avatar, .navbar(.navbar-brand .nav-links), .sidebar, .tabs, .stat(.stat-value .stat-label).",
    'Dark mode: automatic via prefers-color-scheme; force with <html data-theme="dark|light">.',
  ].join("\n")
}

function swatch(tokens: Tokens, name: string): string {
  const hex = tokens.colors[name]!
  const on = onColor(hex)
  const ratio = contrast(hex, on).toFixed(1)
  const neutral = (NEUTRALS as readonly string[]).includes(name)
  return `<div class="sc-swatch"><div class="sc-chip" style="background:var(--color-${name});color:${neutral ? onColor(hex) : `var(--color-${name}-on)`}"><span>Aa</span>${neutral ? "" : `<small>${ratio}:1</small>`}</div><div class="sc-meta"><strong>${esc(name)}</strong><code>${hex}</code><span>--color-${esc(name)}</span></div></div>`
}

export function buildShowcase(tokens: Tokens, css: string): string {
  const brand = brandNames(tokens)
  const colors = [...brand, ...NEUTRALS]
  const scale = TEXT_STEPS.map(([name, step]) => {
    const px = Math.round(tokens.baseSize * tokens.scaleRatio ** step * 10) / 10
    return `<div class="sc-type-row"><code>--text-${name}</code><span class="text-muted text-sm">${px}px</span><span style="font-size:var(--text-${name});line-height:1.2">The quick brown fox</span></div>`
  }).join("")
  const spacing = SPACE_STEPS.map(
    (n) =>
      `<div class="sc-space"><code>--space-${n}</code><span class="text-muted text-sm">${tokens.spacingUnit * n}px</span><div style="height:12px;width:var(--space-${n});background:var(--color-primary);border-radius:3px"></div></div>`,
  ).join("")
  const radii = ["sm", "", "lg", "full"]
    .map((r) => {
      const v = r ? `--radius-${r}` : "--radius"
      return `<div class="sc-radius"><div style="border-radius:var(${v})"></div><code>${v}</code></div>`
    })
    .join("")
  const shadows = ["sm", "md", "lg"]
    .map((s) => `<div class="sc-shadow" style="box-shadow:var(--shadow-${s})"><code>--shadow-${s}</code></div>`)
    .join("")
  const buttons = brand.map((n) => `<button class="btn btn-${esc(n)}">${esc(n)}</button>`).join("")
  const outlines = brand.slice(0, 4).map((n) => `<button class="btn btn-outline-${esc(n)}">${esc(n)}</button>`).join("")
  const badges = brand.map((n) => `<span class="badge badge-${esc(n)}">${esc(n)}</span>`).join("")
  const alerts = ["info", "success", "warning", "danger"]
    .filter((n) => brand.includes(n))
    .map((n) => `<div class="alert alert-${n}"><strong>${n[0]!.toUpperCase()}${n.slice(1)}.</strong> This is a ${n} message.</div>`)
    .join("")
  const sheet = classCheatSheet(tokens)
    .split("\n")
    .map((line) => `<li>${esc(line)}</li>`)
    .join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tokens.name)} - Design System</title>
<style data-design-system>${css.replace(/<\/style/gi, "<\\/style")}</style>
<style>
.sc-wrap{max-width:1100px;margin:0 auto;padding:var(--space-10) var(--space-6) var(--space-16)}
.sc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-6);margin-bottom:var(--space-10)}
.sc-section{margin-top:var(--space-12)}
.sc-section>h2{font-size:var(--text-2xl);padding-bottom:var(--space-3);border-bottom:1px solid var(--color-border);margin-bottom:var(--space-5)}
.sc-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--space-4)}
.sc-swatch{border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;background:var(--color-background)}
.sc-chip{height:84px;display:flex;align-items:flex-end;justify-content:space-between;padding:var(--space-3);font-weight:700;font-size:var(--text-xl)}
.sc-chip small{font-size:var(--text-xs);font-weight:600;opacity:.85}
.sc-meta{display:flex;flex-direction:column;gap:2px;padding:var(--space-3);font-size:var(--text-sm)}
.sc-meta span{color:var(--color-muted);font-size:var(--text-xs);font-family:var(--font-mono)}
.sc-meta code{align-self:flex-start;font-size:var(--text-xs)}
.sc-type-row{display:grid;grid-template-columns:120px 60px 1fr;gap:var(--space-4);align-items:baseline;padding:var(--space-2) 0;border-bottom:1px dashed var(--color-border)}
.sc-space{display:grid;grid-template-columns:100px 50px 1fr;gap:var(--space-3);align-items:center;padding:var(--space-1) 0}
.sc-radii,.sc-shadows{display:flex;flex-wrap:wrap;gap:var(--space-6)}
.sc-radius{display:flex;flex-direction:column;gap:var(--space-2);align-items:flex-start}
.sc-radius div{width:88px;height:88px;background:var(--color-primary-soft);border:2px solid var(--color-primary)}
.sc-shadow{width:150px;height:90px;border-radius:var(--radius);background:var(--color-background);display:flex;align-items:center;justify-content:center;border:1px solid var(--color-border)}
.sc-demo{border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-6)}
.sc-sheet{margin:0;padding-left:var(--space-5);display:flex;flex-direction:column;gap:var(--space-2);font-size:var(--text-sm)}
.sc-toggle{white-space:nowrap}
</style>
</head>
<body>
<div class="sc-wrap">
  <header class="sc-head">
    <div>
      <p class="eyebrow">Design system</p>
      <h1>${esc(tokens.name)}</h1>
      ${tokens.description ? `<p class="text-muted" style="max-width:60ch">${esc(tokens.description)}</p>` : ""}
    </div>
    <button class="btn btn-sm sc-toggle" onclick="var r=document.documentElement,d=r.getAttribute('data-theme')==='dark'||(!r.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);r.setAttribute('data-theme',d?'light':'dark')">Toggle dark mode</button>
  </header>

  <section class="sc-section"><h2>Colors</h2><div class="sc-swatches">${colors.map((n) => swatch(tokens, n)).join("")}</div></section>

  <section class="sc-section"><h2>Typography</h2>
    <div class="grid grid-3" style="margin-bottom:var(--space-6)">
      <div class="card"><p class="eyebrow">Heading</p><div style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:700">${esc(tokens.fonts.heading.split(",")[0]!.replace(/['"]/g, ""))}</div></div>
      <div class="card"><p class="eyebrow">Body</p><div style="font-size:var(--text-xl)">${esc(tokens.fonts.body.split(",")[0]!.replace(/['"]/g, ""))}</div></div>
      <div class="card"><p class="eyebrow">Mono</p><div class="mono" style="font-size:var(--text-xl)">${esc(tokens.fonts.mono.split(",")[0]!.replace(/['"]/g, ""))}</div></div>
    </div>
    ${scale}
  </section>

  <section class="sc-section"><h2>Spacing</h2>${spacing}</section>
  <section class="sc-section"><h2>Radius</h2><div class="sc-radii">${radii}</div></section>
  <section class="sc-section"><h2>Shadows</h2><div class="sc-shadows">${shadows}</div></section>

  <section class="sc-section"><h2>Components</h2>
    <div class="stack stack-lg">
      <div class="sc-demo stack"><p class="eyebrow">Buttons</p><div class="row">${buttons}</div><div class="row">${outlines}<button class="btn">Default</button><button class="btn btn-ghost">Ghost</button><button class="btn btn-primary btn-sm">Small</button><button class="btn btn-primary btn-lg">Large</button><button class="btn btn-primary" disabled>Disabled</button></div></div>
      <div class="sc-demo stack"><p class="eyebrow">Badges and alerts</p><div class="row">${badges}</div><div class="stack stack-sm">${alerts}</div></div>
      <div class="sc-demo"><p class="eyebrow">Form</p><div class="grid grid-2">
        <div class="field"><label class="label">Email</label><input class="input" placeholder="you@example.com"><p class="help">We never share your email.</p></div>
        <div class="field"><label class="label">Plan</label><select class="select"><option>Starter</option><option>Pro</option></select></div>
        <div class="field" style="grid-column:1/-1"><label class="label">Message</label><textarea class="textarea" placeholder="Tell us more"></textarea></div>
        <label class="check"><input type="checkbox" checked> Remember me</label>
      </div></div>
      <div class="grid grid-3">
        <div class="card"><h4>Card</h4><p class="text-muted text-sm">Flat card with border.</p><button class="btn btn-primary btn-sm">Action</button></div>
        <div class="card card-elevated"><h4>Elevated</h4><p class="text-muted text-sm">Uses --shadow-md.</p><span class="badge badge-primary">New</span></div>
        <div class="card"><div class="stat"><span class="stat-label">Active users</span><span class="stat-value">12,480</span><span class="badge badge-success">+8.2%</span></div></div>
      </div>
      <div class="sc-demo"><p class="eyebrow">Table</p><table class="table"><thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>
        <tr><td><div class="row row-nowrap"><span class="avatar avatar-sm">AL</span>Ada Lovelace</div></td><td>Engineer</td><td><span class="badge badge-success">Active</span></td></tr>
        <tr><td><div class="row row-nowrap"><span class="avatar avatar-sm">GH</span>Grace Hopper</div></td><td>Admiral</td><td><span class="badge badge-warning">Away</span></td></tr>
      </tbody></table></div>
    </div>
  </section>

  <section class="sc-section"><h2>Usage</h2><ul class="sc-sheet">${sheet}</ul></section>
</div>
</body>
</html>`
}
