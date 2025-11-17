# Message Context Menu Feature Plan

## 1. Goal

Deliver the four promised message-context actions—**Proxy as…**, **Edit proxied…**, **Delete proxied…**, **Who sent this?**—so moderators and users can manage proxied content without slash commands. The experience must respect Discord limits (3 s acks, allowed mentions, component caps) and work end-to-end with stored webhook metadata.

---

## 2. Current Gaps

- No message-context commands are registered in the bot. Only `/send` and tag-listener proxying exist.
- The `proxied_messages` table stores webhook ids/tokens but there are no repositories/utilities to look up records by message id to support edit/delete/who-owns operations.
- There is no abstraction that tracks whether a target message belongs to our webhook.
- No UI flows (modals, selectors) exist for editing proxied messages or picking a form when using “Proxy as…” from an existing message.

---

## 3. Task Breakdown (50–100 lines total, high detail)P

1. **Repository support for proxied message lookups**
   - *What*: Extend `ProxiedMessageRepo` with methods `getByWebhookMessageId(messageId: string)`, `getBySourceMessageId(sourceMessageId: string)` (requires storing original user message id), and `deleteById`.
   - *Why*: Context actions need to verify ownership and fetch webhook credentials to edit/delete.
   - *Files*: `src/features/proxy/infra/ProxiedMessageRepo.ts`, schema updates if `source_message_id` isn’t stored yet (`src/shared/db/schema.ts`, add migration).
   - *Tests*: `src/features/proxy/tests/proxy.infra.test.ts` (new) verifying lookups; update existing tests to seed `sourceMessageId`.
   - *Acceptance*: Repo can fetch a record by proxied webhook message id and return webhook token/id/form info in <10 ms memory lookups.

2. **Persist source message id during tag proxy & `/send`**
   - *What*: Update `proxyCoordinator` callers to pass the original Discord message id (listener) or interaction id (for `/send`, store interaction response message id after send) so the DB knows the mapping.
   - *Why*: “Who sent this?” must know which stored record corresponds to the selected message.
   - *Files*: `src/features/proxy/app/ProxyCoordinator.ts`, call sites (`messageCreate.proxy.ts`, `/send` handler).
   - *Tests*: Extend `proxy.proxyCoordinator.test.ts` to assert the insert includes `sourceMessageId`.
   - *Acceptance*: Table rows include `source_message_id`, and historical data migration plan documented.

3. **Add Discord context menu registrations**
   - *What*: Define four message context menu handlers under `src/features/proxy/discord/context/` (new folder). Register them in `src/adapters/discord/registry.ts` similar to slash commands.
   - *Why*: Commands must appear in the message UI.
   - *Files*: new handlers (e.g., `proxy.context.proxyAs.ts`, `.edit.ts`, `.delete.ts`, `.who.ts`), update registry to register message commands and route interactions.
   - *Tests*: Unit tests for each handler to ensure they ack within 3 s and call the correct use-cases.
   - *Acceptance*: Running `pnpm deploy:guild` shows the four context menus.

4. **Implement “Proxy as…” handler**
   - *What*: When a user selects another message and chooses “Proxy as…”, open a modal with form picker + text preview. After submission, reuse the existing proxy pipeline (reupload attachments if needed) but attribute to the selected message content.
   - *Why*: Allows manual proxying of arbitrary messages.
   - *Files*: Handler (Discord layer) + new use-case `ProxyMessageContext.ts` in `features/proxy/app/`.
   - *Tests*: Unit tests verifying validations (e.g., cannot proxy bot/system messages, must own the form), integration test ensuring attachments send.
   - *Acceptance*: End-to-end manual test proves you can proxy another user’s content via context menu, original message optionally deleted based on user choice.

5. **Implement “Edit proxied…” handler**
   - *What*: Validate the target message is a proxied webhook message we own via `proxied_messages`. Show modal pre-filled with current content; on submit, fetch attachments and call `ChannelProxyPort.edit`.
   - *Files*: Handler + use-case `EditProxiedMessage.ts`, extend `ChannelProxyPort.edit` tests. Ensure `reuploadAttachments` can accept existing attachments (via Discord API `message.attachments` download).
   - *Tests*: Unit tests for permission checks (only owner can edit), repository lookup, and edit call. Integration test mocking Discord REST edit.
   - *Acceptance*: Editing a proxied message updates the webhook message, and DB record remains unchanged.

6. **Implement “Delete proxied…” handler**
   - *What*: Confirm the target message belongs to a stored `proxied_messages` record; delete via `ChannelProxyPort.delete`, then remove DB row.
   - *Files*: Handler, use-case `DeleteProxiedMessage.ts`, repo method `deleteById`.
   - *Tests*: Unit tests verifying unauthorized users get a friendly error, authorized deletes succeed and DB row removed.
   - *Acceptance*: Context delete removes the webhook message and DB entry within 3 s.

7. **Implement “Who sent this?” handler**
   - *What*: Lookup proxied record by message id; reply ephemerally with original user, form name, timestamps, and jump links.
   - *Files*: Handler + small use-case; extend repo to expose joined form info (name/avatar).
   - *Tests*: Unit tests covering not-found cases, unauthorized access.
   - *Acceptance*: Context action returns a tidy embed/ephemeral message summarizing authorship.

8. **Audit logging & metrics**
   - *What*: Ensure each handler logs via `log.info`/`log.warn` with context fields (`component: 'proxy-context'`, `interactionId`, etc.) and emits stage timings similar to Option B.
   - *Files*: Each handler file, `src/shared/utils/logger.ts` child loggers in contexts.
   - *Tests*: None (log behaviors exercised indirectly).
   - *Acceptance*: Kibana/log tail shows structured events for context operations.

9. **Documentation & manual verification**
   - *What*: Update `AGENTS.md` and `docs/proxy-latency-plan.md` (or new doc) with context-menu setup instructions, manual test checklist, and any migrations required.
   - *Why*: Future contributors need to know how to test/deploy the new commands.
   - *Acceptance*: README/AGENTS mention context menus + `pnpm deploy:guild` instructions; manual test log recorded (edit/delete/proxy/who flows).

---

*Last updated:* 2025-03-17 YYY-MM-DD placeholder; replace on implementation.
