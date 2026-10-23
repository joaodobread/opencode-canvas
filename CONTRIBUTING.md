# Contributing

Thanks for helping out. `main` is protected, so nobody pushes to it directly: every change comes in as a pull request from a fork.

## Workflow

1. Fork [joaodobread/opencode-canvas](https://github.com/joaodobread/opencode-canvas) and clone your fork.
2. Create a branch: `git checkout -b fix/short-description`.
3. Make the change and run the checks:
   ```sh
   npm install
   npm run check   # type-check + end-to-end smoke test (needs Bun)
   ```
4. Push the branch to your fork and open a pull request against `main`. Fill in the template.
5. CI has to pass and the maintainer reviews and merges it (squash).

For anything bigger than a small fix, open an issue first so we can agree on the approach.

## Trying your change in OpenCode

Point a project at your checkout:

```jsonc
{ "plugins": ["/absolute/path/to/your/opencode-canvas"] }
```

Config changes apply without a restart. The plugin loads from `index.ts` at the package root, which re-exports `src/index.ts`: OpenCode skips plugins whose `exports` point into a subfolder.

## Guidelines

- TypeScript, strict mode. Match the style of the surrounding code and keep comments for things that are not obvious.
- The viewer UI lives in `src/viewer.ts` as one HTML string. Check UI changes in a real browser and attach a screenshot to the PR.
- Add or extend a check in `test/smoke.ts` when you change behaviour.
- Do not add runtime dependencies without discussing it first.

## Releases (maintainer)

1. Bump `version` in `package.json` and merge it through a PR.
2. Tag the merge commit: `git tag v1.2.3 && git push origin v1.2.3`.
3. The Release workflow checks that the tag matches `package.json`, runs the checks, creates the GitHub release with a packaged tarball and generated notes, and publishes to npm when an `NPM_TOKEN` secret is set. Tags with a suffix such as `v1.2.3-beta.1` are marked as pre-releases.
