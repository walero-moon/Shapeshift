# Shapeshift Discord Bot – Current Deficiency Report

## Executive Summary
The codebase has made progress toward the architecture described in `AGENTS.md`, but multiple regressions block a production-ready release. Critical gaps include broken interaction flows (the `/form edit` modal cannot open), alias automation bugs that prevent default triggers from being created, improper webhook payload assembly that drops attachments, and extensive reliance on `console.*` logging despite the mandated Pino logger. In addition, the proxy surface lacks the promised context menus and edit/delete flows, and several repositories re-query entire tables on every call, leading to O(n) work per message. This document catalogs the most pressing issues, their impact, and why they deviate from the desired architecture.

---

## 1. Observability & Error Handling Gaps
1. **Console logging still dominates** — The ready event prints ASCII art via `console.log` rather than structured Pino logs, and the message proxy listener spams `console.log`/`console.error` throughout its control flow. This violates the "Pino everywhere" requirement and floods stdout with noisy debug output instead of structured context-rich events.【F:src/index.ts†L18-L35】【F:src/adapters/discord/listeners/messageCreate.proxy.ts†L15-L190】
2. **Autocomplete handlers ignore error utilities** — `/send` and `/alias` autocomplete handlers fall back to `console.error` and return empty arrays. They never use `handleInteractionError` nor log via `log.*`, so failures become silent and untraceable in production logs.【F:src/features/proxy/discord/send.autocomplete.ts†L4-L35】【F:src/features/identity/discord/alias.autocomplete.ts†L1-L35】
3. **Graceful degradation hides real faults** — `listAliases` catches *any* error (including "form not found") and returns an empty payload with a blank form name, so `/alias list` will render "Aliases for  ()" instead of surfacing ownership violations. This directly contradicts the UX guidance that validation errors should surface clear user feedback.【F:src/features/identity/app/ListAliases.ts†L27-L74】

**Impact:** Production log streams cannot be correlated across services, and user-facing bugs (bad form IDs, DB outages) silently downgrade to "no data" states, preventing moderators from diagnosing issues.

---

## 2. Interaction Flow Breakages
1. **`/form edit` double-acks the interaction** — The command immediately calls `interaction.deferReply()` and *then* `interaction.showModal()`. Discord forbids acknowledging an interaction twice, so the modal throws `InteractionAlreadyReplied` and never appears. The paired modal submit handler then calls `interaction.deferUpdate()` (which expects a component interaction) before attempting `editReply`, so even if the modal opened the acknowledgement path would still be invalid.【F:src/features/identity/discord/form.edit.ts†L25-L140】
2. **`handleInteractionError` never runs for modal failures** — Because `handleModalSubmit` throws before any `try/catch`, ownership or validation errors bubble all the way up to the global interaction handler, which responds with the generic "There was an error" message instead of the specific validation copy mandated in `AGENTS.md`. The UX for editing forms is therefore completely broken.

**Impact:** Users cannot edit forms at all, and reviewers cannot verify the modal UX described in the roadmap.

---

## 3. Identity Use-case Bugs
1. **Default short aliases never get created** — `createForm` only attempts the `<first-letter>:text` alias when `firstLetter !== name.charAt(0)`, but those two expressions are always equal. Every form therefore misses its short alias, contradicting the auto-default policy described in `AGENTS.md`. Collision detection for short aliases is never exercised.【F:src/features/identity/app/CreateForm.ts†L55-L113】
2. **Case-sensitive import typo** — `CreateForm`, `AddAlias`, and multiple tests import `./NormalizeAlias`, but the file on disk is `normalizeAlias.ts`. This works on macOS but fails on Linux/CI, preventing the project from compiling in the target Docker images.【F:src/features/identity/app/CreateForm.ts†L1-L4】【F:src/features/identity/app/AddAlias.ts†L1-L4】
3. **Alias removal scans entire tables** — `removeAlias` fetches every alias for a user (`aliasRepo.getByUser`) on each deletion just to find one ID. This is O(n) per call, wastes memory, and risks race conditions if the alias disappears between the scan and the delete. A `getById` repository method is required for vertical-slice isolation.【F:src/features/identity/app/RemoveAlias.ts†L10-L23】

**Impact:** Users do not receive the expected default triggers, CLI builds fail on Linux, and alias management does not scale.

---

## 4. Proxy & Webhook Pipeline Defects
1. **Webhook attachments are dropped** — `DiscordChannelProxy.send` passes `files` inside the JSON `body` when calling `client.rest.post`. The REST client expects `files` at the top level (outside the JSON body), so attachments are silently ignored. Reply-style messages therefore lose images and reuploaded files, contradicting the "Proxy attachments" requirement.【F:src/adapters/discord/DiscordChannelProxy.ts†L90-L107】
2. **Channel validation relies on brittle `type === 1` checks** — The `/send` command treats `interaction.channel.type === 1` as the DM guard and casts `interaction.channel as any` twice when checking permissions. This makes the handler dependent on Discord.js internal enums instead of the provided `ChannelType.DM`, and bypasses TypeScript entirely, which is the opposite of the "ports & adapters" discipline.【F:src/features/proxy/discord/send.ts†L111-L147】
3. **Tag proxying does O(n) alias scans per message** — `matchAlias` fetches all aliases for the user on every message and iterates them in JavaScript to find matches. Combined with `listForms` performing per-form alias queries, a single message can trigger dozens of sequential DB hits. No caching or prefix tree exists, so proxy throughput degrades as users add aliases.【F:src/features/proxy/app/MatchAlias.ts†L21-L101】【F:src/features/identity/app/ListForms.ts†L21-L44】
4. **Listener still contains debug console noise** — Even after adopting the logging wrapper, the tag listener still prints every branch via `console.log`. This both spams stdout and exposes potentially sensitive message content in plain text, violating the "Allowed Mentions" safety goal.【F:src/adapters/discord/listeners/messageCreate.proxy.ts†L15-L190】

**Impact:** Proxy messages cannot carry attachments reliably, DM guards are brittle, and DB load scales linearly with alias count, threatening rate limits.

---

## 5. Architectural Drift & Duplication
1. **Shared logic is copy/pasted** — The `/form`, `/alias`, and `/send` autocomplete handlers are identical slices of code that filter `listForms`. Instead of exposing a Discord-agnostic "list user forms for autocomplete" use-case in the `app/` layer, every handler reimplements the same logic (and the same error handling bug).【F:src/features/identity/discord/form.autocomplete.ts†L1-L18】【F:src/features/identity/discord/alias.autocomplete.ts†L1-L35】【F:src/features/proxy/discord/send.autocomplete.ts†L4-L35】
2. **Feature surface is incomplete relative to the roadmap** — The proxy slice exports only `/send` plus the tag listener; `registry.ts` registers no message context menus (Proxy As…, Edit proxied…, Delete proxied…, Who sent this?). Likewise, there are no edit/delete use-cases consuming the stored webhook IDs in `proxied_messages`. This diverges from steps 5–6 in `AGENTS.md` and from the README feature list.【F:src/adapters/discord/registry.ts†L79-L101】【F:src/features/proxy/discord/send.ts†L1-L194】
3. **Docker "migrate" service launches the bot** — `docker-compose.yml` defines a `migrate` profile that runs `pnpm db:generate && pnpm db:migrate && node dist/index.js`. That service is supposed to run migrations only, yet it also boots the bot inside the same container. Because the production image only copies `dist/` plus `schema.ts`, `drizzle-kit generate` cannot see the rest of `src/`, so this service both fails and muddles responsibilities.【F:docker-compose.yml†L24-L36】
4. **Unit tests are placeholders** — The top-level `tests/simple.test.js` only asserts `true === true`, providing no coverage for the real features, even though there is a `tests` folder in the repo. This contradicts the Quality Gate section that demands meaningful tests before declaring a PR done.【F:tests/simple.test.js†L1-L6】

**Impact:** The current structure duplicates code across features, leaves critical roadmap items unimplemented, and introduces infrastructure tasks that can never pass in CI/CD.

---

## 6. Prioritized Remediation Plan
1. **Fix broken flows first (critical):**
   - Remove `deferReply` from `/form edit`, show the modal within 3s, and replace `deferUpdate` with `deferReply` in `handleModalSubmit`. Provide targeted validation errors instead of generic fallbacks.
   - Correct the short-alias condition in `createForm` and add regression tests to ensure both default aliases are created.
   - Move webhook attachment payloads out of the JSON body and into the REST client's `files` option so `/send` and tag proxies can deliver files again.
2. **Restore observability (high):**
   - Replace every `console.*` call with the shared logger (ready event, listener, autocomplete handlers) and thread contextual fields (`component`, `userId`, etc.).
   - Teach autocomplete handlers to surface actionable errors (e.g., "Failed to load forms") instead of silently returning `[]`.
3. **Eliminate O(n) scans (medium):**
   - Introduce repository helpers (`getAliasById`, `listAliasesByUserGrouped`) so `removeAlias`, `matchAlias`, and `listForms` can issue targeted queries.
   - Cache alias lists per user (in-memory or Redis) with invalidation on write to honor the "longest prefix wins" rule without hammering the database.
4. **Finish the promised proxy surface (medium):**
   - Implement the message context menus and edit/delete flows, wiring them through `ChannelProxyPort.edit/delete` and the stored webhook IDs.
   - Add reply-style rendering to `/send` replies (currently only the listener builds reply headers via `buildReplyStyle`).
5. **Stabilize infrastructure (medium):**
   - Split the Docker "migrate" service into a pure migration runner and a separate runtime. Ship the entire source tree (or at least the schema dependencies) required by `drizzle-kit generate`.
   - Replace the placeholder unit tests with slice-level coverage (e.g., normalization, alias matching, proxy coordinator).

---

## Review Guide
Start by examining the interaction regressions in `src/features/identity/discord/form.edit.ts`, then verify the corrected alias defaults in `src/features/identity/app/CreateForm.ts`, and finally inspect `src/adapters/discord/DiscordChannelProxy.ts` to ensure webhook payloads (especially attachments) conform to Discord's REST contract. These three files drive the majority of the user-facing breakages outlined above.
