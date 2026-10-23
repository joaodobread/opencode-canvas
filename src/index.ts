import { spawn } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { Plugin } from "@opencode/plugin"
import { CommentStore, type Comment, type Message } from "./comments.js"
import { generateToken, startServer, type CanvasServer } from "./server.js"
import { SKILL_CONTENT, SKILL_DESCRIPTION, SKILL_NAME } from "./skill.js"
import { Store } from "./store.js"
import { createTools } from "./tools.js"

function openBrowser(url: string) {
  const [command, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url.replace(/&/g, "^&")]]
        : ["xdg-open", [url]]
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true })
    child.on("error", () => undefined)
    child.unref()
  } catch {
    // no browser available (headless, ssh): the URL is still returned to the user
  }
}

function expand(value: string) {
  return value.startsWith("~") ? path.join(homedir(), value.slice(1)) : value
}

function commentPrompt(comment: Comment, message: Message) {
  const first = comment.messages[0]?.id === message.id
  const lines = [
    first ? "The user left a comment on a design in the canvas preview." : "The user replied in a canvas comment thread.",
    `Comment: ${comment.id}`,
    `Design: ${comment.designId} (v${comment.revision})`,
  ]
  if (comment.anchor) {
    lines.push(`Element: ${comment.anchor.label}`, `Selector: ${comment.anchor.selector}`)
    if (comment.anchor.text) lines.push(`Text: ${comment.anchor.text}`)
    if (comment.anchor.html) lines.push(`HTML: ${comment.anchor.html}`)
  }
  lines.push("", `Request: ${message.text}`, "")
  if (!first) lines.splice(3, 0, ...comment.messages.filter((m) => m.id !== message.id).map((m) => `Earlier ${m.role}: ${m.text}`))
  lines.push(
    "Use canvas_get to read the current design, make a targeted change (canvas_edit for screens, or the matching canvas tool for design systems and diagrams), then call canvas_reply with a short summary and resolve: true. If the request is unclear, reply with a question and leave it open.",
  )
  return lines.join("\n")
}

export default Plugin.define({
  id: "opencode.canvas",
  async setup(ctx) {
    const options = ctx.options
    const dir = path.resolve(
      ctx.location.directory,
      expand(typeof options.dir === "string" ? options.dir : ".opencode/canvas"),
    )
    const autoOpen = options.open !== false
    const store = new Store(dir)
    const comments = new CommentStore(dir, store)
    let activeSession: string | undefined
    let server: Promise<CanvasServer> | undefined
    const shared = globalThis as { __canvasOpened?: Set<string> }
    const opened = (shared.__canvasOpened ??= new Set<string>())

    const ensureServer = () => {
      server ??= startServer(store, comments, {
        port: typeof options.port === "number" ? options.port : 4317,
        host: typeof options.host === "string" ? options.host : "127.0.0.1",
        token: options.token === true ? generateToken() : typeof options.token === "string" ? options.token : undefined,
      }).catch((error) => {
        server = undefined
        throw error
      })
      return server
    }

    const runtime = {
      store,
      comments,
      track(context: unknown) {
        const id = (context as { sessionID?: unknown } | undefined)?.sessionID
        if (typeof id === "string" && id) activeSession = id
      },
      async urlFor(id?: string) {
        return (await ensureServer()).urlFor(id)
      },
      async announce(id: string) {
        const running = await ensureServer()
        const url = running.urlFor(id)
        // the browser opens once per project; later designs update the open tab through live reload
        if (autoOpen && !opened.has(dir) && running.viewers() === 0) {
          opened.add(dir)
          openBrowser(url)
        }
        return url
      },
      async open(id?: string) {
        const running = await ensureServer()
        const url = running.urlFor(id)
        opened.add(dir)
        if (running.viewers() > 0) running.focus(id)
        else openBrowser(url)
        return url
      },
    }

    await store.init()
    await comments.init()

    const findSession = async () => {
      if (activeSession) return activeSession
      try {
        const recent = await ctx.session.list({ directory: ctx.location.directory, limit: 1, order: "desc" } as never)
        const id = (recent as { data?: ReadonlyArray<{ id: string }> }).data?.[0]?.id
        if (id) activeSession = id
      } catch {
        // no session reachable: the comment stays pending in the browser
      }
      return activeSession
    }

    comments.deliver = async (comment: Comment, message: Message) => {
      const sessionID = await findSession()
      if (!sessionID) return false
      await ctx.session.prompt({
        sessionID,
        delivery: "queue",
        text: commentPrompt(comment, message),
      } as never)
      return true
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "canvas",
        description:
          "Design canvas. Create design systems, UI screens, prototypes and system architecture diagrams as HTML and preview them live in the browser.",
      })
      for (const tool of createTools(runtime)) editor.add(tool)
    })

    await ctx.skill.transform((editor) => {
      editor.add({
        id: SKILL_NAME,
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        path: path.join(dir, "SKILL.md"),
        content: SKILL_CONTENT,
        autoinvoke: false,
      } as never)
    })

    await ctx.command.transform((editor) => {
      editor.add({
        name: "canvas",
        description: "Open the design canvas, or design something: /canvas <what to design>",
        execute: async ({ sessionID, prompt, delivery }) => {
          const request = prompt.text.trim()
          if (!request) {
            const url = await runtime.open()
            await ctx.session.synthetic({ sessionID, text: `Canvas is running at ${url}`, delivery })
            return
          }
          await ctx.session.prompt({
            ...prompt,
            sessionID,
            delivery,
            text: `Use the canvas tools (load the "${SKILL_NAME}" skill first) to design the following, and preview it in the browser:\n\n${request}`,
          })
        },
      })
    })

    return async () => {
      store.close()
      if (server) await (await server.catch(() => undefined))?.close()
    }
  },
})
