import { describe, expect, it } from 'vitest';
import { buildMessageUrl } from '../messageLink';

describe('buildMessageUrl', () => {
    it('returns existing Discord message URL', () => {
        expect(buildMessageUrl({
            url: 'https://discord.com/channels/g/c/m',
            guildId: 'guild',
            channelId: 'channel',
            messageId: 'message',
        })).toBe('https://discord.com/channels/g/c/m');
    });

    it('builds Discord message URL from identifiers', () => {
        expect(buildMessageUrl({
            guildId: 'guild',
            channelId: 'channel',
            messageId: 'message',
        })).toBe('https://discord.com/channels/guild/channel/message');
    });
});
