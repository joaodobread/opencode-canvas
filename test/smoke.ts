import { mkdtemp, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import assert from "node:assert/strict"
import { Store } from "../src/store.js"
import { CommentStore } from "../src/comments.js"
import { startServer } from "../src/server.js"
import { createTools } from "../src/tools.js"

const dir = await mkdtemp(path.join(tmpdir(), "canvas-"))
const store = new Store(path.join(dir, "canvas"))
await store.init()
const comments = new CommentStore(path.join(dir, "canvas"), store)
const delivered: string[] = []
comments.deliver = async (c, m) => { delivered.push(`${c.id}:${m.text}`); return true }
const server = await startServer(store, comments, { port: 0 })
const runtime = {
  store,
  comments,
  track: () => undefined,
  urlFor: async (id?: string) => server.urlFor(id),
  announce: async (id: string) => server.urlFor(id),
  open: async (id?: string) => server.urlFor(id),
}
const tools = Object.fromEntries(createTools(runtime).map((t) => [t.name, t])) as Record<string, any>
const run = (name: string, input: unknown) => tools[name].execute(input, {})
const text = (r: any) => (typeof r.content === "string" ? r.content : "")

const events: any[] = []
store.on("change", (e) => events.push(e))

let r = await run("design_system", {
  name: "Acme UI",
  colors: { primary: "#0f766e", accent: "#f59e0b", brand: "#7c3aed" },
  fonts: { body: "Inter", heading: "Space Grotesk", import: "https://fonts.googleapis.com/css2?family=Inter&display=swap" },
  radius: 12,
})
console.log(text(r).split("\n").slice(0, 3).join("\n"))
assert.match(text(r), /Created design-system/)
assert.match(text(r), /brand -> classes/); assert.match(await store.html("acme-ui") ?? "", /\.btn-brand\{/)

r = await run("screen", {
  title: "Login",
  html: '<main class="container container-sm"><div class="card stack"><h1>Welcome back</h1><input class="input" placeholder="Email"><button class="btn btn-primary">Sign in</button></div></main>',
  device: "mobile",
})
assert.match(text(r), /applied automatically/)

r = await run("system_design", {
  title: "Checkout architecture",
  direction: "LR",
  nodes: [
    { id: "u", label: "Shopper", type: "user" },
    { id: "cdn", label: "CDN", type: "cdn", detail: "CloudFront" },
    { id: "gw", label: "API Gateway", type: "gateway", group: "Backend" },
    { id: "orders", label: "Orders", type: "service", detail: "Go", group: "Backend" },
    { id: "pay", label: "Payments", type: "service", detail: "Node", group: "Backend" },
    { id: "db", label: "Orders DB", type: "database", detail: "PostgreSQL 16", group: "Data" },
    { id: "q", label: "Events", type: "queue", detail: "Kafka", group: "Data" },
    { id: "stripe", label: "Stripe", type: "external" },
    { id: "mail", label: "Email worker", type: "worker", group: "Backend" },
  ],
  edges: [
    { from: "u", to: "cdn", label: "HTTPS" },
    { from: "cdn", to: "gw" },
    { from: "gw", to: "orders", label: "gRPC" },
    { from: "gw", to: "pay" },
    { from: "orders", to: "db", label: "SQL" },
    { from: "orders", to: "q", style: "dashed", label: "order.created" },
    { from: "q", to: "mail", style: "dashed" },
    { from: "pay", to: "stripe", label: "REST" },
    { from: "stripe", to: "pay", style: "dotted", label: "webhook" },
    { from: "u", to: "gw", label: "long edge" },
  ],
  notes: ["Orders and payments scale independently"],
})
assert.match(text(r), /9 nodes, 10 edges/)

// edit
r = await run("edit", { id: "login", oldString: "Sign in", newString: "Log in" })
assert.match(text(r), /v2/)
await assert.rejects(run("edit", { id: "login", oldString: "nope", newString: "x" }), /not found/)
await assert.rejects(run("edit", { id: "login", oldString: "o", newString: "0" }), /matches \d+ places/)
await assert.rejects(run("screen", { title: "x", html: "y", designSystem: "missing" }), /does not exist/)
await assert.rejects(run("system_design", { title: "bad", nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "zzz" }] }), /unknown node/)
await assert.rejects(run("design_system", { name: "Bad", colors: { primary: "red" } }), /hex/)

console.log(text(await run("list", {})))

// http
const base = `http://127.0.0.1:${server.port}`
const get = async (p: string) => { const res = await fetch(base + p); return { res, body: await res.text() } }
let h = await get("/")
assert.equal(h.res.status, 200); assert.match(h.body, /OpenCode Canvas/)
h = await get("/api/artifacts")
const list = JSON.parse(h.body).artifacts
assert.equal(list.length, 3)
h = await get("/view/login")
assert.match(h.body, /href="\/ds\/acme-ui\.css/)
assert.match(h.body, /Log in/)
h = await get("/ds/acme-ui.css")
assert.match(h.body, /--color-primary:#0f766e/); assert.match(h.body, /fonts\.googleapis\.com/)
h = await get("/export/login")
assert.match(h.body, /data-design-system/); assert.equal(h.res.headers.get("content-disposition")?.includes("login.html"), true)
assert.ok(!/href="\/ds\//.test(h.body))
h = await get("/view/checkout-architecture"); assert.match(h.body, /<svg/)
await writeFile(path.join(dir, "arch.html"), h.body)
await writeFile(path.join(dir, "ds.html"), (await get("/view/acme-ui")).body)
await writeFile(path.join(dir, "login.html"), (await get("/view/login")).body)
assert.equal((await get("/view/..%2Fetc")).res.status, 404)
assert.equal((await fetch(base + "/", { headers: { host: "evil.com" } })).status, 403)
assert.equal((await fetch(base + "/", { method: "PUT" })).status, 405)
assert.equal((await fetch(base + "/api/comments", { method: "POST", body: "{}" })).status, 403)
assert.equal((await fetch(base + "/api/comments", { method: "POST", body: "{}", headers: { "x-canvas": "1", origin: "http://evil.com" } })).status, 403)
h = await get("/view/login?inspect=1"); assert.match(h.body, /__canvasInspector/)
assert.ok(!/__canvasInspector/.test((await get("/view/login")).body))

// comments
const post = async (p: string, body: unknown, method = "POST") => {
  const res = await fetch(base + p, { method, headers: { "x-canvas": "1", "content-type": "application/json", origin: base }, body: JSON.stringify(body) })
  return { res, json: (await res.json()) as any }
}
let c = await post("/api/comments", { designId: "login", text: "Make this button bigger", anchor: { selector: "main > button:nth-of-type(1)", tag: "button", label: "button.btn", text: "Enter" } })
assert.equal(c.res.status, 201); assert.equal(c.json.comment.delivery, "sent")
const cid = c.json.comment.id as string
assert.deepEqual(delivered, [`${cid}:Make this button bigger`])
assert.equal((await post("/api/comments", { designId: "nope", text: "x" })).res.status, 400)
assert.equal((await post("/api/comments", { designId: "login", text: "   " })).res.status, 400)
c = await post(`/api/comments/${cid}/messages`, { text: "and red" })
assert.equal(delivered.length, 2)
assert.match(text(await run("comments", {})), new RegExp(cid))
await run("reply", { commentId: cid, text: "Done", resolve: true })
assert.equal(comments.get(cid)?.status, "resolved")
assert.equal(comments.get(cid)?.messages.at(-1)?.role, "agent")
assert.match(text(await run("comments", {})), /No open comments/)
assert.equal(JSON.parse((await get("/api/comments?design=login")).body).comments.length, 1)
await assert.rejects(run("reply", { commentId: "zzz", text: "x" }), /No comment/)
comments.deliver = async () => false
c = await post("/api/comments", { designId: "login", text: "pending one" })
assert.equal(c.json.comment.delivery, "pending")
comments.deliver = async () => true
c = await post(`/api/comments/${c.json.comment.id}/retry`, {})
assert.equal(c.json.comment.delivery, "sent")
c = await post(`/api/comments/${cid}/status`, { status: "open" }); assert.equal(c.json.comment.status, "open")
assert.equal((await post(`/api/comments/${cid}/status`, { status: "bogus" })).res.status, 400)

// SSE
const ctrl = new AbortController()
const sse = await fetch(base + "/events", { signal: ctrl.signal })
const reader = sse.body!.getReader()
await reader.read()
await run("edit", { id: "login", oldString: "Log in", newString: "Enter" })
const chunk = new TextDecoder().decode((await reader.read()).value)
assert.match(chunk, /"id":"login"/)
ctrl.abort()

// external edit is picked up
const before = events.length
await writeFile(store.htmlFile("login"), "<h1>hand edited</h1>")
await new Promise((r) => setTimeout(r, 600))
assert.ok(events.length > before, "watcher event")
assert.match((await get("/view/login")).body, /hand edited/)

// direct edits
await run("screen", { id: "hero", title: "Hero", html: '<main><h1>Hello world</h1><p>Hello world</p><button class="btn">Go</button></main>' })
let e = await post("/api/edit/hero", { ops: [{ type: "text", before: "Hello world", after: "Hi <b>there</b>", index: 1 }], origin: "t1" })
assert.equal(e.res.status, 200)
let heroHtml = (await store.html("hero"))!
assert.match(heroHtml, /<h1>Hello world<\/h1><p>Hi <b>there<\/b><\/p>/)
e = await post("/api/edit/hero", { ops: [{ type: "style", selector: "main > h1", props: { color: "#ff0000", "font-size": "40px" } }] })
heroHtml = (await store.html("hero"))!
assert.match(heroHtml, /<style data-canvas-edits>\nmain > h1\{color:#ff0000!important;font-size:40px!important\}\n<\/style>/)
e = await post("/api/edit/hero", { ops: [{ type: "style", selector: "main > h1", props: { color: "" } }] })
assert.match((await store.html("hero"))!, /main > h1\{font-size:40px!important\}/)
e = await post("/api/edit/hero", { ops: [{ type: "reset", selector: "main > h1" }] })
assert.ok(!/data-canvas-edits/.test((await store.html("hero"))!))
assert.equal((await post("/api/edit/hero", { ops: [{ type: "style", selector: "h1", props: { color: "red;} body{display:none" } }] })).res.status, 400)
assert.equal((await post("/api/edit/hero", { ops: [{ type: "style", selector: "h1{}", props: { color: "red" } }] })).res.status, 400)
assert.equal((await post("/api/edit/hero", { ops: [{ type: "style", selector: "h1", props: { "background-image": "red" } }] })).res.status, 400)
assert.equal((await post("/api/edit/hero", { ops: [{ type: "text", before: "Go", after: "<img src=x onerror=alert(1)>" }] })).res.status, 400)
assert.equal((await post("/api/edit/hero", { ops: [{ type: "text", before: "missing text", after: "x" }] })).res.status, 400)
assert.equal((await post("/api/edit/acme-ui", { ops: [{ type: "reset", selector: "h1" }] })).res.status, 400)
assert.equal((await post("/api/edit/nope", { ops: [{ type: "reset", selector: "h1" }] })).res.status, 404)

// history
let versions = (await get("/api/history/hero")).body
const vlist = JSON.parse(versions).versions as any[]
assert.ok(vlist.length >= 5, "one version per save")
assert.equal(vlist[0].revision, store.get("hero")!.revision)
assert.equal(vlist.at(-1).source, "agent")
assert.ok(vlist.some((v) => v.source === "edit"))
h = await get("/view/hero?rev=1"); assert.match(h.body, /Hello world<\/p>/)
const heroNow = store.get("hero")!.revision
const restored = await post("/api/restore/hero", { revision: 1, origin: "t1" })
assert.equal(restored.res.status, 200); assert.equal(restored.json.artifact.revision, heroNow + 1)
assert.match((await store.html("hero"))!, /<p>Hello world<\/p>/)
assert.equal(JSON.parse((await get("/api/history/hero")).body).versions[0].source, "restore v1")
assert.equal((await post("/api/restore/hero", { revision: 999 })).res.status, 400)
assert.match(text(await run("history", { id: "hero" })), /restore v1/)
await run("restore", { id: "hero", revision: 2 })
assert.match((await store.html("hero"))!, /Hi <b>there<\/b>/)
await assert.rejects(run("restore", { id: "hero", revision: 0 }), /positive integer/)
// history exists for designs saved before history was added
await writeFile(path.join(dir, "canvas", "legacy.html"), "<p>one</p>")
await new Promise((r) => setTimeout(r, 500))
await run("screen", { id: "legacy", title: "Legacy", html: "<p>two</p>" })
assert.ok(JSON.parse((await get("/api/history/legacy")).body).versions.length >= 2)
await run("delete", { id: "hero" }); await run("delete", { id: "legacy" })
assert.deepEqual(JSON.parse((await get("/api/history/hero")).body).versions, [])

// variations
r = await run("variations", { id: "pricing", title: "Pricing page", variants: [{ label: "Bold hero", html: "<h1>Bold</h1>" }, { label: "Table", html: "<h1>Table</h1>" }, { label: "Cards", html: "<h1>Cards</h1>" }] })
assert.match(text(r), /3 variations/)
assert.equal(store.variants("pricing").length, 3)
assert.equal(store.get("pricing-v2")!.variantOf, "pricing")
assert.match(text(await run("list", {})), /variation of pricing/)
await assert.rejects(run("variations", { id: "pricing", title: "x", variants: [{ label: "a", html: "x" }] }), /2 to 4/)
await run("variations", { id: "pricing", title: "Pricing page", variants: [{ label: "A", html: "<h1>A</h1>" }, { label: "B", html: "<h1>B</h1>" }] })
assert.equal(store.variants("pricing").length, 2, "a new set replaces the old one")
assert.equal((await post("/api/variations/pricing/pick", { id: "login" })).res.status, 400)
const picked = await post("/api/variations/pricing/pick", { id: "pricing-v2", origin: "t1" })
assert.equal(picked.res.status, 200); assert.equal(picked.json.artifact.id, "pricing")
assert.match((await store.html("pricing"))!, /<h1>B<\/h1>/)
assert.equal(store.variants("pricing").length, 0); assert.equal(store.get("pricing")!.variantOf, undefined)
assert.equal(store.get("pricing-v1"), undefined)
await run("variations", { id: "pricing", title: "Pricing page", variants: [{ label: "A", html: "<h1>A2</h1>" }, { label: "B", html: "<h1>B2</h1>" }] })
assert.equal((await post("/api/variations/pricing/discard", {})).json.removed, 2)
assert.match((await store.html("pricing"))!, /<h1>B<\/h1>/, "discard keeps the original")
await run("delete", { id: "pricing" })

// delete protection
await assert.rejects(run("delete", { id: "acme-ui" }), /used by/)
await run("delete", { id: "login" })
await new Promise((r) => setTimeout(r, 100))
assert.equal(comments.list().length, 0, "comments removed with their design")
await assert.rejects(run("get", { id: "login" }), /No design/)

// persistence
store.close()
const again = new Store(path.join(dir, "canvas")); await again.init()
assert.equal(again.list().length, 2); again.close()

await server.close()
console.log("OK", dir)
