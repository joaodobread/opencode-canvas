import { EventEmitter } from "node:events"
import { watch, type FSWatcher } from "node:fs"
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

export const KINDS = ["design-system", "screen", "component", "prototype", "system-design", "document"] as const
export type Kind = (typeof KINDS)[number]

export const DEVICES = ["responsive", "desktop", "tablet", "mobile"] as const
export type Device = (typeof DEVICES)[number]

export interface Artifact {
  id: string
  kind: Kind
  title: string
  description?: string
  device?: Device
  /** Id of a design-system artifact whose CSS is injected when the artifact is viewed. */
  designSystem?: string
  /** Structured source for generated artifacts (design tokens, system graph). */
  data?: unknown
  /** Group id when this design is one of several variations of the same screen. */
  variantOf?: string
  variantLabel?: string
  /** Id of the project (folder) this design belongs to. */
  project?: string
  createdAt: number
  updatedAt: number
  revision: number
}

export interface Project {
  id: string
  name: string
  createdAt: number
}

export interface ChangeEvent {
  type: "upsert" | "remove" | "touch" | "projects"
  id: string
  focus?: boolean
  revision?: number
  variantOf?: string
  /** Who made the change: "agent", "edit" (direct edit in the canvas), "restore" or "external". */
  source?: string
  /** Id of the browser tab that made the change, so that tab can skip reloading its own edits. */
  origin?: string
}

export interface Version {
  revision: number
  at: number
  source: string
  title: string
}

interface Snapshot extends Version {
  html: string
  description?: string
  device?: Device
  designSystem?: string
  data?: unknown
}

const HISTORY_LIMIT = 60

export interface SaveInput {
  id?: string
  kind: Kind
  title: string
  html: string
  description?: string
  device?: Device
  designSystem?: string
  data?: unknown
  source?: string
  origin?: string
  variantOf?: string
  variantLabel?: string
  project?: string
}

const MAX_HTML_BYTES = 4 * 1024 * 1024

export function slug(input: string): string {
  const value = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return value || "untitled"
}

export function isValidId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,59}$/.test(id)
}

export class Store extends EventEmitter {
  private artifacts = new Map<string, Artifact>()
  private folders = new Map<string, Project>()
  private starting?: Promise<void>
  private queue: Promise<unknown> = Promise.resolve()
  private watcher?: FSWatcher
  private written = new Map<string, string | null>()
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(readonly dir: string) {
    super()
  }

  init(): Promise<void> {
    this.starting ??= this.load()
    return this.starting
  }

  close() {
    this.watcher?.close()
    this.watcher = undefined
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  private get indexFile() {
    return path.join(this.dir, "index.json")
  }

  htmlFile(id: string) {
    return path.join(this.dir, `${id}.html`)
  }

  private historyDir(id: string) {
    return path.join(this.dir, ".history", id)
  }

  private async snapshot(artifact: Artifact, html: string, source: string) {
    const dir = this.historyDir(artifact.id)
    await mkdir(dir, { recursive: true })
    const entry: Snapshot = {
      revision: artifact.revision,
      at: artifact.updatedAt,
      source,
      title: artifact.title,
      html,
      description: artifact.description,
      device: artifact.device,
      designSystem: artifact.designSystem,
      data: artifact.data,
    }
    await writeFile(path.join(dir, `${artifact.revision}.json`), JSON.stringify(entry))
    const revisions = await this.revisions(artifact.id)
    for (const old of revisions.slice(HISTORY_LIMIT)) await rm(path.join(dir, `${old}.json`), { force: true })
  }

  private async revisions(id: string): Promise<number[]> {
    const names = await readdir(this.historyDir(id)).catch(() => [] as string[])
    return names
      .filter((name) => /^\d+\.json$/.test(name))
      .map((name) => Number.parseInt(name, 10))
      .sort((a, b) => b - a)
  }

  private async readSnapshot(id: string, revision: number): Promise<Snapshot | undefined> {
    try {
      return JSON.parse(await readFile(path.join(this.historyDir(id), `${revision}.json`), "utf8")) as Snapshot
    } catch {
      return undefined
    }
  }

  async history(id: string): Promise<Version[]> {
    await this.init()
    if (!this.artifacts.has(id)) return []
    const out: Version[] = []
    for (const revision of await this.revisions(id)) {
      const entry = await this.readSnapshot(id, revision)
      if (entry) out.push({ revision: entry.revision, at: entry.at, source: entry.source, title: entry.title })
    }
    return out
  }

  async versionHtml(id: string, revision: number): Promise<string | undefined> {
    await this.init()
    if (!this.artifacts.has(id)) return undefined
    if (this.artifacts.get(id)!.revision === revision) return this.html(id)
    return (await this.readSnapshot(id, revision))?.html
  }

  async restore(id: string, revision: number, origin?: string): Promise<Artifact> {
    await this.init()
    const existing = this.artifacts.get(id)
    if (!existing) throw new Error(`No design with id "${id}".`)
    const entry = await this.readSnapshot(id, revision)
    if (!entry) throw new Error(`Version v${revision} of "${id}" is not in the history.`)
    const saved = await this.save({
      id,
      kind: existing.kind,
      title: entry.title,
      html: entry.html,
      description: entry.description,
      device: entry.device,
      designSystem: entry.designSystem,
      data: entry.data,
      source: `restore v${revision}`,
      origin,
    })
    return saved.artifact
  }

  private async load() {
    await mkdir(this.dir, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.indexFile, "utf8")) as { artifacts?: Artifact[]; projects?: Project[] }
      for (const project of parsed.projects ?? []) {
        if (project && isValidId(project.id)) this.folders.set(project.id, project)
      }
      for (const artifact of parsed.artifacts ?? []) {
        if (!artifact || !isValidId(artifact.id)) continue
        if (artifact.project && !this.folders.has(artifact.project)) delete artifact.project
        this.artifacts.set(artifact.id, artifact)
      }
    } catch {
      // first run or unreadable index: rebuild from the html files below
    }
    await this.adoptOrphans()
    this.startWatching()
  }

  private async adoptOrphans() {
    let changed = false
    for (const name of await readdir(this.dir).catch(() => [] as string[])) {
      if (!name.endsWith(".html")) continue
      const id = name.slice(0, -5)
      if (!isValidId(id) || this.artifacts.has(id)) continue
      const html = await readFile(path.join(this.dir, name), "utf8").catch(() => undefined)
      if (html === undefined) continue
      this.artifacts.set(id, this.adopted(id, html))
      changed = true
    }
    for (const artifact of [...this.artifacts.values()]) {
      const exists = await readFile(this.htmlFile(artifact.id)).then(
        () => true,
        () => false,
      )
      if (!exists) {
        this.artifacts.delete(artifact.id)
        changed = true
      }
    }
    if (changed) await this.persistIndex()
  }

  private adopted(id: string, html: string): Artifact {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim()
    const now = Date.now()
    return { id, kind: "screen", title: title || id, createdAt: now, updatedAt: now, revision: 1 }
  }

  private startWatching() {
    try {
      this.watcher = watch(this.dir, (_event, filename) => {
        if (!filename || !filename.endsWith(".html")) return
        const id = filename.slice(0, -5)
        if (!isValidId(id)) return
        clearTimeout(this.timers.get(id))
        this.timers.set(
          id,
          setTimeout(() => {
            this.timers.delete(id)
            void this.onExternalChange(id)
          }, 120),
        )
      })
      this.watcher.on("error", () => undefined)
    } catch {
      // watching is best effort
    }
  }

  private async onExternalChange(id: string) {
    const html = await readFile(this.htmlFile(id), "utf8").catch(() => undefined)
    // our own writes echo back through the watcher; only react when the disk differs from what we last wrote
    if (this.written.has(id) && this.written.get(id) === (html ?? null)) return
    this.written.delete(id)
    const existing = this.artifacts.get(id)
    if (html === undefined) {
      if (!existing) return
      this.artifacts.delete(id)
      await this.enqueue(() => this.persistIndex())
      this.emitChange({ type: "remove", id })
      return
    }
    if (!existing) {
      this.artifacts.set(id, this.adopted(id, html))
      await this.enqueue(() => this.persistIndex())
      this.emitChange({ type: "upsert", id, focus: true })
      return
    }
    existing.updatedAt = Date.now()
    existing.revision += 1
    await this.enqueue(async () => {
      await this.persistIndex()
      await this.snapshot(existing, html, "external").catch(() => undefined)
    })
    this.emitChange({ type: "touch", id, focus: true, source: "external", revision: existing.revision })
  }

  private emitChange(event: ChangeEvent) {
    this.emit("change", event)
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async persistIndex() {
    const tmp = `${this.indexFile}.tmp`
    const body = JSON.stringify({ version: 1, projects: this.projects(), artifacts: [...this.artifacts.values()] }, null, 2)
    await writeFile(tmp, body)
    await rename(tmp, this.indexFile)
  }

  list(kind?: Kind): Artifact[] {
    return [...this.artifacts.values()]
      .filter((artifact) => !kind || artifact.kind === kind)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  get(id: string): Artifact | undefined {
    return this.artifacts.get(id)
  }

  async html(id: string): Promise<string | undefined> {
    if (!this.artifacts.has(id)) return undefined
    return readFile(this.htmlFile(id), "utf8").catch(() => undefined)
  }

  resolveId(input: SaveInput): string {
    if (input.id !== undefined) {
      if (!isValidId(input.id)) {
        throw new Error(`Invalid id "${input.id}". Use lowercase letters, digits and dashes (max 60 chars).`)
      }
      return input.id
    }
    const base = slug(input.title)
    let candidate = base
    for (let n = 2; ; n++) {
      const existing = this.artifacts.get(candidate)
      if (!existing || existing.kind === input.kind) return candidate
      candidate = `${base}-${n}`
    }
  }

  async save(input: SaveInput): Promise<{ artifact: Artifact; created: boolean }> {
    await this.init()
    if (Buffer.byteLength(input.html) > MAX_HTML_BYTES) throw new Error("HTML is larger than 4 MB.")
    const id = this.resolveId(input)
    const existing = this.artifacts.get(id)
    if (existing && existing.kind !== input.kind) {
      throw new Error(`Id "${id}" is already used by a ${existing.kind}. Pick another id.`)
    }
    const project = input.project === "" ? undefined : (input.project ?? existing?.project)
    if (project && !this.folders.has(project)) throw new Error(`No project with id "${project}".`)
    const now = Date.now()
    const artifact: Artifact = {
      id,
      kind: input.kind,
      project,
      title: input.title,
      description: input.description ?? existing?.description,
      device: input.device ?? existing?.device,
      designSystem: input.designSystem ?? existing?.designSystem,
      data: input.data ?? existing?.data,
      variantOf: input.variantOf ?? existing?.variantOf,
      variantLabel: input.variantLabel ?? existing?.variantLabel,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      revision: (existing?.revision ?? 0) + 1,
    }
    const source = input.source ?? "agent"
    await this.enqueue(async () => {
      if (existing) {
        const known = await access(path.join(this.historyDir(id), `${existing.revision}.json`)).then(
          () => true,
          () => false,
        )
        if (!known) {
          const previous = await readFile(this.htmlFile(id), "utf8").catch(() => undefined)
          if (previous !== undefined) await this.snapshot(existing, previous, "earlier").catch(() => undefined)
        }
      }
      this.written.set(id, input.html)
      await writeFile(this.htmlFile(id), input.html)
      this.artifacts.set(id, artifact)
      await this.persistIndex()
      await this.snapshot(artifact, input.html, source).catch(() => undefined)
    })
    this.emitChange({ type: "upsert", id, focus: true, source, origin: input.origin, revision: artifact.revision, variantOf: artifact.variantOf })
    return { artifact, created: !existing }
  }

  variants(group: string): Artifact[] {
    return this.list()
      .filter((artifact) => artifact.variantOf === group)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }

  async pick(group: string, id: string, origin?: string): Promise<Artifact> {
    await this.init()
    const chosen = this.artifacts.get(id)
    if (!chosen || chosen.variantOf !== group) throw new Error(`"${id}" is not a variation of "${group}".`)
    const html = await this.html(id)
    if (html === undefined) throw new Error("The HTML for this variation is missing on disk.")
    const base = this.artifacts.get(group)
    if (base && base.kind !== chosen.kind) throw new Error(`Id "${group}" is already used by a ${base.kind}.`)
    const saved = await this.save({
      id: group,
      kind: chosen.kind,
      title: base?.title ?? chosen.title.replace(/\s+\u00b7\s+[^\u00b7]*$/, ""),
      html,
      description: chosen.description,
      device: chosen.device,
      designSystem: chosen.designSystem,
      project: base?.project ?? chosen.project ?? "",
      source: `variation ${chosen.variantLabel ?? id}`,
      origin,
    })
    await this.discard(group)
    return saved.artifact
  }

  async discard(group: string): Promise<number> {
    const list = this.variants(group)
    for (const variant of list) await this.remove(variant.id)
    return list.length
  }

  projects(): Project[] {
    return [...this.folders.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  project(id: string): Project | undefined {
    return this.folders.get(id)
  }

  /** Finds a project by id or (case-insensitive) name. */
  findProject(ref: string): Project | undefined {
    const key = ref.trim().toLowerCase()
    return this.folders.get(key) ?? this.projects().find((p) => p.name.toLowerCase() === key)
  }

  async createProject(name: string, id?: string): Promise<Project> {
    await this.init()
    const clean = name.trim().slice(0, 80)
    if (!clean) throw new Error("Project name is required.")
    const found = this.findProject(id ?? clean)
    if (found) return found
    let candidate = id ?? slug(clean)
    if (!isValidId(candidate)) throw new Error(`Invalid project id "${candidate}". Use lowercase letters, digits and dashes.`)
    for (let n = 2; this.folders.has(candidate); n++) candidate = `${slug(clean)}-${n}`
    const project: Project = { id: candidate, name: clean, createdAt: Date.now() }
    await this.enqueue(async () => {
      this.folders.set(project.id, project)
      await this.persistIndex()
    })
    this.emitChange({ type: "projects", id: project.id })
    return project
  }

  async renameProject(id: string, name: string): Promise<Project> {
    await this.init()
    const project = this.folders.get(id)
    if (!project) throw new Error(`No project with id "${id}".`)
    const clean = name.trim().slice(0, 80)
    if (!clean) throw new Error("Project name is required.")
    project.name = clean
    await this.enqueue(() => this.persistIndex())
    this.emitChange({ type: "projects", id })
    return project
  }

  /** Deletes the folder only; its designs move back to "No project". */
  async removeProject(id: string): Promise<number> {
    await this.init()
    if (!this.folders.has(id)) throw new Error(`No project with id "${id}".`)
    let moved = 0
    await this.enqueue(async () => {
      this.folders.delete(id)
      for (const artifact of this.artifacts.values()) {
        if (artifact.project === id) {
          delete artifact.project
          moved++
        }
      }
      await this.persistIndex()
    })
    this.emitChange({ type: "projects", id })
    return moved
  }

  /** Moves designs into a project (or out of any project when project is undefined). Variations follow their group. */
  async move(ids: string[], project: string | undefined): Promise<string[]> {
    await this.init()
    if (project && !this.folders.has(project)) throw new Error(`No project with id "${project}".`)
    const targets = new Set<string>()
    for (const id of ids) {
      if (!this.artifacts.has(id)) throw new Error(`No design with id "${id}".`)
      targets.add(id)
      for (const variant of this.variants(id)) targets.add(variant.id)
    }
    await this.enqueue(async () => {
      for (const id of targets) {
        const artifact = this.artifacts.get(id)!
        if (project) artifact.project = project
        else delete artifact.project
      }
      await this.persistIndex()
    })
    this.emitChange({ type: "projects", id: project ?? "" })
    return [...targets]
  }

  async remove(id: string): Promise<boolean> {
    await this.init()
    if (!this.artifacts.has(id)) return false
    await this.enqueue(async () => {
      this.written.set(id, null)
      this.artifacts.delete(id)
      await rm(this.htmlFile(id), { force: true })
      await rm(this.historyDir(id), { recursive: true, force: true })
      await this.persistIndex()
    })
    this.emitChange({ type: "remove", id })
    return true
  }
}
