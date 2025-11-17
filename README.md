# Shapeshift

Shapeshift is a Discord bot that lets one account speak as multiple **forms** (name + avatar). Users create forms, define aliases that contain the literal word `text`, and then proxy messages through channel webhooks so the final message looks like it came from the chosen persona. The bot focuses on clear UX, safe defaults (Allowed Mentions = none unless explicitly needed), and full edit/delete coverage for proxied messages.

## Features at a glance

- **Forms & Aliases** – Manage personas with `/form` commands and attach any number of aliases that include the `text` placeholder (e.g., `neoli:text`, `{text}`). Longest matching alias wins, and we normalize triggers for uniqueness.
- **Proxy anywhere** – Trigger via tag-style text (`alias: hello`), `/send`, or the "Proxy as…" message context menu. Attachments are re-uploaded so webhook messages keep the originals intact.
- **Message controls** – Every proxied send is stored in `proxied_messages` with webhook id/token/message id + `source_message_id`. That lets the bot power "Edit proxied…", "Delete proxied…", and "Who sent this?" context menus with proper permission checks.
- **Reply-style rendering** – Webhooks can’t create real replies, so we render a header (`↩︎ Replying to @user`), a single-line quote, and (when possible) a Jump link to mimic Discord’s UX.
- **Safety** – Allowed Mentions default to "no pings", component limits are respected, and Pino logging (with OTEL hooks) provides structured diagnostics for each interaction (`component`, `interactionId`, etc.).

## Commands & UI surfaces

### Slash commands
- `/form add|edit|delete|list` – CRUD for forms, with modals for editing and paginated lists for browsing.
- `/alias add <form> <trigger>`, `/alias list`, `/alias remove` – Create/list/remove aliases; validation enforces the literal `text` placeholder.
- `/send <form> <message>` – Send a single message as a form without typing the alias manually.

### Message context menus
- **Proxy as…** – Take an existing message’s content/attachments and proxy it through one of your forms.
- **Edit proxied…** – Opens a modal prefilled with the existing proxied content so you can fix typos.
- **Delete proxied…** – Removes the webhook message and the stored DB record if you own it.
- **Who sent this?** – Shows an ephemeral summary of the original author/form/guild/channel.

For the full UX checklist (including expected logs), see `docs/message-context-guide.md`.

## How proxying works

1. Users type a trigger that contains the literal word `text` (e.g., `neo:text hello`).
2. The listener matches against the longest alias for that user, extracts the final content, and sends it through a cached webhook implementation of `ChannelProxyPort`.
3. Reply-style metadata is merged in when the source message was a reply.
4. The resulting webhook message id/token + guild/channel/user/form/source message ids are persisted so we can edit/delete or answer "Who sent this?" later.

All outbound sends explicitly set `allowed_mentions: { parse: [] }` unless the reply-style header needs to mention the original author.

## Getting started (development)

**Requirements**: Node 22+, pnpm, Docker Desktop (or any engine that can run Compose), and a Discord application with a bot token.

1. `cp .env.example .env` (or create `.env`) and fill in `BOT_TOKEN`, `APPLICATION_ID`, `DEV_GUILD_ID`, and Postgres credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`).
2. Install deps: `pnpm install`.
3. Start the database: `docker compose up -d db`.
4. Generate + apply migrations: `pnpm db:generate && pnpm db:migrate`.
5. Register commands to your dev guild: `pnpm deploy:guild`. (Use `pnpm deploy:clear` if you need to wipe guild+global commands first.)
6. Run the bot locally: `pnpm dev`. The `/ping` command responds ephemerally within ~3 seconds.

## Script reference

| Script | Description |
| --- | --- |
| `pnpm dev` | Start the bot with automatic reloads via `tsx watch`. |
| `pnpm build` | Type-check and emit `dist/` via `tsc`. |
| `pnpm lint` | Run ESLint on `src/`. |
| `pnpm test` | Execute the Vitest suite once (see `tests/`). |
| `pnpm db:generate` | Generate Drizzle migrations from the schema. |
| `pnpm db:migrate` | Apply pending migrations to the database. |
| `pnpm db:up` / `pnpm db:down` | Start/stop the Postgres service defined in `docker-compose.yml`. |
| `pnpm deploy:guild` | Deploy slash + context commands to the dev guild for fast iteration. |
| `pnpm deploy:global` | Deploy commands globally (may take up to ~1 hour). |
| `pnpm deploy:clear` | Remove *all* guild + global commands for this application, useful when cleaning up stale menus. |

## Quality & testing checklist

Before shipping a change, run:

1. `pnpm build` – catches type errors and proves `dist/` builds cleanly.
2. `pnpm lint` – ESLint must pass with no errors.
3. Relevant `pnpm test` cases or a documented manual verification (for Discord features that are hard to unit test).
4. If you touched slash/context interactions, `pnpm deploy:guild` and test in the dev guild. Ensure interactions acknowledge within ~3 seconds (reply or defer), and context-menu flows meet the checklist in `docs/message-context-guide.md`.

## Tech stack

- **Runtime**: Node 22, TypeScript (ESM modules).
- **Discord SDK**: `discord.js` v14 with a thin registry that pairs slash + context handlers to the REST API.
- **Database**: PostgreSQL (Docker Compose) with Drizzle ORM.
- **Testing**: Vitest.
- **Logging**: Pino (pretty transport in dev, OTEL-friendly JSON in prod).

## Additional docs

- `AGENTS.md` – contributor guidelines for AI + human teammates (scope, terminology, architecture expectations, quality gate).
- `docs/message-context-guide.md` – deployment + verification guide for the four message context menus (`Proxy as…`, `Edit proxied…`, `Delete proxied…`, `Who sent this?`).

Have feedback or want to contribute? Open an issue/PR explaining the Discord UX problem you’re solving, then follow the guidance in `AGENTS.md` to keep changes focused and well-tested.
