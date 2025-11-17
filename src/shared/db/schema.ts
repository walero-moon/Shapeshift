import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const forms = pgTable('forms', {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aliasKindEnum = pgEnum('alias_kind', ['prefix', 'pattern']);

export const aliases = pgTable('aliases', {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id').notNull(),
    formId: uuid('form_id').references(() => forms.id, { onDelete: 'cascade' }).notNull(),
    triggerRaw: text('trigger_raw').notNull(),
    triggerNorm: text('trigger_norm').notNull(),
    kind: aliasKindEnum('kind').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
    uniqueIndex('aliases_user_id_trigger_norm_unique').on(table.userId, table.triggerNorm),
]);

export const autoproxyModeEnum = pgEnum('autoproxy_mode', ['form', 'latch', 'front']);

export const autoproxyStates = pgTable('autoproxy_states', {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id').notNull(),
    guildId: text('guild_id'),
    channelId: text('channel_id'),
    mode: autoproxyModeEnum('mode').notNull(),
    formId: uuid('form_id').references(() => forms.id, { onDelete: 'cascade' }),
    lastFormId: uuid('last_form_id'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
    uniqueIndex('autoproxy_states_user_guild_channel_unique').on(table.userId, table.guildId.nullsFirst(), table.channelId.nullsFirst()),
]);

export const proxiedMessages = pgTable('proxied_messages', {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    userId: text('user_id').notNull(),
    formId: uuid('form_id').references(() => forms.id, { onDelete: 'cascade' }).notNull(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    webhookId: text('webhook_id').notNull(),
    webhookToken: text('webhook_token').notNull(),
    messageId: text('message_id').notNull(),
    sourceMessageId: text('source_message_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});