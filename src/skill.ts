export const SKILL_NAME = "canvas-design"

export const SKILL_DESCRIPTION =
  "Design screens, design systems, components, prototypes and system architecture diagrams as live HTML in the browser canvas. Use when the user asks to design, mock up, prototype, wireframe or diagram something visually."

export const SKILL_CONTENT = `# Canvas design

The canvas plugin gives you tools (namespace \`canvas\`) that render designs as HTML and show them live in a browser tab. Each call updates the preview instantly.

## Tools

- \`canvas_design_system\` - brand colors, fonts, scales -> generated CSS tokens, ready-made classes, dark mode, and a visual style guide.
- \`canvas_screen\` - a screen, page, component, prototype or document as HTML. The latest design system is injected automatically.
- \`canvas_system_design\` - architecture diagram from nodes and edges. Layout is automatic.
- \`canvas_edit\` - exact-text replacement inside an existing design (cheap tweaks).
- \`canvas_get\`, \`canvas_list\`, \`canvas_delete\`, \`canvas_open\`.
- \`canvas_comments\` / \`canvas_reply\` - feedback the user pins on elements in the browser.
- \`canvas_variations\` - 2-4 alternative directions of one screen, shown side by side; the user picks one.
- \`canvas_history\` / \`canvas_restore\` - every revision is saved; list versions and go back to one (the restore becomes a new revision).

## Workflow

1. Check \`canvas_list\`. Reuse an existing design system if one fits.
2. For a new product or look, create the design system FIRST. Choose a distinctive palette and fonts that fit the product; avoid generic indigo-on-white unless asked.
3. Build screens with \`canvas_screen\` using the design system's classes and CSS variables (\`var(--color-primary)\`, \`var(--space-4)\`, \`.btn .btn-primary\`, \`.card\`, \`.grid .grid-3\`). Do not hardcode colors or font families.
4. Iterate with \`canvas_edit\` for small changes and \`canvas_screen\` with the same id for rewrites. The browser refreshes by itself.
5. For several related screens, use consistent ids (\`login\`, \`dashboard\`, \`settings\`) and link between prototypes with \`href="#"\` handlers or small inline scripts.
6. Tell the user the preview URL once; do not repeat it after every edit.

## Handling comments

The user can press Comment in the browser, click an element and describe a change. That arrives in your session as a message with the comment id, design id, element selector, text and HTML.

1. Read the design with \`canvas_get\` if you need more context. The selector points at the element; the HTML snippet helps you find it in the source.
2. Make the smallest change that satisfies the request (\`canvas_edit\`, or the matching canvas tool for design systems and diagrams). Keep the rest of the design untouched.
3. Call \`canvas_reply\` with one or two sentences about what you changed and \`resolve: true\`. If the request is ambiguous, reply with a question and leave it open.
4. \`canvas_comments\` lists pending comments if you need to catch up.

## Variations

When the user wants options, asks \"show me a few directions\" or is undecided, use \`canvas_variations\` instead of several \`canvas_screen\` calls. Make the options genuinely different (layout, hierarchy, tone), label each one, and keep content realistic. The user picks in the browser; the chosen one becomes the design with the given id, and then you keep iterating with \`canvas_edit\`.

## Review

The Review button in the canvas checks contrast, alt text, labels, text size, touch targets and heading order. When the user sends findings as a comment, fix each one with \`canvas_edit\`, keeping the look intact, and reply with a summary. Aim for these on every screen you make: body text 4.5:1 contrast, labelled fields, one h1.

## Flows

For multi-screen flows, create each screen with its own \`canvas_screen\` call and a clear title. The user sees them all together under **All screens** in the canvas (each at its device size), so keep device and design system consistent across the flow.

## Implementing in the project

The Implement button in the canvas sends you a prompt with the design HTML and the design-system class sheet. Rebuild the design with the project's own stack and components (do not paste the HTML), map the tokens to the project's theme, wire it into a route or component, and report what you created.

## Direct edits

The user can also press Edit in the browser to change text, colors, sizes and spacing directly. Those changes are written into the design source: text is replaced in place, and style changes go into one \`<style data-canvas-edits>\` block before \`</body>\`. Keep that block when you rewrite a screen with \`canvas_screen\` (read it with \`canvas_get\` first), or the user's tweaks are lost; they can still be recovered with \`canvas_restore\`.

## Screen quality bar

- Realistic content, not "Lorem ipsum". Real names, plausible numbers, concrete labels.
- Complete states when relevant: empty, loading, error, hover, focus, disabled.
- Strong hierarchy: one clear primary action per view, consistent spacing from the scale, generous whitespace.
- Responsive: use \`.grid\` + \`.container\`, avoid fixed widths. Set \`device: "mobile"\` for phone designs and build them for a 390px viewport.
- Accessible: semantic elements, labels on inputs, visible focus, sufficient contrast, \`alt\` text.
- Self-contained: inline SVG for icons and illustrations, no local files. Remote images only over https. Inline \`<script>\` is allowed for interactions (tabs, modals, toggles).
- Dark mode works for free when you stay on the variables.

## System design guidance

- Name every node by its role and put the technology in \`detail\` (e.g. "PostgreSQL 16").
- Pick the node \`type\` carefully: it decides shape and color.
- Use \`group\` for boundaries (Client, Edge, Backend, Data) and \`style: "dashed"\` for async edges.
- Label edges with protocols or payloads. Keep it to roughly 6-20 nodes; split bigger systems into several diagrams.
- Add \`notes\` for the key trade-offs and scaling decisions.
`
