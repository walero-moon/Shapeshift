# Proxy Latency – Option B Execution Plan

## 1. Objective

Cut the perceived delay between the user’s message and the proxied webhook message by **parallelizing the proxy pipeline** and **streaming attachment reuploads**. Measurable target: attachment-heavy proxied messages complete within ~1 s plus Discord API latency, instead of the current multi-second stall.

## 2. Current Pain Points

- `messageCreate.proxy.ts` awaits every step in sequence (alias lookup, form fetch, permission fetch twice, attachment download, reply fetch, proxy send, delete). Each remote hop adds hundreds of milliseconds.
- Attachments are buffered via `arrayBuffer()` before webhook send, so large files block the entire operation.
- Permissions fetch (`guild.members.fetch`) is invoked twice per message because we re-check after collecting attachments.
- We delete the user’s original message only after everything succeeds, so rate limits on deletion keep the webhook from appearing.
- No instrumentation is available to confirm where time is spent.

## 3. Implementation Plan

### 3.1 Instrumentation & Concurrency (messageCreate proxy listener)

- Add per-stage timers using `performance.now()` or `Date.now()`:
  - `aliasMatch`, `formFetch`, `memberFetch`, `attachments`, `replyFetch`, `proxySend`, `delete`.
- Log each stage’s duration with `log.debug('Proxy stage complete', { stage, durationMs, ...context })`.
- Kick off independent tasks in parallel using `Promise.all` / `Promise.allSettled`:
  - `aliasMatchPromise` → fetch aliases + match.
  - `formPromise` → fetch form (or defer to coordinator).
  - `memberPromise` → fetch `GuildMember` once; reuse for permission checks.
  - `attachmentsPromise` → only if `message.attachments.size > 0`; triggers new streaming helper.
  - `replyFetchPromise` → only if we’re replying; fetch target message concurrently with attachments.
- Await the minimum data required before calling `proxyCoordinator`.
- After webhook send succeeds, invoke `void handleDegradedModeError(() => message.delete(), context, undefined, 'delete proxied source')` so the delete happens asynchronously.

### 3.2 Streaming Attachment Reuploads

- Update `reuploadAttachments` to:
  - Stream data using `Readable.fromWeb(response.body)` (Node 18+) or manual reader conversion.
  - Return objects shaped like `{ name, data: Readable | Buffer }` to support streaming all the way to Discord REST.
  - Continue retry logic; log chunk failures.
- Ensure small files still work (fallback to buffer if `response.body` is undefined).

### 3.3 Channel Proxy & Port Adjustments

- Extend `ProxyAttachment` (`src/shared/ports/ChannelProxyPort.ts`) so `data` accepts `Buffer | NodeJS.ReadableStream`.
- In `DiscordChannelProxy.send`/`edit`, pass `files` **outside** the JSON body (Discord REST expects top-level `files` so `@discordjs/rest` can build multipart payloads). Each file should be `{ name, data: Readable | Buffer }`.
- Preserve Allowed Mentions handling and reply-style logic.

### 3.4 Permission Helper Improvements

- Modify `validateUserChannelPerms` to accept an optional pre-fetched `GuildMember`.
- In the listener, call the helper twice (base + attachments) but pass the same `member` to avoid duplicate REST calls. Optimize the helper to skip re-fetch when a member is provided.

### 3.5 Proxy Coordinator Adjustments

- Allow `proxyCoordinator` to accept an optional `form` argument and skip the redundant DB fetch when provided.
- Ensure logging still contains `formId`/`userId`.

### 3.6 Documentation Update

- Keep this plan (Option B) in `docs/proxy-latency-plan.md`.
- Document new logging fields / stage timings for other contributors.

## 4. Files to Modify

| File | Purpose |
| --- | --- |
| `src/adapters/discord/listeners/messageCreate.proxy.ts` | Add timers, parallel tasks, single member fetch, async delete |
| `src/shared/utils/attachments.ts` | Implement streaming attachment downloads |
| `src/shared/ports/ChannelProxyPort.ts` | Update `ProxyAttachment` shape for streams |
| `src/adapters/discord/DiscordChannelProxy.ts` | Handle streamed `files`, move `files` out of JSON body |
| `src/features/proxy/app/ValidateUserChannelPerms.ts` | Accept cached member |
| `src/features/proxy/app/ProxyCoordinator.ts` | Accept optional pre-fetched form |
| `src/features/proxy/tests/proxy.listener.test.ts` (or new tests) | Assert concurrency behavior & delete fire-and-forget |
| `src/shared/utils/tests/attachments.test.ts` (new) | Coverage for streaming helper, retry logic |
| `src/features/proxy/tests/proxy.discordChannelProxy.test.ts` | Ensure top-level attachments/stream support |
| `docs/proxy-latency-plan.md` | This plan (kept up to date) |

## 5. Acceptance Criteria

1. **Latency Metrics**: Stage-duration logs appear for alias match, permissions, attachments, reply fetch, proxy send, delete. Manual testing shows attachment-heavy proxy path completing faster (log durations <~1000 ms for attachments on <5 MB files).
2. **Correctness**: Attachments, reply-style headers, and Allowed Mentions still behave as before. No regression in proxy pipeline tests.
3. **Performance**: Only one guild member fetch per message (verified via test mocks or spy counts). Message deletion no longer delays webhook replies.
4. **Stability**: `pnpm build`, `pnpm lint`, and `pnpm test` succeed. New streaming helper has unit coverage; DiscordChannelProxy tests validate file payload structure.
5. **Logging**: Failure paths still flow through `handleDegradedModeError` and `handleWebhookError`. New logs include `stage` and `durationMs`.

## 6. Test & Verification Plan

1. **Automated tests**
   - Extend proxy listener tests to spy on `guild.members.fetch` (should be called once).
   - Add tests covering concurrent attachment download + alias matching (mock with delays to ensure `Promise.all` is used).
   - New tests in `attachments.test.ts` verifying streaming fallback and retry exhaustion.
   - Update Discord channel proxy tests to expect top-level `files`.
2. **Manual tests**
   - `pnpm dev`, send proxy messages with/without attachments, with/without reply context; confirm stage logs, quicker webhook send, asynchronous delete.
   - Attach large files (e.g., 8 MB) to ensure streaming pipeline handles them without blocking the rest of the flow.
3. **Metrics review**
   - Tail logs locally to confirm stage durations and error handling.

## 7. Risks & Mitigations

- **Complexity**: Parallel Promise handling must guard against rejected promises causing unhandled exceptions. Use `Promise.allSettled` and explicit error handling with `handleDegradedModeError`.
- **Streaming compatibility**: Ensure Node version supports `Readable.fromWeb`; add fallback (buffer) to avoid crashes on unsupported environments.
- **Delete race conditions**: Fire-and-forget delete may fail silently; continue logging via `handleDegradedModeError` to keep observability.

## 8. Task Breakdown (Option B implementation)

> **Format note:** To keep the actionable task list between 50–100 lines while preserving clarity, each task below calls out the exact files, concrete edits, and verification/acceptance criteria concisely. Engineers should expand into subtasks in their preferred tracker as needed.

1. **Add stage instrumentation in `messageCreate.proxy.ts`**
   - *What*: Wrap each pipeline block with `const start = performance.now()` and log `durationMs`.
   - *Why*: Provides metrics to verify improvements and detect regressions.
   - *Tests*: Extend `proxy.listener.test.ts` (or add new test) to assert log metadata contains `stage`.
   - *Acceptance*: Logs show stage names/durations for alias, perms, attachments, reply, send, delete without breaking existing behavior.

2. **Single guild member fetch**
   - *What*: In `messageCreate.proxy.ts`, call `message.guild.members.fetch` once, pass result to both permission checks; update `validateUserChannelPerms` to accept optional `GuildMember`.
   - *Why*: Avoid double HTTP latency per message.
   - *Tests*: Mock `guild.members.fetch` in listener test to verify single invocation.
   - *Acceptance*: Permission logic unchanged, but network call count drops to one per message.

3. **Parallelize alias/form/member/attachment/reply fetches**
   - *What*: Use `Promise.allSettled` to kick off `matchAlias`, `formRepo.getById`, member fetch, attachment download, and reply fetch simultaneously.
   - *Why*: Reduce end-to-end latency by overlapping IO.
   - *Tests*: Add test with artificial delays (mocked Promises) to ensure concurrency (e.g., check start times or invocation ordering).
   - *Acceptance*: Pipeline still handles errors gracefully; stage logs show overlapping durations.

4. **Streaming attachment reupload helper**
   - *What*: Rewrite `reuploadAttachments` to stream via `Readable.fromWeb(response.body)`; fallback to buffers if stream unavailable.
   - *Why*: Prevent large files from blocking the entire process and reduce memory footprint.
   - *Tests*: New `attachments.test.ts` validating streaming path, fallback, and retry behavior on simulated failures.
   - *Acceptance*: Attachments of varying sizes still arrive intact; helper logs failures and respects retry policy.

5. **Channel proxy updates for streamed files**
   - *What*: Update `ChannelProxyPort.ProxyAttachment` type to accept `Buffer | Readable`; adjust `DiscordChannelProxy.send/edit` to pass `files` at top-level with streaming data.
   - *Why*: Required to deliver streamed attachments to Discord webhooks.
   - *Tests*: `proxy.discordChannelProxy.test.ts` asserts `client.rest.post` receives top-level `files` and supports readable streams.
   - *Acceptance*: Webhook sends/edits keep attachments; Discord API payload stays valid.

6. **ProxyCoordinator form reuse**
   - *What*: Allow `proxyCoordinator` to accept an optional `form` argument; skip redundant fetch when provided.
   - *Why*: Removes extra DB round trip after initial fetch in listener.
   - *Tests*: Update coordinator tests to cover both paths (with and without pre-fetched form).
   - *Acceptance*: Behavior unchanged; logs still contain form metadata while DB is queried only once per message.

7. **Asynchronous source-message delete**
   - *What*: After successful webhook send, call `handleDegradedModeError` on `message.delete()` without awaiting; log success/failure.
   - *Why*: Prevent delete latency/rate limits from delaying webhook response.
   - *Tests*: Listener test ensures delete is invoked via `handleDegradedModeError` and does not block `proxyCoordinator`.
   - *Acceptance*: Original message still removed (when possible); webhook send completion no longer depends on delete timing.

8. **Documentation & verification updates**
   - *What*: Update this doc’s “Last updated” timestamp, describe new stage logs/streaming behavior; add manual test checklist.
   - *Why*: Keep contributors aligned on the implemented approach.
   - *Tests*: n/a (doc change).
   - *Acceptance*: Doc reflects final behavior; manual test instructions include attachment/reply flows.

---

*Last updated:* <!-- update when implementing -->
