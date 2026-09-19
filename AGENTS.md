# zylos-feishu — agent guide

## Project scale and verification

**Profile: personal messaging integration.** Feishu connects real people and agent sessions. Use a focused existing `npm test` case for changed message parsing/routing; permissions, attachments and send/retry behavior need targeted recipient-isolation and duplicate-send checks. UI/docs edits remain lightweight. Do not send real messages or restart unrelated services for tests.

- The requested behavior/questions define completion. Reviews are read-only unless fixes are requested; report unrelated findings without adding tasks or test backfill.
- Use the smallest existing check that proves the change. Add tests for a concrete regression or consequential boundary; no blanket TDD, coverage target, full suite, plans or reviewer chain. Preserve configured CI and actual release gates; reuse still-valid results.
- Keep the existing structure. Internal contract errors should be clear; add retries/fallbacks only for an observed external failure or supported contract. Keep credentials and message content private; inspect security at changed boundaries.

Development guidelines for zylos-feishu.

## Project Conventions

- **ESM only** — Use `import`/`export`, never `require()`. All files use ES Modules (`"type": "module"` in package.json)
- **Node.js 20+** — Minimum runtime version
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- **No `files` in package.json** — Rely on `.gitignore` to exclude unnecessary files. Use `.npmignore` if publishing to npm
- **Secrets in `.env` only** — Never commit secrets. Use `~/zylos/.env` for credentials, `config.json` for non-sensitive runtime config
- **English for code** — Comments, commit messages, PR descriptions, and documentation in English

## Release Process

When releasing a new version, **all four files** must be updated in the same commit:

1. **`package.json`** — Bump `version` field
2. **`package-lock.json`** — Run `npm install` after bumping package.json to sync the lock file
3. **`SKILL.md`** — Update `version` in YAML frontmatter to match package.json
4. **`CHANGELOG.md`** — Add new version entry following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format

Version bump commit message: `chore: bump version to X.Y.Z`

After merge, create a GitHub Release with tag `vX.Y.Z` from the merge commit.

## Architecture

This is a **communication component** for the Zylos agent ecosystem (Feishu/飞书 Chinese platform).

- `src/index.js` — Main entry point (WebSocket event receiver)
- `src/cli.js` — Feishu API CLI tool (documents, spreadsheets, calendar, contacts)
- `src/admin.js` — Admin CLI (config, groups, whitelist management)
- `src/lib/config.js` — Config loader with hot-reload
- `src/lib/client.js` — Feishu API authentication client
- `src/lib/message.js` — Message send/receive, file upload/download
- `src/lib/document.js` — Document and spreadsheet operations
- `src/lib/calendar.js` — Calendar event queries
- `src/lib/chat.js` — Group management
- `src/lib/contact.js` — Contact queries
- `scripts/send.js` — C4 outbound message interface
- `hooks/` — Lifecycle hooks (post-install, pre-upgrade, post-upgrade)
- `ecosystem.config.cjs` — PM2 service config (CommonJS required by PM2)

See [DESIGN.md](./DESIGN.md) for full architecture documentation.
