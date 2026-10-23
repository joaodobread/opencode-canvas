# opencode-canvas

A design canvas for OpenCode. The agent creates design systems, UI screens, prototypes and system architecture diagrams as HTML, and a local server previews them live in your browser (auto-reload, device frames, light/dark, export).

## Install

Requires [OpenCode](https://opencode.ai) V2.

From GitHub (pin a release tag to stay on a fixed version):

```sh
opencode plugin add github:joaodobread/opencode-canvas            # latest main
opencode plugin add github:joaodobread/opencode-canvas#v0.1.0     # a specific release
```

Or add it to `opencode.jsonc` (project or `~/.config/opencode/`) with options:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "github:joaodobread/opencode-canvas#v0.1.0", "options": { "port": 4317, "open": true } }
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
| `canvas_comments`      | List comments the user left on designs in the browser.                   |
| `canvas_reply`         | Answer a comment (shown in its thread) and optionally resolve it.        |

Also adds a `/canvas <what to design>` command and a `canvas-design` skill.

The tools are reached through `execute` (Code Mode) by default, like other plugin tools.

## Comments

Press **Comment** (or press `C`) in the preview, click any element and describe the change. The comment is sent to the OpenCode session that last used the canvas (or the most recent session of the project) with the element's selector, text and HTML. The agent edits the design and answers with `canvas_reply`; its reply and the resolved state appear in the thread, and numbered pins mark open comments on the design. Comments are stored in `comments.json` next to the designs. If no session is reachable the comment stays pending and can be retried from the panel.

Viewer shortcuts: `/` search designs, `C` comment mode, `Esc` cancel, `Enter` send (Shift+Enter for a new line).

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
