export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function isFullDocument(html: string): boolean {
  return /<!doctype|<html[\s>]/i.test(html.slice(0, 2000))
}

export interface ViewOptions {
  title: string
  /** Stylesheet URL of the linked design system (live preview). */
  designSystemHref?: string
  /** Design-system CSS to inline (standalone export). */
  designSystemCss?: string
  /** Markup appended at the end of the body (used for the comment inspector). */
  bodyEnd?: string
}

function withBodyEnd(html: string, bodyEnd: string | undefined): string {
  if (!bodyEnd) return html
  const close = html.toLowerCase().lastIndexOf("</body>")
  return close >= 0 ? `${html.slice(0, close)}${bodyEnd}\n${html.slice(close)}` : `${html}\n${bodyEnd}`
}

const BASE_STYLE =
  "*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%}" +
  "body{margin:0;font-family:var(--font-body,var(--font-sans,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif))}"

function headInjection(options: ViewOptions): string {
  const parts: string[] = []
  if (options.designSystemHref) parts.push(`<link rel="stylesheet" href="${esc(options.designSystemHref)}">`)
  if (options.designSystemCss) parts.push(`<style data-design-system>${options.designSystemCss.replace(/<\/style/gi, "<\\/style")}</style>`)
  return parts.join("\n")
}

/**
 * Turns authored HTML (a full document or a fragment) into a viewable document,
 * injecting the design system ahead of the author's own styles so they can override it.
 */
export function prepareDocument(html: string, options: ViewOptions): string {
  return withBodyEnd(prepareHead(html, options), options.bodyEnd)
}

function prepareHead(html: string, options: ViewOptions): string {
  const injection = headInjection(options)
  if (!isFullDocument(html)) {
    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${esc(options.title)}</title>`,
      `<style>${BASE_STYLE}</style>`,
      injection,
      "</head>",
      "<body>",
      html,
      "</body>",
      "</html>",
    ].join("\n")
  }
  if (!injection) return html
  const head = /<head[^>]*>/i.exec(html)
  if (head) {
    const at = head.index + head[0].length
    return `${html.slice(0, at)}\n${injection}${html.slice(at)}`
  }
  const root = /<html[^>]*>/i.exec(html)
  if (root) {
    const at = root.index + root[0].length
    return `${html.slice(0, at)}\n<head>${injection}</head>${html.slice(at)}`
  }
  return `${injection}\n${html}`
}
