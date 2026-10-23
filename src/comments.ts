import { EventEmitter } from "node:events"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomBytes } from "node:crypto"
import type { Store } from "./store.js"

export interface Anchor {
  /** CSS selector path to the element, resolved inside the design document. */
  selector: string
  tag: string
  /** Short description such as `button.btn.btn-primary`. */
  label: string
  /** Visible text of the element (truncated). */
  text?: string
  /** Outer HTML of the element (truncated). */
  html?: string
}

export interface Message {
  id: string
  role: "user" | "agent"
  text: string
  at: number
  /** User messages only: whether the agent session received it. */
  delivered?: boolean
}

export type CommentStatus = "open" | "resolved"
export type Delivery = "pending" | "sent" | "failed"

export interface Comment {
  id: string
  designId: string
  /** Design revision the comment was written against. */
  revision: number
  anchor?: Anchor
  messages: Message[]
  status: CommentStatus
  delivery: Delivery
  error?: string
  createdAt: number
  updatedAt: number
}

export interface CommentEvent {
  type: "comment"
  id: string
  designId: string
}

export type Deliver = (comment: Comment, message: Message) => Promise<boolean>

const MAX_TEXT = 4000

function rid(prefix: string) {
  return `${prefix}-${randomBytes(4).toString("hex")}`
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

export function cleanAnchor(value: unknown): Anchor | undefined {
  if (!value || typeof value !== "object") return undefined
  const raw = value as Record<string, unknown>
  const selector = clip(raw.selector, 500)
  if (!selector) return undefined
  return {
    selector,
    tag: clip(raw.tag, 40) ?? "element",
    label: clip(raw.label, 160) ?? clip(raw.tag, 40) ?? "element",
    text: clip(raw.text, 160),
    html: clip(raw.html, 800),
  }
}

export class CommentStore extends EventEmitter {
  private comments = new Map<string, Comment>()
  private starting?: Promise<void>
  private queue: Promise<unknown> = Promise.resolve()
  /** Set by the plugin: hands a user message to the agent session. */
  deliver?: Deliver

  constructor(
    readonly dir: string,
    private readonly designs: Store,
  ) {
    super()
  }

  init(): Promise<void> {
    this.starting ??= this.load()
    return this.starting
  }

  private get file() {
    return path.join(this.dir, "comments.json")
  }

  private async load() {
    await mkdir(this.dir, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as { comments?: Comment[] }
      for (const comment of parsed.comments ?? []) {
        if (comment?.id && comment.designId && Array.isArray(comment.messages)) this.comments.set(comment.id, comment)
      }
    } catch {
      // first run or unreadable file
    }
    await this.init2()
  }

  private async init2() {
    this.designs.on("change", (event: { type: string; id: string }) => {
      if (event.type !== "remove") return
      const doomed = [...this.comments.values()].filter((c) => c.designId === event.id)
      if (!doomed.length) return
      for (const comment of doomed) this.comments.delete(comment.id)
      void this.persist().then(() => this.emitChange(event.id, ""))
    })
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job)
    this.queue = run.catch(() => undefined)
    return run
  }

  private persist() {
    return this.enqueue(async () => {
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, JSON.stringify({ version: 1, comments: [...this.comments.values()] }, null, 2))
      await rename(tmp, this.file)
    })
  }

  private emitChange(designId: string, id: string) {
    const event: CommentEvent = { type: "comment", id: id || designId, designId }
    this.emit("change", event)
  }

  list(filter: { designId?: string; status?: CommentStatus } = {}): Comment[] {
    return [...this.comments.values()]
      .filter((c) => (!filter.designId || c.designId === filter.designId) && (!filter.status || c.status === filter.status))
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  get(id: string): Comment | undefined {
    return this.comments.get(id)
  }

  openCount(designId: string): number {
    return this.list({ designId, status: "open" }).length
  }

  async create(input: { designId: string; text: string; anchor?: unknown }): Promise<Comment> {
    await this.init()
    const design = this.designs.get(input.designId)
    if (!design) throw new Error(`No design with id "${input.designId}".`)
    const text = clip(input.text, MAX_TEXT)
    if (!text) throw new Error("Write a comment first.")
    const now = Date.now()
    const comment: Comment = {
      id: rid("c"),
      designId: design.id,
      revision: design.revision,
      anchor: cleanAnchor(input.anchor),
      messages: [{ id: rid("m"), role: "user", text, at: now, delivered: false }],
      status: "open",
      delivery: "pending",
      createdAt: now,
      updatedAt: now,
    }
    this.comments.set(comment.id, comment)
    await this.persist()
    this.emitChange(comment.designId, comment.id)
    return comment
  }

  async addMessage(id: string, role: Message["role"], rawText: string): Promise<{ comment: Comment; message: Message }> {
    await this.init()
    const comment = this.comments.get(id)
    if (!comment) throw new Error(`No comment with id "${id}".`)
    const text = clip(rawText, MAX_TEXT)
    if (!text) throw new Error("Message is empty.")
    const message: Message = { id: rid("m"), role, text, at: Date.now(), ...(role === "user" ? { delivered: false } : {}) }
    comment.messages.push(message)
    comment.updatedAt = message.at
    if (role === "user") {
      comment.delivery = "pending"
      comment.error = undefined
      if (comment.status === "resolved") comment.status = "open"
    }
    await this.persist()
    this.emitChange(comment.designId, comment.id)
    return { comment, message }
  }

  async setStatus(id: string, status: CommentStatus): Promise<Comment> {
    await this.init()
    const comment = this.comments.get(id)
    if (!comment) throw new Error(`No comment with id "${id}".`)
    comment.status = status
    comment.updatedAt = Date.now()
    await this.persist()
    this.emitChange(comment.designId, comment.id)
    return comment
  }

  async remove(id: string): Promise<boolean> {
    await this.init()
    const comment = this.comments.get(id)
    if (!comment) return false
    this.comments.delete(id)
    await this.persist()
    this.emitChange(comment.designId, id)
    return true
  }

  /** Sends every undelivered user message of the comment to the agent, oldest first. */
  async dispatch(id: string): Promise<Comment> {
    await this.init()
    const comment = this.comments.get(id)
    if (!comment) throw new Error(`No comment with id "${id}".`)
    const waiting = comment.messages.filter((m) => m.role === "user" && !m.delivered)
    if (!waiting.length) {
      comment.delivery = "sent"
      return comment
    }
    try {
      for (const message of waiting) {
        const ok = (await this.deliver?.(comment, message)) ?? false
        if (!ok) {
          comment.delivery = "pending"
          comment.error = "No active OpenCode session to receive this yet."
          break
        }
        message.delivered = true
        comment.delivery = "sent"
        comment.error = undefined
      }
    } catch (error) {
      comment.delivery = "failed"
      comment.error = error instanceof Error ? error.message : String(error)
    }
    comment.updatedAt = Date.now()
    await this.persist()
    this.emitChange(comment.designId, comment.id)
    return comment
  }
}
