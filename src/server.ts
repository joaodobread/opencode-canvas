import { randomBytes } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import type { CommentEvent, CommentStatus, CommentStore } from "./comments.js"
import { BOARD_FRAME_JS, INSPECTOR_JS } from "./inspector.js"
import { prepareDocument } from "./render/document.js"
import { isValidId, type Artifact, type ChangeEvent, type Store } from "./store.js"
import { EDITABLE_KINDS, applyEdits, parseOps } from "./edit.js"
import { buildZip, renderPdf } from "./export.js"
import { handoffPrompt } from "./handoff.js"
import { VIEWER_HTML } from "./viewer.js"

export interface CanvasServer {
  readonly url: string
  readonly port: number
  urlFor(id?: string): string
  viewers(): number
  focus(id?: string): void
  close(): Promise<void>
}

export interface ServerOptions {
  port?: number
  host?: string
  /** Require ?token= (or the cookie it sets) on every request. */
  token?: string
  /** Sends a prompt to the agent session. Returns false when no session is reachable. */
  handoff?: (prompt: string) => Promise<boolean>
}

const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = "text/html; charset=utf-8", extra: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": type, ...SECURITY, ...extra })
  res.end(body)
}

function json(res: ServerResponse, status: number, value: unknown) {
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8")
}

function summary(artifact: Artifact) {
  const { data: _data, ...rest } = artifact
  return rest
}

export function generateToken() {
  return randomBytes(12).toString("base64url")
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=")
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim())
  }
  return out
}

const MAX_BODY = 64 * 1024

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new Error("Request body too large.")
    chunks.push(chunk as Buffer)
  }
  if (!size) return {}
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object.")
  return value as Record<string, unknown>
}

export async function startServer(store: Store, comments: CommentStore, options: ServerOptions = {}): Promise<CanvasServer> {
  await store.init()
  await comments.init()
  const host = options.host ?? "127.0.0.1"
  const clients = new Set<ServerResponse>()
  const token = options.token

  const onChange = (event: ChangeEvent | CommentEvent) => {
    const frame = `data: ${JSON.stringify(event)}\n\n`
    for (const client of clients) client.write(frame)
  }
  store.on("change", onChange)
  comments.on("change", onChange)
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": ping\n\n")
  }, 20_000)
  heartbeat.unref?.()

  const allowedHosts = new Set<string>()

  const authorized = (req: IncomingMessage, url: URL): { ok: boolean; setCookie?: string } => {
    if (!token) return { ok: true }
    if (url.searchParams.get("token") === token) {
      return { ok: true, setCookie: `canvas_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict` }
    }
    return { ok: parseCookies(req.headers.cookie).canvas_token === token }
  }

  const designSystemCss = async (artifact: Artifact): Promise<string | undefined> => {
    if (!artifact.designSystem) return undefined
    const ds = store.get(artifact.designSystem)
    if (!ds || ds.kind !== "design-system") return undefined
    return readCss(ds.id)
  }
  const readCss = async (id: string): Promise<string | undefined> => {
    const html = await store.html(id)
    if (!html) return undefined
    return /<style[^>]*data-design-system[^>]*>([\s\S]*?)<\/style>/i.exec(html)?.[1]
  }

  const writeApi = async (req: IncomingMessage, res: ServerResponse, method: string, path: string) => {
    let body: Record<string, unknown>
    try {
      body = method === "POST" ? await readJson(req) : {}
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "Bad request" })
    }
    const text = typeof body.text === "string" ? body.text : ""
    const origin = typeof body.origin === "string" ? body.origin.slice(0, 40) : undefined
    try {
      if (path === "/api/projects" && method === "POST") {
        const name = typeof body.name === "string" ? body.name : ""
        return json(res, 201, { project: await store.createProject(name) })
      }
      const folder = /^\/api\/projects\/([a-z0-9-]+)$/.exec(path)
      if (folder) {
        if (method === "DELETE") return json(res, 200, { moved: await store.removeProject(folder[1]!) })
        const name = typeof body.name === "string" ? body.name : ""
        return json(res, 200, { project: await store.renameProject(folder[1]!, name) })
      }
      if (path === "/api/move" && method === "POST") {
        const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === "string").slice(0, 200) : []
        const project = typeof body.project === "string" && body.project ? body.project : undefined
        return json(res, 200, { moved: await store.move(ids, project) })
      }
      const impl = /^\/api\/handoff\/([a-z0-9-]+)$/.exec(path)
      if (impl) {
        if (method !== "POST") return json(res, 405, { error: "Method not allowed" })
        const artifact = store.get(impl[1]!)
        if (!artifact) return json(res, 404, { error: `No design with id "${impl[1]}".` })
        if (!(EDITABLE_KINDS as readonly string[]).includes(artifact.kind)) {
          return json(res, 400, { error: `${artifact.kind} designs cannot be handed off. Pick a screen, component, prototype or document.` })
        }
        const html = await store.html(artifact.id)
        if (html === undefined) return json(res, 404, { error: "The HTML for this design is missing on disk." })
        const ds = artifact.designSystem ? store.get(artifact.designSystem) : undefined
        const usage = (ds?.data as { usage?: string } | undefined)?.usage
        const prompt = handoffPrompt({
          artifact,
          html,
          designSystem: ds && ds.kind === "design-system" ? { id: ds.id, title: ds.title, usage } : undefined,
          note: text.trim().slice(0, 2000) || undefined,
        })
        const sent = (await options.handoff?.(prompt)) ?? false
        return json(res, sent ? 200 : 409, sent ? { sent: true } : { error: "No agent session is reachable. Send a message in OpenCode first, then try again." })
      }
      const group = /^\/api\/variations\/([a-z0-9-]+)\/(pick|discard)$/.exec(path)
      if (group) {
        if (method !== "POST") return json(res, 405, { error: "Method not allowed" })
        if (group[2] === "discard") return json(res, 200, { removed: await store.discard(group[1]!) })
        const pick = typeof body.id === "string" ? body.id : ""
        return json(res, 200, { artifact: summary(await store.pick(group[1]!, pick, origin)) })
      }
      const design = /^\/api\/(edit|restore)\/([a-z0-9-]+)$/.exec(path)
      if (design) {
        if (method !== "POST") return json(res, 405, { error: "Method not allowed" })
        const id = design[2]!
        const artifact = store.get(id)
        if (!artifact) return json(res, 404, { error: `No design with id "${id}".` })
        if (design[1] === "restore") {
          const revision = Number(body.revision)
          if (!Number.isInteger(revision) || revision < 1) return json(res, 400, { error: "revision must be a positive integer." })
          return json(res, 200, { artifact: summary(await store.restore(id, revision, origin)) })
        }
        if (!(EDITABLE_KINDS as readonly string[]).includes(artifact.kind)) {
          return json(res, 400, { error: `${artifact.kind} designs are generated and cannot be edited by hand.` })
        }
        const html = await store.html(id)
        if (html === undefined) return json(res, 404, { error: "The HTML for this design is missing on disk." })
        const next = applyEdits(html, parseOps(body.ops))
        if (next === html) return json(res, 200, { artifact: summary(artifact), unchanged: true })
        const saved = await store.save({ id, kind: artifact.kind, title: artifact.title, html: next, source: "edit", origin })
        return json(res, 200, { artifact: summary(saved.artifact) })
      }
      if (method === "POST" && path === "/api/comments") {
        const designId = typeof body.designId === "string" ? body.designId : ""
        const created = await comments.create({ designId, text, anchor: body.anchor })
        return json(res, 201, { comment: await comments.dispatch(created.id) })
      }
      const match = /^\/api\/comments\/([a-z0-9-]+)(?:\/(messages|status|retry))?$/.exec(path)
      if (!match) return json(res, 404, { error: "Not found" })
      const id = match[1]!
      const action = match[2]
      if (method === "DELETE" && !action) return json(res, 200, { removed: await comments.remove(id) })
      if (method !== "POST") return json(res, 405, { error: "Method not allowed" })
      if (action === "messages") {
        await comments.addMessage(id, "user", text)
        return json(res, 200, { comment: await comments.dispatch(id) })
      }
      if (action === "status") {
        const status = body.status
        if (status !== "open" && status !== "resolved") return json(res, 400, { error: "status must be open or resolved" })
        return json(res, 200, { comment: await comments.setStatus(id, status as CommentStatus) })
      }
      if (action === "retry") return json(res, 200, { comment: await comments.dispatch(id) })
      return json(res, 404, { error: "Not found" })
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const hostHeader = (req.headers.host ?? "").toLowerCase()
    if (allowedHosts.size && !allowedHosts.has(hostHeader)) return send(res, 403, "Forbidden host", "text/plain")
    const method = req.method ?? "GET"
    const writing = method === "POST" || method === "DELETE"
    if (method !== "GET" && method !== "HEAD" && !writing) return send(res, 405, "Method not allowed", "text/plain")

    const url = new URL(req.url ?? "/", `http://${hostHeader || "localhost"}`)
    const auth = authorized(req, url)
    if (!auth.ok) return send(res, 401, "Unauthorized. Open the URL printed by the canvas tool (it includes ?token=...).", "text/plain")
    const cookie: Record<string, string> = auth.setCookie ? { "set-cookie": auth.setCookie } : {}
    const path = url.pathname

    if (writing) {
      // previews run in an opaque origin, so their scripts can neither send this header nor a matching Origin
      const origin = req.headers.origin
      if ((origin && origin !== `http://${hostHeader}`) || req.headers["x-canvas"] !== "1") {
        return send(res, 403, "Forbidden", "text/plain")
      }
      return writeApi(req, res, method, path)
    }

    if (path === "/api/comments") {
      const design = url.searchParams.get("design") ?? undefined
      return json(res, 200, { comments: comments.list({ designId: design }) })
    }

    if (path === "/" || path === "/index.html") return send(res, 200, VIEWER_HTML, "text/html; charset=utf-8", cookie)

    const versions = /^\/api\/history\/([a-z0-9-]+)$/.exec(path)
    if (versions) return json(res, 200, { versions: await store.history(versions[1]!) })

    if (path === "/api/artifacts") return json(res, 200, { artifacts: store.list().map(summary), projects: store.projects() })

    if (path === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        ...SECURITY,
      })
      res.write("retry: 1500\n\n")
      clients.add(res)
      req.on("close", () => clients.delete(res))
      return
    }

    if (path === "/zip") {
      const only = url.searchParams.get("design")
      const folder = url.searchParams.get("project")
      const targets = store.list().filter((a) => !a.variantOf && (!only || a.id === only) && (!folder || a.project === folder))
      if (!targets.length) return send(res, 404, "Nothing to export", "text/plain")
      const files: { name: string; data: string }[] = []
      for (const artifact of targets) {
        const html = await store.html(artifact.id)
        if (html === undefined) continue
        const css = await designSystemCss(artifact)
        files.push({ name: `${artifact.id}.html`, data: prepareDocument(html, { title: artifact.title, designSystemCss: css }) })
      }
      const manifest = targets.map((a) => `- ${a.id}.html: ${a.kind}, ${a.title}`).join("\n")
      files.push({ name: "README.txt", data: `Exported from OpenCode Canvas\n\n${manifest}\n` })
      const name = only ?? folder ?? "canvas-designs"
      return send(res, 200, buildZip(files), "application/zip", {
        "content-disposition": `attachment; filename="${name}.zip"`,
        ...cookie,
      })
    }

    const pdf = /^\/pdf\/([^/]+)$/.exec(path)
    if (pdf) {
      const id = decodeURIComponent(pdf[1]!)
      const artifact = isValidId(id) ? store.get(id) : undefined
      const html = artifact ? await store.html(id) : undefined
      if (!artifact || html === undefined) return send(res, 404, "Not found", "text/plain")
      try {
        const css = await designSystemCss(artifact)
        const page = prepareDocument(html, { title: artifact.title, designSystemCss: css })
        const data = await renderPdf(page, artifact.device)
        return send(res, 200, data, "application/pdf", { "content-disposition": `attachment; filename="${artifact.id}.pdf"`, ...cookie })
      } catch (error) {
        return send(res, 500, error instanceof Error ? error.message : String(error), "text/plain")
      }
    }

    const match = /^\/(view|export|raw)\/([^/]+)$/.exec(path)
    if (match) {
      const id = decodeURIComponent(match[2]!)
      const artifact = isValidId(id) ? store.get(id) : undefined
      const rev = Number(url.searchParams.get("rev"))
      const html = artifact ? (rev > 0 ? await store.versionHtml(id, rev) : await store.html(id)) : undefined
      if (!artifact || html === undefined) return send(res, 404, "Not found", "text/plain")
      const kind = match[1]
      if (kind === "raw") return send(res, 200, html, "text/plain; charset=utf-8")
      const query = token ? `?token=${encodeURIComponent(token)}` : ""
      if (kind === "export") {
        const css = await designSystemCss(artifact)
        const page = prepareDocument(html, { title: artifact.title, designSystemCss: css })
        return send(res, 200, page, "text/html; charset=utf-8", {
          "content-disposition": `attachment; filename="${artifact.id}.html"`,
          ...cookie,
        })
      }
      const page = prepareDocument(html, {
        title: artifact.title,
        bodyEnd:
          url.searchParams.get("inspect") === "1"
            ? `<script data-canvas-ui>${INSPECTOR_JS}</script>`
            : url.searchParams.get("board") === "1"
              ? `<script data-canvas-ui>${BOARD_FRAME_JS}</script>`
              : undefined,
        designSystemHref: artifact.designSystem && store.get(artifact.designSystem) ? `/ds/${encodeURIComponent(artifact.designSystem)}.css${query}` : undefined,
      })
      return send(res, 200, page, "text/html; charset=utf-8", cookie)
    }

    const css = /^\/ds\/([^/]+)\.css$/.exec(path)
    if (css) {
      const id = decodeURIComponent(css[1]!)
      const value = isValidId(id) ? await readCss(id) : undefined
      if (value === undefined) return send(res, 404, "/* design system not found */", "text/css; charset=utf-8")
      return send(res, 200, value, "text/css; charset=utf-8")
    }

    if (path === "/favicon.ico") return send(res, 204, "", "image/x-icon")
    return send(res, 404, "Not found", "text/plain")
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) send(res, 500, `Server error: ${error instanceof Error ? error.message : String(error)}`, "text/plain")
      else res.end()
    })
  })

  const listen = (port: number) =>
    new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error)
      server.once("error", onError)
      server.listen(port, host, () => {
        server.off("error", onError)
        resolve()
      })
    })

  const preferred = options.port ?? 4317
  try {
    await listen(preferred)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error
    await listen(0)
  }

  const port = (server.address() as AddressInfo).port
  for (const name of [`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) allowedHosts.add(name)
  const base = `http://${host === "0.0.0.0" || host === "::" ? "localhost" : host}:${port}`
  const suffix = token ? `?token=${encodeURIComponent(token)}` : ""

  return {
    url: `${base}/${suffix}`,
    port,
    urlFor(id) {
      return id ? `${base}/${suffix}#${encodeURIComponent(id)}` : `${base}/${suffix}`
    },
    viewers() {
      return clients.size
    },
    focus(id) {
      const frame = `data: ${JSON.stringify({ type: "focus", id })}\n\n`
      for (const client of clients) client.write(frame)
    },
    close() {
      clearInterval(heartbeat)
      store.off("change", onChange)
      comments.off("change", onChange)
      for (const client of clients) client.end()
      clients.clear()
      return new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections?.()
      })
    },
  }
}
