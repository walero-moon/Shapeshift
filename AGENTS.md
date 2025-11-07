# AGENTS.md — Contributor Guide for Agentic AIs

## 1) What this project is

**Shapeshift** is a modern Discord bot that lets a user speak as different **forms** (name + avatar). Users define **aliases**—triggers that **must** contain the literal word `text` (e.g., `neoli:text`, `{text}`)—and can proxy messages through **webhooks** so they appear as that form.

* **Scope model:** global per user (no `/system` UI), with room for per-guild overrides later.
* **Primary goals:** clear UX, robust proxy pipeline (send/edit/delete), reply-style rendering, and a future **web dashboard** using the *same* use-cases.

---

## 2) Terminology

* **Form** – persona object (name + avatar).
* **Alias** – trigger containing the literal `text`. The user types `text` in context; at runtime we replace it with actual message content.
* **Proxy** – send via a channel webhook with per-message `username`/`avatar_url`.
* **Reply-style** – because webhooks can’t create real replies, we render a tiny header (`↩︎ Replying to @user`), 1-line quote, and optional “Jump” link. Webhooks **can** edit/delete their own messages via the edit endpoint. ([Discord][1])

---

## 3) Tech Stack

* **Runtime:** Node 22+, TypeScript (ESM), **discord.js v14**.
* **DB:** PostgreSQL (Docker Compose). Official image requires `POSTGRES_PASSWORD`; `POSTGRES_USER`/`POSTGRES_DB` supported. ([Docker Hub][2])
* **ORM:** Drizzle ORM (Postgres driver). ([Drizzle ORM][3])
* **Tests:** Vitest.
* **Lint:** ESLint (TypeScript rules).
* **Logging:** Pino (JSON in prod, pretty in dev). ([Pino][4])

---

## 4) Architecture & folders (hybrid Vertical Slices + Adapters)

We combine **Vertical Slices** (features) with **Ports & Adapters** (Discord/web/database isolated behind interfaces).

```
src/
  features/
    identity/                 # Forms + Aliases (one aggregate)
      app/                    # use-cases (Discord-agnostic)
      infra/                  # Drizzle repos for this module
      discord/                # command handlers for this module
    proxy/                    # Messaging pipeline & ops
      app/                    # send/edit/delete, matcher, reply-style
      infra/                  # proxied_messages repo
      discord/                # listener + context menus + /send
  shared/
    ports/
      ChannelProxyPort.ts     # { send, edit, delete }
    db/
      client.ts
      schema.ts
    utils/
      allowedMentions.ts, username.ts, ...
  adapters/
    discord/
      client.ts               # boot, intents
      registry.ts             # mounts handlers exported by features
      register-commands.ts    # guild/global deploy
      DiscordChannelProxy.ts  # implements ChannelProxyPort via webhooks
```

* **identity** owns: create/edit/delete form; add/list/remove alias; rules (literal `text`, longest-prefix wins); auto-defaults on create (`name:` and first-letter `n:` if not colliding).
* **proxy** owns: tag-based proxy, `/send`, context menus, reply-style formatting, storing `webhook_id/token/message_id` and using **ChannelProxyPort**.

---

## 5) Command & UI surface

* **/form** — `add`, `edit`, `delete`, `list` (list is paginated; edits via **Modal**)
* **/alias** — `add <form> <trigger-with-text>`, `list <form>`, `remove <id>`
* **/send** — send as a form directly
* **Context menus (Message)** — Proxy as…, Edit proxied…, Delete proxied…, Who sent this?

**Discord constraints you must honor:**

* **Acknowledge interactions within ~3 seconds** or defer; otherwise the token is invalid. ([Discord][5])
* **Components limits:** a message can have **up to 5 action rows**; each row can have **up to 5 buttons** or **one select**. Use pagination UIs when needed. ([Discord][6])
* **Webhooks:** can **send/edit/delete** their messages; use **Edit Webhook Message** for edits. There is **no true reply** API for webhooks—simulate with a header/quote and optional jump link. ([Discord][1])
* **Allowed Mentions:** always set; default to **no pings** unless explicitly required. ([Discord][7])
* **Command deployment:** use **guild-scoped** for development (near-instant); **global** updates may take **up to ~1 hour** to propagate. ([Discord][8])

---

## 6) Database model (initial)

* `forms(id, user_id, name, avatar_url, created_at)`
* `aliases(id, user_id, form_id, trigger_raw, trigger_norm, kind('prefix'|'pattern'), created_at)`

  * **Unique (user_id, trigger_norm)** per user.
* `proxied_messages(id, user_id, form_id, guild_id, channel_id, webhook_id, webhook_token, message_id, created_at)`

**Drizzle Postgres:** connect via `DATABASE_URL` (node-postgres or postgres.js). Use `drizzle.config.ts` with dotenv so CLI sees env. ([Drizzle ORM][3])

---

## 7) Quality Gate (MANDATORY for every change)

Before marking any task **complete**, you MUST verify all of the following:

1. **Build & Types**

   * `pnpm build` succeeds and produces a clean `dist/`.
   * No TypeScript errors or IDE highlights remain.

2. **Lint**

   * `pnpm lint` passes with **no errors** (warnings addressed or justified inline).

3. **Runtime sanity**

   * `pnpm dev` runs; `/ping` in the dev guild replies **ephemerally** and **acknowledges within ~3s** (or defers first). ([Discord][5])
   * If you changed Discord interactions, verify **guild** command deploy works; don’t rely on slow global propagation. ([Discord][8])

4. **Functional proof**

   * If you added meaningful logic: provide **unit tests** *or* a manual E2E verification note. At minimum, run the application and prove the flow.

5. **Discord safety**

   * Set **Allowed Mentions** appropriately (default none). ([Discord][7])
   * Respect component limits; prefer paginated lists over overflowing rows. ([Discord][6])

6. **DB migrations**

   * Update Drizzle schema+migration when data shapes change; run `generate` + `migrate` locally without errors. ([Drizzle ORM][3])

---

## 8) Workflow for AI agents

**Plan → Diff → Implement → Test → Document**

* **Plan**: Write a brief stating intent, files to touch, acceptance checks.
* **Diff**: Keep PRs small (target ≤ ~400 LOC). Avoid sweeping refactors.
* **Implement**:

  * Put business logic in `features/*/app` (Discord-agnostic).
  * Use `shared/ports` for outbound effects; implement in `adapters/discord`.
  * Keep helpers in `shared/utils` only if truly cross-feature.
* **Test**: Run the app and/or unit tests; confirm 3-second interaction rule adherence. ([discord.js Guide][9])
* **Document**: Update README/AI.md/this file if behavior or setup changed.

**Never do**:

* Change public command names/params or persisted data shapes without an explicit ticket.
* Commit secrets; always use `.env`/Docker secrets.
* Send messages without setting **Allowed Mentions** explicitly. ([Discord][7])

---

## 9) Local dev quickstart

```bash
# start database (Docker)
docker compose up -d db

# create/apply migrations
pnpm db:generate && pnpm db:migrate

# register commands to dev guild (fast)
pnpm deploy:guild

# run the bot
pnpm dev
```

* Postgres (official image) needs `POSTGRES_PASSWORD`; you can also set `POSTGRES_USER` and `POSTGRES_DB`. ([Docker Hub][2])
* Drizzle Postgres quickstart and existing-project guides here. ([Drizzle ORM][3])

---

## 10) Logging standard

Use **Pino** with a tiny wrapper:

* **Dev**: pretty transport; **Prod**: JSON to stdout.
* Include stable fields: `component`, `guildId`, `channelId`, `userId`, `interactionId`, `route`, `status`.
* Don’t use `console.log`; always use the logger. ([Pino][4])

---

## 11) Error Handling Framework

### Error Handling Patterns and Utilities

The project provides comprehensive error handling utilities in `src/shared/utils/errorHandling.ts`:

* **`handleInteractionError`**: Handles Discord interaction errors with proper logging and user-friendly responses. Automatically determines whether to use `reply()` or `editReply()` based on interaction state. Always sets `allowedMentions` and makes responses ephemeral by default. **MANDATORY** for all Discord command/modal handlers to respect the 3-second interaction rule.

* **`wrapAsync`**: Wraps async operations with try-catch, logging errors with full context. Returns result on success, or fallback value (or re-throws) on error. Use selectively in application layer for complex operations with multiple error paths.

* **`validateUrl`**: Validates URL strings with specific error messages for avatar URLs. Checks protocol (http/https), hostname presence, and provides user-friendly error messages.

* **`handleDatabaseError`**: Handles database operation errors with logging and graceful degradation. Useful for operations that can continue with cached/default data when DB is unavailable.

* **`handleWebhookError`**: Handles webhook operation errors with graceful degradation. Webhook failures are logged but don't crash the bot - messaging continues in degraded mode. **MANDATORY** for webhook operations.

* **`handleDegradedModeError`**: Wraps operations that should continue working even when dependencies are unavailable. Always returns a fallback value on error.

### Retry Utilities

Retry logic is implemented in `src/shared/utils/retry.ts`:

* **`retryAsync`**: Retries operations with exponential backoff. Configurable `maxAttempts`, `baseDelay`, `maxDelay`, and `backoffFactor`.

* **`retryWithJitter`**: Adds random jitter (±25% of delay) to retry timing to avoid thundering herd problems in concurrent scenarios.

### Logging Standards and Context Fields

Error handling integrates with the logging framework:

* Use the `LogContext` interface for consistent logging fields: `component`, `guildId?`, `channelId?`, `userId?`, `interactionId?`, `route?`, `status?`.
* All error handlers include error messages, stack traces (in dev), and operation context.
* Status codes like `interaction_error`, `database_error`, `webhook_error`, `degraded_mode_fallback` provide consistent categorization.

### Fallback Mechanisms and Graceful Degradation

* **Webhook failures**: Bot continues operating but messaging features may be limited. Logged as `webhook_degraded`.
* **Database failures**: Read operations can use cached/default data. Write operations typically rethrow for data integrity.
* **Interaction errors**: Always attempt to respond to users with friendly messages, even if error response fails.
* **Validation errors**: Provide specific, actionable error messages to guide users.

### Testing Guidelines for Error Scenarios

Error handling is thoroughly tested in `src/shared/utils/tests/`:

* **Unit tests** for all error handling functions with mocked dependencies.
* **Logger mocking** to verify error logging without console output.
* **Fake timers** for testing retry delays and backoff.
* **Error injection** to test fallback behaviors and graceful degradation.
* **Edge cases**: Non-Error exceptions, response failures, malformed inputs.

### Best Practices for Implementing Error Handling in New Features

The project follows a **hybrid error handling approach** that balances safety, consistency, and developer productivity. Use comprehensive wrappers for critical safety concerns (Discord interactions, webhooks), but prefer direct error handling for application logic where business logic clarity is paramount.

* **Always use `handleInteractionError`** for Discord command/modal handlers to respect the 3-second interaction rule.
* **Always use `handleWebhookError`** for webhook operations to ensure graceful degradation.
* **Use `wrapAsync` selectively** in application layer for complex operations with multiple error paths; prefer direct try-catch for simple operations.
* **Handle validation errors** at the application layer with user-friendly messages.
* **Log with consistent context** using `LogContext` fields for better observability.
* **Provide meaningful fallbacks** where possible - prefer degraded functionality over complete failure.
* **Test error scenarios** thoroughly, including edge cases and dependency failures.
* **Set `allowedMentions`** explicitly on all Discord responses to prevent accidental pings.

---

## 12) Discord specifics to remember

* **Interactions:** reply or defer within **~3s**; then follow up/edit. ([Discord][5])
* **Components:** ≤ **5** action rows/message; a row holds **≤ 5 buttons** *or* **1 select**. ([Discord][6])
* **Webhooks:** execute → store `message_id`; later **Edit Webhook Message** for edits. There is no true reply for webhooks; render reply-style instead. ([Discord][1])
* **Allowed Mentions:** explicitly set on sends/edits (avoid accidental pings). ([Discord][7])
* **Guild vs Global commands:** use guild during development; global may take **up to ~1 hour**. ([Discord][8])

---

## 12) PR sequencing (reference)

1. Bootstrap + DB wiring + `/ping`
2. **Identity**: /form add/list/edit/delete (auto-default aliases)
3. **Aliases**: /alias add/list/remove (must include `text`; normalize; longest-prefix policy readied)
4. **Proxy**: tag listener + `/send` + webhook registry (store ids/tokens/message ids)
5. **Message ops**: context menus (proxy as / edit / delete / who)
6. **Reply-style**: header + 1-line quote + optional Jump link
7. (Later) Autoproxy/hold, per-guild overrides, dashboard HTTP adapter

---

### Final reminder for agents

* Keep changes **small and surgical**.
* Respect the **3-second** interaction rule, component limits, and webhook realities. ([Discord][5])
* **Prove it works** (build, lint, typecheck, run and/or tests) *before* declaring a task done.
* At the end of every PR/change, give small instructions/a small guide of the most important changes
to look at and review first, so that the path/flow of the application can be traced.

---

[1]: https://discord.com/developers/docs/resources/webhook?utm_source=chatgpt.com "Webhook Resource | Documentation"
[2]: https://hub.docker.com/_/postgres?utm_source=chatgpt.com "postgres - Official Image"
[3]: https://orm.drizzle.team/docs/get-started/postgresql-new?utm_source=chatgpt.com "Get Started with Drizzle and PostgreSQL"
[4]: https://getpino.io/?utm_source=chatgpt.com "Pino"
[5]: https://discord.com/developers/docs/interactions/receiving-and-responding?utm_source=chatgpt.com "Interactions | Documentation | Discord Developer Portal"
[6]: https://discord.com/developers/docs/components/reference?utm_source=chatgpt.com "Component Reference | Documentation"
[7]: https://discord.com/developers/docs/resources/channel?utm_source=chatgpt.com "Channels Resource | Documentation"
[8]: https://discord.com/developers/docs/interactions/application-commands?utm_source=chatgpt.com "Application Commands | Documentation"
[9]: https://discordjs.guide/slash-commands/response-methods?utm_source=chatgpt.com "Command Responses | discord.js"
