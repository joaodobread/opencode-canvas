import { Error as ToolError, type Info } from "@opencode/plugin/promise/tool"
import type { Comment, CommentStore } from "./comments.js"
import { prepareDocument } from "./render/document.js"
import {
  buildCss,
  buildShowcase,
  classCheatSheet,
  resolveTokens,
  type TokenInput,
} from "./render/design-system.js"
import { NODE_TYPES, renderSystemDesign, type Diagram } from "./render/system-design.js"
import { DEVICES, KINDS, type Artifact, type Device, type Kind, type Store } from "./store.js"

export interface Runtime {
  store: Store
  comments: CommentStore
  /** Remembers which session is working with the canvas, so browser comments can be routed to it. */
  track(context: unknown): void
  /** Starts the preview server on first use and returns the URL for an artifact. */
  urlFor(id?: string): Promise<string>
  /** Opens the browser once per server start, unless disabled. */
  announce(id: string): Promise<string>
  open(id?: string): Promise<string>
}

type Input = Record<string, unknown>

const FREE_FORM = ["screen", "component", "prototype", "document"] as const

const PROJECT_PROP = {
  type: "string",
  description: 'Project (folder) to file the design under, by id or name. A new name creates the project. "none" removes it from its project. Default: unchanged (new designs: no project).',
}

function fail(message: string): never {
  throw new ToolError({ message })
}

function str(input: Input, key: string, required = false): string | undefined {
  const value = input[key]
  if (value === undefined || value === null || value === "") {
    if (required) fail(`"${key}" is required.`)
    return undefined
  }
  if (typeof value !== "string") fail(`"${key}" must be a string.`)
  return value
}

function oneOf<T extends string>(input: Input, key: string, allowed: readonly T[]): T | undefined {
  const value = str(input, key)
  if (value === undefined) return undefined
  if (!(allowed as readonly string[]).includes(value)) fail(`"${key}" must be one of: ${allowed.join(", ")}.`)
  return value as T
}

function mergeColors(before: Record<string, string> | undefined, next: Record<string, string> | undefined) {
  const out = { ...before, ...next }
  for (const [key, value] of Object.entries(out)) if (value === "") delete out[key]
  return out
}

function describe(artifact: Artifact) {
  return `${artifact.kind} "${artifact.title}" (id: ${artifact.id}, v${artifact.revision})`
}

async function guard<T>(job: () => Promise<T> | T): Promise<T> {
  try {
    return await job()
  } catch (error) {
    if (error instanceof ToolError) throw error
    fail(error instanceof Error ? error.message : String(error))
  }
}

export function createTools(runtime: Runtime) {
  const { store } = runtime

  const resolveDesignSystem = (input: Input, kind: Kind, existing?: Artifact) => {
    const requested = str(input, "designSystem")
    if (requested === "none") return { id: undefined as string | undefined, auto: false }
    if (requested) {
      const found = store.get(requested)
      if (!found || found.kind !== "design-system") {
        const available = store.list("design-system").map((a) => a.id)
        fail(
          `Design system "${requested}" does not exist.` +
            (available.length ? ` Available: ${available.join(", ")}.` : " Create one first with canvas_design_system."),
        )
      }
      return { id: requested as string | undefined, auto: false }
    }
    if (existing?.designSystem) return { id: existing.designSystem as string | undefined, auto: false }
    if (kind === "system-design" || kind === "design-system") return { id: undefined, auto: false }
    const latest = store.list("design-system")[0]
    return { id: latest?.id, auto: Boolean(latest) }
  }

  /** Accepts a project id or name; unknown names create the project. "" or "none" means no project. */
  const resolveProject = async (input: Input): Promise<string | undefined> => {
    const ref = input.project
    if (ref === undefined || ref === null) return undefined
    if (typeof ref !== "string") fail('"project" must be a string.')
    if (ref === "" || ref === "none") return ""
    await store.init()
    return (store.findProject(ref) ?? (await store.createProject(ref))).id
  }

  const report = async (artifact: Artifact, created: boolean, extra: string[] = []) => {
    const url = await runtime.announce(artifact.id)
    const folder = artifact.project ? store.project(artifact.project) : undefined
    const lines = [`${created ? "Created" : "Updated"} ${describe(artifact)}.`, `Preview: ${url}`, ...(folder ? [`Project: ${folder.name}.`] : []), ...extra]
    return {
      content: lines.join("\n"),
      metadata: { id: artifact.id, kind: artifact.kind, revision: artifact.revision, url },
    }
  }

  const designSystem = {
    name: "design_system",
    description:
      "Create or update a design system and show it in the canvas. Provide brand colors, fonts and scales; the tool generates a complete CSS " +
      "(color tokens with hover/soft/on variants, typography scale, spacing, radius, shadows, dark mode, plus ready-made classes such as .btn, .card, .input, .badge, .table, .navbar) " +
      "and a visual style guide. Screens created afterwards automatically load it. The result lists every token and class to use. Calling it again with the same id merges your changes into the previous tokens.",
    input: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Design system name, e.g. "Acme UI".' },
        id: { type: "string", description: "Stable id (lowercase, digits, dashes). Defaults to a slug of the name." },
        description: { type: "string", description: "One or two sentences about the visual language." },
        colors: {
          type: "object",
          description:
            "Hex colors by name. Known names: primary, secondary, accent, success, warning, danger, info (brand) and background, surface, text, muted, border (neutrals). Extra names become new brand colors. Hover, soft and on-color variants are derived.",
          additionalProperties: { type: "string" },
        },
        dark: {
          type: "object",
          description: "Optional hex overrides for dark mode. Anything omitted is derived automatically. Pass an empty string to remove a previous override.",
          additionalProperties: { type: "string" },
        },
        fonts: {
          type: "object",
          properties: {
            body: { type: "string", description: 'Font family, e.g. "Inter".' },
            heading: { type: "string" },
            mono: { type: "string" },
            import: { type: "string", description: "https URL of a web font stylesheet (for example a Google Fonts css2 URL)." },
          },
          additionalProperties: false,
        },
        baseSize: { type: "number", description: "Base font size in px (12-22, default 16)." },
        scaleRatio: { type: "number", description: "Type scale ratio (1.1-1.6, default 1.25)." },
        spacingUnit: { type: "number", description: "Spacing unit in px (2-8, default 4)." },
        radius: { type: "number", description: "Base border radius in px (0-32, default 8)." },
        css: { type: "string", description: "Extra CSS appended after the generated styles (custom components)." },
        project: PROJECT_PROP,
      },
      required: ["name"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const name = str(input, "name", true)!
        const id = str(input, "id")
        const resolvedId = store.resolveId({ id, kind: "design-system", title: name, html: "" })
        const previous = store.get(resolvedId)
        if (previous && previous.kind !== "design-system") fail(`Id "${resolvedId}" is used by a ${previous.kind}.`)
        const before = ((previous?.data as { input?: TokenInput } | undefined)?.input ?? { name }) as TokenInput
        const merged: TokenInput = {
          ...before,
          name,
          description: str(input, "description") ?? before.description,
          colors: mergeColors(before.colors, input.colors as Record<string, string> | undefined),
          dark: mergeColors(before.dark, input.dark as Record<string, string> | undefined),
          fonts: { ...before.fonts, ...(input.fonts as TokenInput["fonts"] | undefined) },
          baseSize: (input.baseSize as number | undefined) ?? before.baseSize,
          scaleRatio: (input.scaleRatio as number | undefined) ?? before.scaleRatio,
          spacingUnit: (input.spacingUnit as number | undefined) ?? before.spacingUnit,
          radius: (input.radius as number | undefined) ?? before.radius,
        }
        const extra = str(input, "css") ?? (previous?.data as { css?: string } | undefined)?.css
        const tokens = resolveTokens(merged)
        const css = buildCss(tokens, extra)
        const html = buildShowcase(tokens, css)
        const usage = classCheatSheet(tokens)
        const { artifact, created } = await store.save({
          id: resolvedId,
          kind: "design-system",
          title: name,
          description: tokens.description,
          html,
          data: { input: merged, css: extra, usage },
          project: await resolveProject(input),
        })
        return report(artifact, created, [
          "",
          "Screens created from now on load this design system automatically (set designSystem to pick another, or \"none\").",
          "Use these tokens and classes - do not hardcode colors or fonts:",
          usage,
        ])
      })
    },
    options: { namespace: "canvas" },
  }

  const screen = {
    name: "screen",
    description:
      "Create or replace a UI design in the canvas as HTML and show it live in the browser. Use it for screens, pages, components, clickable prototypes and documents. " +
      "Pass a complete HTML document or just the body markup; the linked design system (latest by default) is injected before your styles, so prefer its classes and CSS variables over hardcoded values. " +
      "Inline <style> and <script> are allowed and run in a sandboxed frame; use only self-contained assets (inline SVG, data URIs) or https URLs. " +
      "Calling it with an existing id replaces that design and bumps its revision; for small tweaks use canvas_edit instead.",
    input: {
      type: "object",
      properties: {
        title: { type: "string", description: 'Human title, e.g. "Checkout - payment step".' },
        html: { type: "string", description: "Full HTML document or body fragment." },
        id: { type: "string", description: "Stable id (lowercase, digits, dashes). Defaults to a slug of the title." },
        kind: { type: "string", enum: [...FREE_FORM], description: "Default: screen." },
        device: { type: "string", enum: [...DEVICES], description: "Preview frame. Use mobile for phone layouts, desktop for 1280px pages. Default: responsive." },
        designSystem: { type: "string", description: 'Design system id, or "none" to opt out. Default: the most recent design system.' },
        description: { type: "string" },
        project: PROJECT_PROP,
      },
      required: ["title", "html"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const title = str(input, "title", true)!
        const html = str(input, "html", true)!
        const kind = (oneOf(input, "kind", FREE_FORM) ?? "screen") as Kind
        const id = str(input, "id")
        const resolvedId = store.resolveId({ id, kind, title, html: "" })
        const existing = store.get(resolvedId)
        if (existing && existing.kind !== kind) fail(`Id "${resolvedId}" is already used by a ${existing.kind}.`)
        const ds = resolveDesignSystem(input, kind, existing)
        const { artifact, created } = await store.save({
          id: resolvedId,
          kind,
          title,
          html,
          description: str(input, "description"),
          device: oneOf(input, "device", DEVICES) as Device | undefined,
          designSystem: ds.id,
          project: await resolveProject(input),
        })
        const notes: string[] = []
        if (ds.id) notes.push(`Design system: ${ds.id}${ds.auto ? " (applied automatically)" : ""}.`)
        else if (store.list("design-system").length === 0 && kind !== "document") {
          notes.push("No design system yet. Consider creating one with canvas_design_system for consistent styling.")
        }
        return report(artifact, created, notes)
      })
    },
    options: { namespace: "canvas" },
  }

  const systemDesign = {
    name: "system_design",
    description:
      "Create or replace a system architecture diagram in the canvas from a list of nodes and edges. Layout, routing, grouping and styling are automatic " +
      "(layered left-to-right or top-to-bottom, with pan/zoom). Use it for architecture overviews, data flows, infrastructure and sequence-of-services maps. " +
      "Node types set the shape and color: " + NODE_TYPES.join(", ") + ". Use `group` to draw boundaries (e.g. VPC, Backend, Data layer).",
    input: {
      type: "object",
      properties: {
        title: { type: "string" },
        id: { type: "string" },
        description: { type: "string" },
        direction: { type: "string", enum: ["LR", "TB"], description: "LR = left to right (default), TB = top to bottom." },
        routing: {
          type: "string",
          enum: ["orthogonal", "curved"],
          description: "Edge shape. orthogonal (default) = straight lines with rounded corners. Use curved (bezier) only when the user asks for it.",
        },
        nodes: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              type: { type: "string", enum: [...NODE_TYPES] },
              detail: { type: "string", description: 'Technology or sizing, e.g. "PostgreSQL 16".' },
              group: { type: "string", description: "Boundary this node belongs to." },
              description: { type: "string", description: "Tooltip text." },
            },
            required: ["id", "label"],
            additionalProperties: false,
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              label: { type: "string", description: 'Protocol or payload, e.g. "gRPC", "events".' },
              style: { type: "string", enum: ["solid", "dashed", "dotted"], description: "Use dashed for async flows." },
              bidirectional: { type: "boolean" },
            },
            required: ["from", "to"],
            additionalProperties: false,
          },
        },
        notes: { type: "array", items: { type: "string" }, description: "Short design notes shown under the diagram." },
        designSystem: { type: "string", description: 'Design system id for colors and fonts, "none" to opt out. Default: the most recent design system.' },
        project: PROJECT_PROP,
      },
      required: ["title", "nodes", "edges"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const title = str(input, "title", true)!
        const diagram: Diagram = {
          title,
          description: str(input, "description"),
          direction: oneOf(input, "direction", ["LR", "TB"] as const),
          routing: oneOf(input, "routing", ["orthogonal", "curved"] as const),
          nodes: (input.nodes as Diagram["nodes"] | undefined) ?? [],
          edges: (input.edges as Diagram["edges"] | undefined) ?? [],
          notes: input.notes as string[] | undefined,
        }
        const html = renderSystemDesign(diagram)
        const id = str(input, "id")
        const resolvedId = store.resolveId({ id, kind: "system-design", title, html: "" })
        const existing = store.get(resolvedId)
        const requested = str(input, "designSystem")
        const ds = requested === "none" ? undefined : (requested ?? existing?.designSystem ?? store.list("design-system")[0]?.id)
        if (requested && requested !== "none" && store.get(requested)?.kind !== "design-system") {
          fail(`Design system "${requested}" does not exist.`)
        }
        const { artifact, created } = await store.save({
          id: resolvedId,
          kind: "system-design",
          title,
          description: diagram.description,
          html,
          device: "responsive",
          designSystem: ds,
          data: diagram,
          project: await resolveProject(input),
        })
        return report(artifact, created, [`${diagram.nodes.length} nodes, ${diagram.edges.length} edges.`])
      })
    },
    options: { namespace: "canvas" },
  }

  const edit = {
    name: "edit",
    description:
      "Make a targeted change to an existing screen, component, prototype or document by replacing exact text in its HTML (like the edit tool). " +
      "Cheaper than resending the whole design. Fails if oldString is missing or not unique unless replaceAll is true. Use canvas_get to read the current HTML first.",
    input: {
      type: "object",
      properties: {
        id: { type: "string" },
        oldString: { type: "string" },
        newString: { type: "string" },
        replaceAll: { type: "boolean" },
      },
      required: ["id", "oldString", "newString"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const id = str(input, "id", true)!
        const oldString = str(input, "oldString", true)!
        const newString = typeof input.newString === "string" ? input.newString : fail('"newString" must be a string.')
        if (oldString === newString) fail("oldString and newString are identical.")
        const artifact = store.get(id) ?? fail(`No design with id "${id}". Use canvas_list to see what exists.`)
        if (!(FREE_FORM as readonly string[]).includes(artifact.kind)) {
          fail(`${artifact.kind} designs are generated; call canvas_${artifact.kind === "design-system" ? "design_system" : "system_design"} again instead.`)
        }
        const html = (await store.html(id)) ?? fail(`The HTML for "${id}" is missing on disk.`)
        const count = html.split(oldString).length - 1
        if (count === 0) fail("oldString was not found in the design HTML.")
        if (count > 1 && input.replaceAll !== true) fail(`oldString matches ${count} places. Add more context or set replaceAll.`)
        const next = input.replaceAll === true ? html.split(oldString).join(newString) : html.replace(oldString, () => newString)
        const saved = await store.save({ id, kind: artifact.kind, title: artifact.title, html: next })
        return report(saved.artifact, false, [`Replaced ${input.replaceAll === true ? count : 1} occurrence(s).`])
      })
    },
    options: { namespace: "canvas" },
  }

  const list = {
    name: "list",
    description: "List the designs in the canvas (id, kind, title, revision, design system, project) and the preview URL, plus the projects (folders) that exist.",
    input: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...KINDS] },
        project: { type: "string", description: 'Only designs in this project (id or name), or "none" for designs outside any project.' },
      },
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        await store.init()
        const input = raw as Input
        const kind = oneOf(input, "kind", KINDS)
        const ref = str(input, "project")
        const folder = ref && ref !== "none" ? (store.findProject(ref) ?? fail(`No project "${ref}".`)) : undefined
        const items = store.list(kind).filter((a) => (ref === "none" ? !a.project : !folder || a.project === folder.id))
        const url = await runtime.urlFor()
        const projects = store.projects()
        const header = projects.length ? [`Projects: ${projects.map((p) => `${p.name} (${p.id})`).join(", ")}.`] : []
        if (!items.length) return { content: [...header, `The canvas is empty${kind || ref ? " for this filter" : ""}.`, `Preview: ${url}`].join("\n") }
        const rows = items.map(
          (a) => `- ${a.id}: ${a.kind}, "${a.title}", v${a.revision}${a.project ? `, project ${a.project}` : ""}${a.variantOf ? `, variation of ${a.variantOf}` : ""}${a.designSystem ? `, uses ${a.designSystem}` : ""}${a.device && a.device !== "responsive" ? `, ${a.device}` : ""}`,
        )
        return { content: [...header, `${items.length} design(s):`, ...rows, `Preview: ${url}`].join("\n") }
      })
    },
    options: { namespace: "canvas" },
  }

  const get = {
    name: "get",
    description:
      "Read a design. Screens and documents return their HTML (so you can edit them). Design systems return their tokens and the class cheat sheet. System designs return their nodes and edges.",
    input: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const id = str(raw as Input, "id", true)!
        await store.init()
        const artifact = store.get(id) ?? fail(`No design with id "${id}". Use canvas_list to see what exists.`)
        const data = artifact.data as { input?: unknown; usage?: string; css?: string } | undefined
        if (artifact.kind === "design-system") {
          return { content: [`${describe(artifact)}`, "", "Tokens:", JSON.stringify(data?.input ?? {}, null, 2), "", data?.usage ?? ""].join("\n") }
        }
        if (artifact.kind === "system-design") {
          return { content: `${describe(artifact)}\n\n${JSON.stringify(artifact.data ?? {}, null, 2)}` }
        }
        const html = (await store.html(id)) ?? fail(`The HTML for "${id}" is missing on disk.`)
        return {
          content: `${describe(artifact)}${artifact.designSystem ? `, design system: ${artifact.designSystem}` : ""}\n\n${html}`,
        }
      })
    },
    options: { namespace: "canvas" },
  }

  const remove = {
    name: "delete",
    description: "Delete a design from the canvas. A design system that other designs still use cannot be deleted.",
    input: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const id = str(raw as Input, "id", true)!
        await store.init()
        const artifact = store.get(id) ?? fail(`No design with id "${id}".`)
        if (artifact.kind === "design-system") {
          const users = store.list().filter((a) => a.designSystem === id)
          if (users.length) fail(`Design system "${id}" is used by: ${users.map((u) => u.id).join(", ")}. Delete or relink those first.`)
        }
        await store.remove(id)
        return { content: `Deleted ${describe(artifact)}.` }
      })
    },
    options: { namespace: "canvas" },
  }

  const open = {
    name: "open",
    description: "Open the canvas in the user's browser (optionally focused on one design) and return its URL. The server starts automatically with any other canvas tool.",
    input: {
      type: "object",
      properties: { id: { type: "string", description: "Design to focus. Omit for the whole canvas." } },
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const id = str(raw as Input, "id")
        await store.init()
        if (id && !store.get(id)) fail(`No design with id "${id}".`)
        const url = await runtime.open(id)
        return { content: `Opened ${url}` }
      })
    },
    options: { namespace: "canvas" },
  }

  const formatComment = (c: Comment) => {
    const design = store.get(c.designId)
    const lines = [`- ${c.id} [${c.status}] on ${c.designId}${design ? ` (v${design.revision})` : ""}`]
    if (c.anchor) lines.push(`  element: ${c.anchor.label}`, `  selector: ${c.anchor.selector}`)
    for (const m of c.messages) lines.push(`  ${m.role === "user" ? "user" : "agent"}: ${m.text.replace(/\n/g, "\n    ")}`)
    return lines.join("\n")
  }

  const comments = {
    name: "comments",
    description:
      "List comments the user left on designs from the canvas preview (they click an element and describe a change). Each comment has the target element's selector and a thread of messages. " +
      "Defaults to open comments. Use it to catch up on pending feedback, then fix each one and answer with canvas_reply.",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "Only comments on this design." },
        status: { type: "string", enum: ["open", "resolved", "all"], description: "Default: open." },
      },
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        await runtime.comments.init()
        const input = raw as Input
        const status = oneOf(input, "status", ["open", "resolved", "all"] as const) ?? "open"
        const items = runtime.comments.list({
          designId: str(input, "id"),
          status: status === "all" ? undefined : status,
        })
        if (!items.length) return { content: `No ${status === "all" ? "" : status + " "}comments.` }
        return { content: [`${items.length} comment(s):`, ...items.map(formatComment)].join("\n") }
      })
    },
    options: { namespace: "canvas" },
  }

  const reply = {
    name: "reply",
    description:
      "Answer a canvas comment. The reply appears in the comment thread in the browser. Set resolve to true once the requested change is made. " +
      "Say briefly what you changed, or ask a question if the request is unclear (then leave it open).",
    input: {
      type: "object",
      properties: {
        commentId: { type: "string" },
        text: { type: "string" },
        resolve: { type: "boolean", description: "Mark the comment resolved. Default: false." },
      },
      required: ["commentId", "text"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const commentId = str(input, "commentId", true)!
        const text = str(input, "text", true)!
        await runtime.comments.init()
        if (!runtime.comments.get(commentId)) {
          fail(`No comment with id "${commentId}". Use canvas_comments to list them.`)
        }
        await runtime.comments.addMessage(commentId, "agent", text)
        if (input.resolve === true) await runtime.comments.setStatus(commentId, "resolved")
        return { content: `Replied to ${commentId}${input.resolve === true ? " and resolved it" : ""}.` }
      })
    },
    options: { namespace: "canvas" },
  }

  const history = {
    name: "history",
    description:
      "List the saved versions of a design (revision, time, who made the change: the agent, a direct edit in the canvas, or a restore). " +
      "The user can also browse and restore versions in the canvas. Use canvas_restore to go back to one.",
    input: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const id = str(raw as Input, "id", true)!
        await store.init()
        const artifact = store.get(id) ?? fail(`No design with id "${id}". Use canvas_list to see what exists.`)
        const versions = await store.history(id)
        if (!versions.length) return { content: `${describe(artifact)} has no saved versions yet.` }
        const rows = versions.map((v) => `- v${v.revision}${v.revision === artifact.revision ? " (current)" : ""}: ${v.source}, ${new Date(v.at).toISOString()}`)
        return { content: [`${versions.length} version(s) of "${artifact.title}":`, ...rows].join("\n") }
      })
    },
    options: { namespace: "canvas" },
  }

  const restore = {
    name: "restore",
    description:
      "Restore an earlier version of a design. The restored content becomes a new revision, so nothing is lost and the restore can be undone. " +
      "Use canvas_history to see the available versions.",
    input: {
      type: "object",
      properties: { id: { type: "string" }, revision: { type: "number", description: "Revision number to restore, for example 3." } },
      required: ["id", "revision"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const id = str(input, "id", true)!
        const revision = typeof input.revision === "number" && Number.isInteger(input.revision) && input.revision > 0 ? input.revision : fail('"revision" must be a positive integer.')
        await store.init()
        store.get(id) ?? fail(`No design with id "${id}". Use canvas_list to see what exists.`)
        const artifact = await store.restore(id, revision)
        return report(artifact, false, [`Restored the content of v${revision}.`])
      })
    },
    options: { namespace: "canvas" },
  }

  const variations = {
    name: "variations",
    description:
      "Create 2-4 alternative versions of a screen side by side so the user can compare them in the canvas and pick one. Each variation should explore a clearly different direction " +
      "(layout, hierarchy, tone), not a small tweak. The user's pick replaces the design with the chosen id (created if it does not exist) and the other variations are discarded. " +
      "Calling it again with the same id replaces the previous set. Pass `from` to branch off an existing design.",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: 'Id of the final design the pick will produce, e.g. "pricing".' },
        title: { type: "string", description: 'Title of the design, e.g. "Pricing page".' },
        variants: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: 'Short name of the direction, e.g. "Bold hero" or "Comparison table".' },
              html: { type: "string", description: "Full HTML document or body fragment." },
            },
            required: ["label", "html"],
            additionalProperties: false,
          },
        },
        kind: { type: "string", enum: [...FREE_FORM], description: "Default: screen." },
        device: { type: "string", enum: [...DEVICES] },
        designSystem: { type: "string", description: 'Design system id, or "none". Default: the one used by the design, else the most recent.' },
        project: PROJECT_PROP,
      },
      required: ["id", "title", "variants"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const group = str(input, "id", true)!
        const title = str(input, "title", true)!
        const kind = (oneOf(input, "kind", FREE_FORM) ?? "screen") as Kind
        const items = input.variants
        if (!Array.isArray(items) || items.length < 2 || items.length > 4) fail('"variants" needs 2 to 4 items.')
        await store.init()
        store.resolveId({ id: group, kind, title, html: "" })
        const base = store.get(group)
        if (base && base.kind !== kind) fail(`Id "${group}" is already used by a ${base.kind}.`)
        const ds = resolveDesignSystem(input, kind, base)
        const device = oneOf(input, "device", DEVICES) as Device | undefined
        const project = (await resolveProject(input)) ?? base?.project
        const parsed = items.map((entry, i) => {
          const item = entry as Input
          return { label: str(item, "label", true) ?? `Option ${i + 1}`, html: str(item, "html", true)! }
        })
        await store.discard(group)
        const ids: string[] = []
        for (const [i, item] of parsed.entries()) {
          const saved = await store.save({
            id: `${group}-v${i + 1}`,
            kind,
            title: `${title} \u00b7 ${item.label}`,
            html: item.html,
            device: device ?? base?.device,
            designSystem: ds.id,
            variantOf: group,
            variantLabel: item.label,
            project,
          })
          ids.push(saved.artifact.id)
        }
        const url = await runtime.announce(ids[0]!)
        return {
          content: [
            `Created ${parsed.length} variations of "${title}": ${parsed.map((v, i) => `${ids[i]} (${v.label})`).join(", ")}.`,
            "The user compares them side by side in the canvas and picks one; the pick becomes the design with id \"" + group + "\".",
            `Preview: ${url}`,
          ].join("\n"),
          metadata: { id: group, variants: ids, url },
        }
      })
    },
    options: { namespace: "canvas" },
  }

  const project = {
    name: "project",
    description:
      "Organize designs into projects (folders) shown as collapsible groups in the canvas sidebar. Actions: create, rename, delete (designs inside move to \"No project\"; nothing is deleted), " +
      "and move (file existing designs under a project, or out of any project with project \"none\"). Design tools also accept `project` directly.",
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "rename", "delete", "move"] },
        project: { type: "string", description: 'Project id or name. For move, "none" takes the designs out of their project.' },
        name: { type: "string", description: "New name (create, rename)." },
        ids: { type: "array", items: { type: "string" }, description: "Design ids to move." },
      },
      required: ["action"],
      additionalProperties: false,
    },
    async execute(raw: unknown, context?: unknown) {
      runtime.track(context)
      return guard(async () => {
        const input = raw as Input
        const action = oneOf(input, "action", ["create", "rename", "delete", "move"] as const)!
        await store.init()
        const ref = str(input, "project")
        if (action === "create") {
          const name = str(input, "name") ?? ref ?? fail('"name" is required.')
          const p = await store.createProject(name)
          return { content: `Project "${p.name}" (id: ${p.id}) is ready. Pass project: "${p.id}" to design tools, or move designs into it.` }
        }
        if (action === "move") {
          const ids = Array.isArray(input.ids) ? (input.ids as unknown[]).filter((v): v is string => typeof v === "string") : []
          if (!ids.length) fail('"ids" needs at least one design id.')
          const target = !ref || ref === "none" ? undefined : (store.findProject(ref) ?? (await store.createProject(ref)))
          const moved = await store.move(ids, target?.id)
          return { content: `Moved ${moved.join(", ")} ${target ? `to "${target.name}"` : "out of any project"}.` }
        }
        const p = (ref && store.findProject(ref)) || fail(`No project "${ref ?? ""}". Use canvas_list to see projects.`)
        if (action === "rename") {
          const renamed = await store.renameProject(p.id, str(input, "name", true)!)
          return { content: `Renamed project ${p.id} to "${renamed.name}".` }
        }
        const moved = await store.removeProject(p.id)
        return { content: `Deleted project "${p.name}". ${moved} design(s) moved to "No project".` }
      })
    },
    options: { namespace: "canvas" },
  }

  const tools: Info[] = [designSystem, screen, systemDesign, edit, list, get, remove, open, comments, reply, history, restore, variations, project]
  return tools
}

export { prepareDocument }
