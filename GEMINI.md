# GEMINI.md

> Project brief and build guide for an AI teammate to implement a **PluralKit-lite** Discord bot using **TypeScript + discord.js (latest)** with **SQLite**. This document captures scope, architecture, decisions, tasks, and testing strategy so you can code confidently without copying any PluralKit code.

---

## 1) What we’re building (MVP)

**Goal**
A small, robust proxy bot that lets a user:

* Create a **system** (one per Discord user).
* Add **members** (name + optional avatar URL).
* **Proxy** messages via **channel webhooks** so the message appears with the member’s name and avatar.
* **Respect the originating user’s channel permissions** (no embeds/attachments/mentions the user couldn’t use).
* **Delete** proxied messages via: message **context menu**, **🗑️ reaction**, and optional **reply keyword**.

**Note**: Do not execute the application after completing tasks; instead, focus solely on ensuring the code lints without errors, builds successfully, and all tests pass.

**Non-Goals (for now)**
Autoproxy, groups/switches/privacy, edits/reproxy, API/dashboard.

**Why webhooks?**
Discord webhooks allow **per-message** overrides of `username` and `avatar_url`, so we don’t have to mutate the webhook between sends; each send carries its own identity. ([discord.com][1])

---

## 2) Runtime & dependencies

* **Node.js**: Use the version required by `discord.js` (currently **Node 22.12+** per docs). ([discord.js][2])
* **discord.js**: v14 (current docs), slash + context commands, REST v10. ([discord.js][2])
* **SQLite** via **Drizzle ORM** + **better-sqlite3** (type-safe, file-backed; fast local dev).
* Optional: **zod** for env validation; a tiny logger.

**Privileged intents note**
We do **not** need Message Content for the MVP (slash/context first). If you later enable reply-keyword delete or tag proxying, Message Content intent is required (<100 servers doesn’t need review; ≥100 needs approval). ([support-dev.discord.com][3])

---

## 3) Architecture overview

**Monolith, modular**

* **Discord adapter layer**: event/listener plumbing, command routing.
* **Domain services**: `SystemService`, `MemberService`, `ProxyService`, `DeleteService`, `WebhookRegistry`.
* **Middleware**: `PermissionGuard` that shapes outgoing messages to the caller’s effective channel perms.
* **Persistence**: SQLite schema (systems, members, proxied_messages).

**Key Discord design decisions**

* **One webhook per channel**, created on demand and cached. Never PATCH the webhook to change identity; set `username` + `avatar_url` on **each Execute Webhook** call. ([discord.com][1])
* **Respect permissions** with `GuildMember.permissionsIn(channel)` and adapt:

  * No **Embed Links** → send with **SUPPRESS_EMBEDS**. ([discord.js][4])
  * No **Attach Files** → drop attachments.
  * No **Mention Everyone** → `allowed_mentions` excludes everyone/here/roles. ([discord.js][5])
* **Slash & context menus** as primary UX (context menu: “Delete proxied message”). ([discord.com][6])
* **Reactions** for 🗑️ delete require **partials** for Messages/Reactions to handle uncached events. ([discordjs.guide][7])
* **Rate limits**: normal REST buckets + global (50 rps) apply; treat webhook sends like any other REST call and let discord.js queue/backoff. Avoid relying on undocumented per-webhook numbers. ([discord.com][8])

**Data model (SQLite, Drizzle)**

```
systems:           id (pk), owner_user_id, display_name, created_at
members:           id (pk), system_id (fk), name, avatar_url, created_at
proxied_messages:  id (pk), original_message_id, webhook_message_id,
                   webhook_id, channel_id, actor_user_id, member_id, created_at
```

**Folder layout**

```
src/
  index.ts
  config/
    env.ts
  discord/
    client.ts
    commands/
      system.create.ts
      member.add.ts
      proxy.delete.ts
    contexts/
      deleteProxied.ts
    listeners/
      interactionCreate.ts
      messageReactionAdd.ts
      messageCreate.ts            (feature-flagged; optional)
    middleware/
      permissionGuard.ts
    services/
      WebhookRegistry.ts
      ProxyService.ts
      DeleteService.ts
      SystemService.ts
      MemberService.ts
    utils/
      allowedMentions.ts
      attachments.ts
      username.ts
  db/
    client.ts
    schema.ts
    migrations/
  docs/
    decisions/
```

---

## 4) Permission model (how we “respect perms”)

At proxy time, compute the **invoking user’s** effective channel permissions and adapt the outgoing webhook payload:

* If missing **Send Messages** → refuse proxy.
* If missing **Embed Links** → set **message flags** to **SuppressEmbeds** for that send. ([discord.js][4])
* If missing **Attach Files** → ignore attachments.
* If missing **Mention Everyone** → build `allowed_mentions` that excludes everyone/here/roles (allow only explicit user IDs). ([discord.js][5])

---

## 5) Webhook strategy

* **Get/Create** exactly one incoming webhook per channel and cache it (id + token kept in memory).
* For every proxied message, call **Execute Webhook** and pass `username` (1–80 chars) + `avatar_url` **per message**. ([discord.com][1])
* Store `{webhookId, webhookMessageId}` in `proxied_messages` for later **delete** or future **edit** (`Edit Webhook Message`). ([discord.com][1])
* You generally don’t need multiple webhooks per channel. (Discord has historically enforced small per-channel webhook caps; design for **one per channel** by default.) ([GitHub][9])

---

## 6) Commands & events (MVP)

* `/system create [display_name]` → ensures one system per user.
* `/member add <name> [avatar_url]` → adds member under caller’s system (name clamped to 1–80 chars for webhook username safety). ([discord.com][1])
* **Delete paths**

  * **Message context menu**: “Delete proxied message”. ([discordjs.guide][10])
  * **🗑️ reaction** on the proxied message (partials required). ([discordjs.guide][7])
  * **Reply keyword** (optional, feature-flagged; requires Message Content if enabled later). ([support-dev.discord.com][3])

Authorization to delete: original actor **or** user with **Manage Messages** in that channel.

---

## 7) Tasks (PR-sized, ~≤400 LOC each)

**T1 — Repo bootstrap & standards**
Tooling, TypeScript strict ESM, basic scripts; no bot logic.

**T2 — Env validation**
`config/env.ts` with zod; require `DISCORD_TOKEN`, `CLIENT_ID`, `DATABASE_PATH`.

**T3 — Database foundation (SQLite + Drizzle)**
`db/client.ts`, `db/schema.ts`, init + first migration; tables as in §3.

**T4 — Discord client init**
`discord/client.ts`, register **intents** (Guilds, GuildMessages, GuildMessageReactions) and **partials** (Message, Reaction); stub listeners. ([discord.js][11])

**T5 — Command/Context registration**
File-based loaders + `scripts/register-commands.ts`. Support **message context menu**. ([discordjs.guide][10])

**T6 — SystemService + `/system create`**
Idempotent create; ephemeral success.

**T7 — MemberService + `/member add`**
Validate name (1–80) & optional avatar URL; store.

**T8 — WebhookRegistry**
Per-channel get/create; in-memory cache; never PATCH name/avatar (we override per message). ([discord.com][1])

**T9 — PermissionGuard + utils**
`permissionGuard.ts`, `allowedMentions.ts`, `attachments.ts`; implement the four checks in §4 using `permissionsIn`. ([discord.js][5])

**T10 — ProxyService (sendProxied)**
Resolve member → name/avatar; apply PermissionGuard; **Execute Webhook** with overrides; persist to `proxied_messages`. ([discord.com][1])

**T11 — Delete via context menu**
`contexts/deleteProxied.ts` → lookup row, auth check, delete via webhook (preferred) or via bot if permitted.

**T12 — Delete via 🗑️ reaction**
Full `messageReactionAdd` handler; requires partials so it works on uncached messages. ([discordjs.guide][7])

**T13 — Delete via reply keyword (optional)**
Feature-flagged; document Message Content requirement. ([support-dev.discord.com][3])

**T14 — Logging & observability**
Structured logs for proxy attempts, permission denials, webhook create, deletes, rate-limit retries.

**T15 — Docs**
README quickstart + `docs/decisions/0001-architecture.md` (summarize §2–§6 with links).

Each task includes unit tests where feasible (see §9).

---

## 8) Implementation guidance (do/don’t)

**Do**

* Prefer **slash/context** interactions as primary UX. ([discord.com][6])
* Use **per-message** webhook `username`/`avatar_url` overrides; don’t patch the webhook between sends. ([discord.com][1])
* Clamp webhook usernames to **1–80 chars**. ([Discord Userdoccers][12])
* Build **`allowed_mentions`** defensively (no everyone/here/roles unless the user has the permission). ([discord.js][5])
* Use **SuppressEmbeds** flag when user lacks **Embed Links**. ([discord.js][4])
* Enable **partials** to make reaction deletes reliable. ([discordjs.guide][7])
* Let discord.js REST client handle **rate limits**; keep sends idempotent/retriable. ([discord.com][8])

**Don’t**

* Don’t copy code from PluralKit (AGPL-3.0). We’re writing fresh TypeScript with clearer naming and smaller modules. (It’s fine to reference their **behavior** or public docs.) ([GitHub][13])
* Don’t depend on undocumented webhook limits; design for **one webhook per channel** and measure before adding pools. ([discord.com][8])

---

## 9) Testing strategy

**Unit tests (no gateway):**

* `WebhookRegistry` (creates once, returns cached).
* `PermissionGuard` matrix: {Embed Links, Attach Files, Mention Everyone} × allowed/denied → expected shaping.
* `ProxyService` returns saved row + calls Execute Webhook with expected overrides.

**Integration (Discord test guild):**

* Register commands; create a system & member; invoke a proxied send (you can stub the send at first).
* Context menu delete: right-click → delete, verify message gone and row removed.
* Reaction delete: add 🗑️ as actor; verify deletion.

**Manual checks**

* Add a link when the actor **lacks** Embed Links: ensure the proxied message shows no embed. ([discord.js][4])
* Try `@everyone` without permission: ensure no ping (inspect `allowed_mentions`). ([discord.js][5])

---

## 10) Security & privacy

* Store webhook **tokens in memory only**; persist message IDs + webhook ID for deletes/edits later.
* Only request necessary **intents**; avoid Message Content unless a feature requires it. ([support-dev.discord.com][14])
* Use ephemeral replies for configuration confirmations. ([discord.com][15])
* Validate avatars are proper URLs; never fetch or proxy remote content server-side unnecessarily.

---

## 11) Future roadmap (not part of MVP)

* **Edit/Reproxy** via `Edit Webhook Message`. ([discord.com][1])
* **Autoproxy** modes (front/latch/member) behind clear UI and opt-ins. (PK feature reference only.) ([pluralkit.me][16])
* **Per-guild overrides** (member nickname/avatar).
* **Log channel** and mod tools.
* **API** & small dashboard.

---

## 12) Notes on PluralKit & originality

PluralKit is AGPL-3.0; we **will not** copy their source code. We’re free to **study behavior** (docs/UI) and implement our own clean, modular TypeScript version with better naming, clearer responsibilities, and test coverage. If any small implementation detail ends up looking similar (e.g., common command wording), that’s incidental to the domain. ([GitHub][13])

---

## 13) Quick links (for the implementer)

* **discord.js docs (latest)** – Node requirement, APIs, builders. ([discord.js][2])
* **Execute Webhook** – `username`, `avatar_url`, `allowed_mentions`, editing/deleting messages. ([discord.com][1])
* **Message flags** – `SuppressEmbeds`. ([discord.js][4])
* **Allowed mentions** – limit `@everyone/@here/roles`. ([discord.js][5])
* **Context menus** – message/user interactions. ([discordjs.guide][10])
* **Partials** – reactions on uncached messages. ([discordjs.guide][7])
* **Rate limits (global/buckets)** – rely on library backoff. ([discord.com][8])
* **PluralKit user docs (reference only)** – behavior surface. ([pluralkit.me][16])

[1]: https://discord.com/developers/docs/resources/webhook?utm_source=chatgpt.com "Webhook Resource | Documentation"
[2]: https://discord.js.org/docs?utm_source=chatgpt.com "discord.js (14.24.2)"
[3]: https://support-dev.discord.com/hc/en-us/articles/5324827539479-Message-Content-Intent-Review-Policy?utm_source=chatgpt.com "Message Content Intent Review Policy - Developers - Discord"
[4]: https://discord.js.org/docs/packages/core/main/MessageFlags%3AEnum?utm_source=chatgpt.com "MessageFlags (core - main)"
[5]: https://discord.js.org/docs/packages/discord-api-types/main/v10/AllowedMentionsTypes%3AEnum?utm_source=chatgpt.com "AllowedMentionsTypes (discord-api-types - main)"
[6]: https://discord.com/developers/docs/interactions/application-commands?utm_source=chatgpt.com "Application Commands | Documentation"
[7]: https://www.discordjs.guide/legacy/popular-topics/partials?utm_source=chatgpt.com "Partials | discord.js"
[8]: https://discord.com/developers/docs/topics/rate-limits?utm_source=chatgpt.com "Rate Limits | Documentation | Discord Developer Portal"
[9]: https://github.com/discord/discord-api-docs/issues/2095?utm_source=chatgpt.com "Increase the channel webhook limit, or make a seperate ..."
[10]: https://discordjs.guide/interactions/context-menus?utm_source=chatgpt.com "Context Menus | discord.js"
[11]: https://discord.js.org/docs/packages/discord.js/main/Partials%3AEnum?utm_source=chatgpt.com "Partials (discord.js - main)"
[12]: https://docs.discord.food/resources/webhook?utm_source=chatgpt.com "Webhooks - Introduction | Discord Userdoccers"
[13]: https://github.com/PluralKit/PluralKit?utm_source=chatgpt.com "PluralKit"
[14]: https://support-dev.discord.com/hc/en-us/articles/6177533521047-Privileged-Intents-Best-Practices?utm_source=chatgpt.com "Privileged Intents Best Practices - Developers - Discord"
[15]: https://discord.com/developers/docs/interactions/receiving-and-responding?utm_source=chatgpt.com "Interactions | Documentation | Discord Developer Portal"
[16]: https://pluralkit.me/guide/?utm_source=chatgpt.com "User Guide"
