# AI.md — Shapeshift Project Guide (for Agentic AIs)

## What Shapeshift is

Shapeshift is a modern Discord bot that lets a user speak as different **forms** (personas with name + avatar). Users define **aliases** (triggers containing the literal word `text`, e.g., `neoli:text` or `{text}`) and can then proxy messages through webhooks so they appear as that form. The bot supports slash commands, context menus, tag-based proxying, editing/deleting proxied messages, and a reply-style presentation when responding to another message.

* **Scope model:** global per user (no `/system` UI), with room for future per-guild overrides.
* **Goal:** provide a clean, safe, robust alternative to PluralKit/Tupperbox with clearer UX, edit support, and a future web dashboard.

## Terminology

* **Form** — the persona object (name + avatar).
* **Alias** — a trigger that **must** contain the literal word `text`. Users “pretend” they type `text`, and at runtime it’s replaced by the actual content (e.g., `n:text` → `n: hello`).
* **Proxy** — sending the message via channel webhook with per-message `username`/`avatar_url` so it renders as the form.
* **Reply-style** — since webhooks can’t create *real* replies, render a tiny header “↩︎ Replying to @user”, a one-line quote preview, and (optionally) a **Jump** link button to the original. (See Constraints & Discord Rules below.)

## North-star outcomes

* Simple, respectful UX that works for role-play and plurality communities alike.
* Robust message pipeline (send/edit/delete) with tight permissions and safety.
* Architecture that cleanly supports a future **web dashboard** (HTTP adapter) using the same use-cases.

---

## Architecture (high level)

We use a **hybrid** approach: **Vertical Slices** for features, plus **Ports & Adapters** so the core stays Discord-agnostic.

```
src/
  features/
    identity/                # Forms + Aliases (one module)
      app/                   # use-cases (Discord-agnostic)
      infra/                 # Drizzle repos for this module
      discord/               # command handlers for this module
    proxy/                   # Messaging pipeline & ops
      app/
      infra/
      discord/
  shared/
    ports/                   # ChannelProxyPort (send/edit/delete)
    db/                      # drizzle client & schema
    utils/                   # cross-cutting helpers
  adapters/
    discord/
      client.ts              # boot, intents
      registry.ts            # discovers feature handlers & mounts them
      register-commands.ts   # guild/global deploy
      DiscordChannelProxy.ts # implements ChannelProxyPort via webhooks
```

* **identity** owns: create/edit/delete form; add/list/remove alias; alias rules (literal `text`, longest-prefix wins); defaults (`name:` and `first-letter:` on create, skipping collisions).
* **proxy** owns: tag matcher & `/send`; context menus (proxy as, edit, delete, who); reply-style; storage of webhook ids/tokens/message ids; uses **ChannelProxyPort**.

**Database:** PostgreSQL via **Drizzle ORM**. Initial tables:

* `forms(id, user_id, name, avatar_url, created_at)`
* `aliases(id, user_id, form_id, trigger_raw, trigger_norm, kind('prefix'|'pattern'), created_at)` with **unique (user_id, trigger_norm)**
* `proxied_messages(id, user_id, form_id, guild_id, channel_id, webhook_id, webhook_token, message_id, created_at)`

**Why:** This keeps feature work isolated (fast PRs), while Discord/web specifics remain adapters so a **web dashboard** can reuse the same use-cases later.

---

## Command surface (initial)

* **/form** — `add`, `edit`, `delete`, `list` (list is paginated; edits via modal)
* **/alias** — `add <form> <trigger-with-text>`, `list <form>`, `remove <id>`
* **/send** — send as a form directly (or keep under `/form send`)
* **Context menus (Message):** Proxy as…, Edit proxied…, Delete proxied…, Who sent this?

---

## Constraints & Discord rules (must follow)

* **Acknowledge interactions within ~3 seconds.** If work may take longer, use a deferred response and follow up; otherwise the token is invalidated. ([discord.js Guide][1])
* **Components layout limits:** at most **5 action rows** per message; each row can hold **up to 5 buttons** or **one select menu**. Use pagination UIs when listing many items. ([discord.js Guide][2])
* **Webhooks can edit/delete their own messages** and support per-message `username`/`avatar_url`. Use the **Edit Webhook Message** endpoint for edits; store `webhook_id`, `webhook_token`, and `message_id`. (Webhooks cannot create true replies—render the reply-style header/quote instead.) ([Discord][3])
* **Allowed mentions:** always set and default to “no pings” unless explicitly intended; control `@everyone/@here`, role, and user mentions. ([Discord][4])
* **Command deployment:** use **guild-scoped** commands for fast iteration; **global** commands can take up to ~1 hour to propagate. ([Discord4J Docs][5])

---

## Environment & tooling

* Node 22+, TypeScript (ESM), **discord.js v14**.
* Postgres via Docker Compose (official image requires `POSTGRES_PASSWORD`; add `POSTGRES_USER` and `POSTGRES_DB` as needed). ([Docker Hub][6])
* Drizzle ORM Postgres (node-postgres driver). ([Drizzle ORM][7])

---

## Operating principles for AI contributors

### 0) Safety & scope

* **Do not** change public command names/parameters or data shapes without an explicit instruction in the task.
* **Never** commit secrets; assume `.env` and Docker secrets are used.
* **Default to no pings** (Allowed Mentions denied) unless a task explicitly allows them.

### 1) Plan → Diff → Implement → Test → Document

* **Plan:** state intent, impacted files, and acceptance checks.
* **Diff:** propose minimal file changes (aim for ≤ ~400 LOC per PR).
* **Implement:** follow the folder/ports layout above.
* **Test:** run code and/or unit tests locally (see Quality Gate below).
* **Document:** update inline docs/comments and the relevant section in this file or README if you changed behavior or setup.

### 2) Quality gate (mandatory)

Before marking any task **complete**, you **must** ensure:

* **Build passes:** `pnpm build` produces a clean `dist/`.
* **Type checks clean:** no TypeScript errors or IDE highlights.
* **Lint passes:** `pnpm lint` shows **no** errors (warnings should be addressed or justified).
* **Runtime sanity:** the bot starts (`pnpm dev` or `pnpm start`) and can reply to `/ping` in the dev guild.
* **If you added logic:** either unit tests (Vitest) **or** an end-to-end manual run proving the change; **at minimum** the app must run without errors.

> Interactions must be acknowledged within ~3s; if your code calls Discord or the database, **defer** first then follow up. ([discord.js Guide][1])

### 3) Coding standards

* Keep business logic Discord-agnostic in `features/*/app`.
* Use **ports** for outbound effects (sending/editing messages), implemented in `adapters/discord`.
* Avoid premature abstractions. Share helpers only when they’re truly cross-feature (`shared/utils`).
* Validate inputs with Zod at the adapter boundary when appropriate.
* Prefer **clear names** over cleverness; prefer pure functions in the app layer.
* Keep functions short and focused; write doc-comments for non-obvious logic.

### 4) Database rules

* Use Drizzle ORM for reads/writes; migrations live in `drizzle/`.
* Enforce alias uniqueness via `(user_id, trigger_norm)`.
* Normalize alias triggers (case-fold, trim, collapse spaces); **require** the literal `text`.

### 5) Discord UX rules

* **Ephemeral** for management flows (`/form list`, `/alias list`, confirmations).
* Component pagination for long lists (respect the **5 rows / 5 buttons** rule). ([discord.js Guide][2])
* Always set **Allowed Mentions**; default to none. ([Discord][4])
* For replies, render reply-style header/quote; don’t attempt “true” webhook replies. (Webhooks can edit/delete via token.) ([Discord][3])

---

## What to build first (high-level order)

1. **Bootstrap & DB wiring** (dockerized Postgres, Drizzle base, `/ping`, guild deploy).
2. **Forms (identity) MVP** — add/list/edit/delete; on add, auto-create `name:` and first-letter `n:` defaults (skip collisions).
3. **Aliases** — `add` (must include `text`), `list`, `remove`; longest-prefix matching policy in the matcher.
4. **Proxy** — tag listener + `/send`; webhook registry; store ids/tokens/message ids.
5. **Context menus** — proxy as, edit, delete, who.
6. **Reply-style** — header/quote/Jump button.

---

## Local development quickstart

* `docker compose up -d db` — start Postgres (official image requires `POSTGRES_PASSWORD`). ([Docker Hub][6])
* `pnpm db:generate && pnpm db:migrate` — generate/apply migrations. ([Drizzle ORM][7])
* `pnpm deploy:guild` — register commands to the dev guild (fast). (Global commands may take up to ~1 hour to appear—use guild during development.) ([Discord4J Docs][5])
* `pnpm dev` — start the bot; verify `/ping` responds **ephemerally** and handlers **ack** in time. ([discord.js Guide][1])

---

## References

* **Interactions: responding & timing** (3-second acknowledgment, deferrals). ([discord.js Guide][1])
* **Components limits** (action rows, buttons, select menus). ([discord.js Guide][2])
* **Webhook resource** (execute/edit/delete; allowed mentions). ([Discord][3])
* **Allowed Mentions** (suppress pings safely). ([Discord][4])
* **Command deploy: guild vs global & propagation** (guild instant, global may take ~1h). ([Discord4J Docs][5])
* **Drizzle ORM Postgres quickstart**. ([Drizzle ORM][7])
* **Postgres Docker image envs** (POSTGRES_PASSWORD required). ([Docker Hub][6])

---

### Final reminder to any AI agent

* Keep PRs **small** and **focused** (≤ ~400 LOC).
* **Don’t guess** Discord behavior—check the docs referenced above.
* **Prove it works** (build, lint, typecheck, run, and/or tests) **before** calling a task done.

[1]: https://discordjs.guide/slash-commands/response-methods?utm_source=chatgpt.com "Command Responses | discord.js"
[2]: https://discordjs.guide/interactive-components/action-rows?utm_source=chatgpt.com "Action Rows | discord.js"
[3]: https://discord.com/developers/docs/resources/webhook?utm_source=chatgpt.com "Webhook Resource | Documentation"
[4]: https://discord.com/developers/docs/resources/message?utm_source=chatgpt.com "Messages Resource | Documentation"
[5]: https://docs.discord4j.com/interactions/application-commands?utm_source=chatgpt.com "Application Commands"
[6]: https://hub.docker.com/_/postgres?utm_source=chatgpt.com "postgres - Official Image"
[7]: https://orm.drizzle.team/docs/get-started/postgresql-new?utm_source=chatgpt.com "Get Started with Drizzle and PostgreSQL"
