import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Device } from "./store.js"

export interface ZipEntry {
  name: string
  data: string | Buffer
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Buffer): number {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: (Math.max(0, date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/** Minimal ZIP writer (stored, no compression): enough for a folder of small HTML files. */
export function buildZip(entries: ZipEntry[], date = new Date()): Buffer {
  const { time, day } = dosTime(date)
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8")
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8")
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, name, data)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(20, 6)
    head.writeUInt16LE(0x0800, 8)
    head.writeUInt16LE(0, 10)
    head.writeUInt16LE(time, 12)
    head.writeUInt16LE(day, 14)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(data.length, 20)
    head.writeUInt32LE(data.length, 24)
    head.writeUInt16LE(name.length, 28)
    head.writeUInt32LE(offset, 42)
    central.push(head, name)
    offset += local.length + name.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, directory, end])
}

export function findChrome(): string | undefined {
  const fromEnv = process.env.CHROME_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const candidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
      : process.platform === "win32"
        ? ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"].flatMap((base) => {
            const root = process.env[base]
            return root ? [path.join(root, "Google/Chrome/Application/chrome.exe"), path.join(root, "Microsoft/Edge/Application/msedge.exe")] : []
          })
        : []
  const found = candidates.find((file) => existsSync(file))
  if (found) return found
  if (process.platform === "win32") return undefined
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "microsoft-edge"]) {
    for (const dir of dirs) {
      const file = path.join(dir, name)
      if (existsSync(file)) return file
    }
  }
  return undefined
}

const PAGE_WIDTH: Record<Device, number> = { responsive: 1280, desktop: 1280, tablet: 820, mobile: 390 }

/** Adds print rules so backgrounds are kept and the page is as wide as the design's preview frame. */
export function printable(html: string, device: Device = "responsive"): string {
  const width = PAGE_WIDTH[device] ?? 1280
  const height = Math.max(800, Math.round(width * 1.414))
  const style = `<style data-canvas-print>@page{size:${width}px ${height}px;margin:0}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>`
  const head = /<\/head>/i.exec(html)
  if (head) return `${html.slice(0, head.index)}${style}${html.slice(head.index)}`
  return `${style}${html}`
}

let busy: Promise<unknown> = Promise.resolve()

export function renderPdf(html: string, device: Device = "responsive"): Promise<Buffer> {
  const chrome = findChrome()
  if (!chrome) {
    return Promise.reject(new Error("PDF export needs Chrome, Chromium or Edge. Install one or set CHROME_PATH to its executable."))
  }
  const job = busy.then(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "canvas-pdf-"))
    try {
      const source = path.join(dir, "design.html")
      const target = path.join(dir, "design.pdf")
      await writeFile(source, printable(html, device))
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-pdf-header-footer",
        "--virtual-time-budget=5000",
        `--user-data-dir=${path.join(dir, "profile")}`,
        `--print-to-pdf=${target}`,
      ]
      if (process.platform === "linux" && process.getuid?.() === 0) args.push("--no-sandbox")
      args.push(`file://${source.split(path.sep).map(encodeURIComponent).join("/").replace(/^\/?/, "/")}`)
      await new Promise<void>((resolve, reject) => {
        execFile(chrome, args, { timeout: 45_000 }, (error) => (error ? reject(new Error(`Chrome could not render the PDF: ${error.message}`)) : resolve()))
      })
      return await readFile(target)
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  })
  busy = job.catch(() => undefined)
  return job
}
