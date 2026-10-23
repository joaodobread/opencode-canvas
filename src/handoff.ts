import type { Artifact } from "./store.js"

const MAX_SOURCE = 60_000

export interface HandoffInput {
  artifact: Artifact
  html: string
  designSystem?: { id: string; title: string; usage?: string }
  note?: string
}

export function handoffPrompt({ artifact, html, designSystem, note }: HandoffInput): string {
  const source = html.length > MAX_SOURCE ? `${html.slice(0, MAX_SOURCE)}\n<!-- truncated: use canvas_get for the rest -->` : html
  const lines = [
    `The user approved a design in the canvas and wants it implemented in this project.`,
    `Design: ${artifact.id} (${artifact.kind}, "${artifact.title}", v${artifact.revision}${artifact.device ? `, ${artifact.device}` : ""})`,
  ]
  if (note) lines.push(`Note from the user: ${note}`)
  lines.push(
    "",
    "Steps:",
    "1. Inspect the project to find its stack (framework, styling approach, component library, routing, existing tokens and components).",
    "2. Rebuild the design with the project's own conventions instead of pasting the HTML: reuse existing components, map the design tokens below to the project's theme, and keep the spacing, hierarchy, copy and states of the design.",
    "3. Wire it into the right place (route, page or component), run the project's type check or tests if there are any, and summarize what you created and anything you had to guess.",
    "",
  )
  if (designSystem) {
    lines.push(`Design system: ${designSystem.id} ("${designSystem.title}"). Use canvas_get on it for the full CSS tokens.`)
    if (designSystem.usage) lines.push(designSystem.usage, "")
  }
  lines.push("Design HTML (the reference to match):", "```html", source, "```")
  return lines.join("\n")
}
