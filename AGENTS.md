# Agents

Check [CLAUDE.md](./CLAUDE.md) for details on how to contribute to this project.

## Playwright Screenshots

When using `playwright_browser_take_screenshot`, always pass `filename` with path under `.playwright-mcp/` to avoid cluttering project root. Use `Date.now()` for uniqueness. Example: `.playwright-mcp/screenshot-{Date.now()}.png`.

Also verify that `.playwright-mcp/` is listed in `.gitignore` (it already is).
