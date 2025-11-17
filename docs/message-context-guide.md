# Message Context Menu Guide

This guide explains how the four message context menus behave, how to verify them in a dev guild, and what to do if something looks off. All four commands share the same logging component (`proxy-context`) so you can trace every interaction end-to-end.

## Commands

| Command | Purpose |
| --- | --- |
| **Proxy as…** | Proxy the selected message’s content/attachments using one of your forms. Opens a modal so you can pick the form and tweak the content before sending. |
| **Edit proxied…** | Opens a modal preloaded with the proxied content so you can edit typos without touching the webhook manually. |
| **Delete proxied…** | Deletes the proxied webhook message (after verifying you own it) and removes the DB row. |
| **Who sent this?** | Shows an ephemeral summary containing original author, form name, timestamps, and jump links. |

All four commands are registered via `pnpm deploy:guild`/`pnpm deploy:global` along with the slash commands. Use `pnpm deploy:clear` if you need to delete stale commands before redeploying.

## Data dependencies

- Every proxied send inserts into `proxied_messages` with `user_id`, `form_id`, `webhook_id`, `webhook_token`, `message_id`, `source_message_id`, and guild/channel info.
- Context actions check both the stored record **and** the invoking user before allowing edits/deletes.
- Attachments are re-uploaded during proxy + edit flows, so keep S3/bucket credentials handy if you ever replace storage.

## Manual verification checklist

Perform these steps whenever you touch proxy context code (handlers, repos, ChannelProxyPort, etc.). Tail logs or `pnpm dev` output to confirm each stage logs `context_start`, `context_success`, or `context_error` with `component: "proxy-context"`.

1. **Proxy as…**
   - Right-click any human message → "Apps" → "Proxy as…".
   - Modal shows current content preview + form selector. Submit using a form you own.
   - Expect: webhook message appears with correct name/avatar, reply-style header (if the source replied), attachments preserved, and optional "delete source" behavior respected.
2. **Edit proxied…**
   - Right-click the webhook message you just created → "Edit proxied…".
   - Modal preloads content. Edit text and submit.
   - Expect: webhook message updates in-place, DB row remains, log shows `context_success`.
3. **Delete proxied…**
   - Right-click the same webhook message → "Delete proxied…".
   - Confirm the message disappears and the DB row is removed (log shows `delete_success`).
4. **Who sent this?**
   - Pick any proxied message (yours or someone else’s) → "Who sent this?".
   - Expect an ephemeral embed containing original user mention, form name/avatar, created timestamps, and Jump buttons back to the message/guild.

If any action fails, the handler should respond ephemerally with a friendly error while logging the stack via `handleInteractionError`.

## Troubleshooting tips

- **Commands missing?** Run `pnpm deploy:guild` again (guild commands are instant). Use `pnpm deploy:clear` if Discord still shows stale context menus.
- **Webhook edits returning 404?** The stored `webhook_id`/`webhook_token` may be stale. Check `proxied_messages` for the selected message id. If tokens expired, delete the row and force the user to resend.
- **Permission errors?** Context actions only work for the user who proxied the message (or for moderators once we add override rules). Confirm the selected message’s `user_id` matches.

_Last updated: 2025-02-17_
