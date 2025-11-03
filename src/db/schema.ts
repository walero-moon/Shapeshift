import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = integer('id').primaryKey({ autoIncrement: true });
const createdAt = integer('created_at', { mode: 'timestamp' }).default(
  sql`(strftime('%s', 'now'))`,
);

export const systems = sqliteTable('systems', {
  id,
  ownerUserId: text('owner_user_id').notNull(),
  displayName: text('display_name'),
  createdAt,
}, (table) => ({
  ownerUserIdIdx: uniqueIndex('owner_user_id_idx').on(table.ownerUserId),
}));

export const members = sqliteTable('members', {
  id,
  systemId: integer('system_id')
    .notNull()
    .references(() => systems.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt,
});

export const proxiedMessages = sqliteTable('proxied_messages', {
  id,
  originalMessageId: text('original_message_id').notNull(),
  webhookMessageId: text('webhook_message_id').notNull(),
  webhookId: text('webhook_id').notNull(),
  channelId: text('channel_id').notNull(),
  actorUserId: text('actor_user_id').notNull(),
  memberId: integer('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  createdAt,
}, (table) => ({
  originalMessageIdIdx: uniqueIndex('original_message_id_idx').on(table.originalMessageId),
  webhookMessageIdIdx: uniqueIndex('webhook_message_id_idx').on(table.webhookMessageId),
}));

export const guildConfigs = sqliteTable('guild_configs', {
  guildId: text('guild_id').primaryKey(),
  logChannelId: text('log_channel_id'),
  deleteOriginalOnProxy: integer('delete_original_on_proxy').default(0),
  tagProxyEnabled: integer('tag_proxy_enabled').default(0),
});