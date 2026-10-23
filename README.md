# opencode-canvas

A design canvas for OpenCode. The agent creates design systems, UI screens, prototypes and system architecture diagrams as HTML, and a local server previews them live in your browser (auto-reload, device frames, light/dark, export).

## Install

Requires [OpenCode](https://opencode.ai) V2.

From GitHub (pin a release tag to stay on a fixed version):

```sh
opencode plugin add github:joaodobread/opencode-canvas            # latest main
opencode plugin add github:joaodobread/opencode-canvas#v0.3.0     # a specific release
```

Or add it to `opencode.jsonc` (project or `~/.config/opencode/`) with options:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "github:joaodobread/opencode-canvas#v0.3.0", "options": { "port": 4317, "open": true } }
  ]
}
```

Releases and their notes are on the [releases page](https://github.com/joaodobread/opencode-canvas/releases).

To work on a local checkout, run `npm install` in it and point `package` at the absolute path of the directory.

## Options

| option  | default            | description                                                        |
| ------- | ------------------ | ------------------------------------------------------------------ |
| `dir`   | `.opencode/canvas` | Where designs are stored (relative to the project).                |
| `port`  | `4317`             | Preferred port. Falls back to a random free port if busy.          |
| `host`  | `127.0.0.1`        | Bind address. Keep it local unless you set a `token`.              |
| `open`  | `true`             | Open the browser on the first design of a session.                 |
| `token` | none               | `true` generates one, or pass a string. Required on every request. |

## Tools (namespace `canvas`)

| tool                   | purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `canvas_design_system` | Tokens -> CSS variables, component classes, dark mode, style guide page. |
| `canvas_screen`        | Screen, component, prototype or document as HTML.                        |
| `canvas_system_design` | Architecture diagram from nodes/edges with automatic layout.             |
| `canvas_edit`          | Exact-text replacement inside an existing design.                        |
| `canvas_get` / `canvas_list` / `canvas_delete` / `canvas_open` | Manage designs. |
| `canvas_variations`    | 2-4 alternative versions of a screen to compare side by side and pick.   |
| `canvas_history`       | List the saved versions of a design.                                     |
| `canvas_restore`       | Go back to an earlier version (becomes a new revision).                  |
| `canvas_comments`      | List comments the user left on designs in the browser.                   |
| `canvas_reply`         | Answer a comment (shown in its thread) and optionally resolve it.        |
| `canvas_project`       | Create, rename and delete projects (folders) and move designs into them. |

Also adds a `/canvas <what to design>` command and a `canvas-design` skill.

The tools are reached through `execute` (Code Mode) by default, like other plugin tools.

## Comments

Press **Comment** (or press `C`) in the preview, click any element and describe the change. The comment is sent to the OpenCode session that last used the canvas (or the most recent session of the project) with the element's selector, text and HTML. The agent edits the design and answers with `canvas_reply`; its reply and the resolved state appear in the thread, and numbered pins mark open comments on the design. Comments are stored in `comments.json` next to the designs. If no session is reachable the comment stays pending and can be retried from the panel.

Viewer shortcuts: `/` search designs, `C` comment mode, `E` edit mode, `Ctrl/Cmd+Z` undo, `Esc` cancel, `Enter` send (Shift+Enter for a new line).

## Projects

Group designs by project so unrelated work does not end up in one list. The switcher at the top of the sidebar shows **All designs**, each project and **No project**, and lets you create, rename and delete projects (deleting a project keeps its designs). Hover a design (or right-click it) and use the folder button to move it. The agent files designs with the `project` option of the design tools or with `canvas_project`, and the canvas switches to the project it is working in. Design systems used by a project's screens show up in that project too, and **Export project as ZIP** exports only that project.

## Variations

Ask for options (\"show me three directions for the pricing page\") and the agent calls `canvas_variations`. The sidebar gets a **Compare variations** entry that shows every option side by side. **Choose** turns the pick into the design with the final id and discards the rest; **Discard all** drops the set and keeps the original.

## Direct editing

Press **Edit** (or `E`) on a screen, component, prototype or document. Click an element to change its color, background, font, size, weight, alignment, line height, letter spacing, radius, opacity and spacing with sliders and inputs. Double-click text (or press Enter on a selected one) to type in place. Every change is written into the design source: text is replaced where it lives and style changes go into one `<style data-canvas-edits>` block. `Reset` clears the style changes of the selected element. Generated designs (design systems and diagrams) are not hand-editable; ask the agent.

## Review

The shield button audits the open design in place: text contrast (WCAG AA), missing image alt text, controls and fields without names or labels, tiny text, small touch targets and skipped heading levels. Click a finding to highlight the element, or send one (or all of them) to the agent as a comment to fix.

## Board

With two or more screens, the sidebar shows an **All screens** entry: every screen, component, prototype and document on one infinite canvas, each at its device size. Drag or scroll to pan, `Ctrl/Cmd` + scroll (or pinch) to zoom, **Fit** to see everything. Click a screen to make it active: it gets an outline and the mouse wheel scrolls its page instead of the board (click the background, **Done** or `Esc` to go back). Double-click a screen (or click its name) to open it. With a project selected, the board shows only that project. Screens update live as the agent changes them.

## Implement in project

The **Implement** button hands a screen to the agent: it receives the design HTML, the design system's class and token sheet, and an optional note, and is asked to rebuild it with the project's own stack and conventions.

## Export

The `...` menu has **Export as PDF** (one page sized to the design's device) and **Export all as ZIP** (every design as a standalone HTML file with its design system inlined). PDF rendering uses an installed Chrome, Chromium, Edge or Brave; set `CHROME_PATH` to point at a specific executable. The same files are available at `/pdf/<id>` and `/zip[?design=<id>]`.

## Version history

Every save is kept (the last 60 per design) in `.history/` inside the canvas directory, whether it came from the agent, a direct edit, a restore or a file edited on disk. Open the clock button to browse versions, preview any of them and restore it. A restore becomes a new revision, so nothing is lost. `Ctrl/Cmd+Z` and `Shift+Ctrl/Cmd+Z` undo and redo your edits in the canvas.

## How it works

- Designs live as plain `.html` files plus an `index.json` in the canvas directory, so they are diffable and can be committed. Editing a file by hand updates the preview.
- Screens get the latest design system injected before their own styles. `Export` inlines it for a standalone file.
- Previews run in a sandboxed iframe. The server checks the Host header and binds to localhost. Comment writes need an `x-canvas` header and a matching Origin, which sandboxed previews cannot send.

## Develop

```sh
npm install
npx tsc -p .          # type-check
bun test/smoke.ts     # end-to-end test of tools + server
```

## Contributing

`main` is protected: changes land through pull requests from a fork. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
