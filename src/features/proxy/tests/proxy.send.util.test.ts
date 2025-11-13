import { describe, it, expect } from 'vitest';
import { assembleWebhookPayload } from '../discord/send.util';

describe('assembleWebhookPayload', () => {
    it('should assemble payload without reply-style', () => {
        const result = assembleWebhookPayload('Hello world', null);

        expect(result.content).toBe('Hello world');
        expect(result.components).toEqual([]);
        expect(result.allowedMentions).toEqual({ parse: [] });
    });

    it('should assemble payload with reply-style without jump button', () => {
        const replyStyle = {
            headerLine: '-# ↩︎ Replying to <@123>',
            quoteLine: 'This is a quote',
            allowedMentions: { parse: ['users'], repliedUser: false },
        };

        const result = assembleWebhookPayload('Hello world', replyStyle);

        expect(result.content).toBe('-# ↩︎ Replying to <@123>\nThis is a quote\nHello world');
        expect(result.components).toEqual([]);
        expect(result.allowedMentions).toEqual({ parse: ['users'], repliedUser: false });
    });

    it('should assemble payload with reply-style and jump button', () => {
        const replyStyle = {
            headerLine: '-# ↩︎ Replying to <@123>',
            quoteLine: 'This is a quote',
            jumpUrl: 'https://discord.com/channels/123/456/789',
            allowedMentions: { parse: ['users'], repliedUser: false },
        };

        const result = assembleWebhookPayload('Hello world', replyStyle);

        expect(result.content).toBe('-# ↩︎ Replying to <@123>\nThis is a quote\nHello world');
        expect(result.components).toEqual([{
            type: 1,
            components: [{
                type: 2,
                style: 5,
                label: 'Jump',
                url: 'https://discord.com/channels/123/456/789'
            }]
        }]);
        expect(result.allowedMentions).toEqual({ parse: ['users'], repliedUser: false });
    });

    it('should trim content if total exceeds 2000 chars', () => {
        const longContent = 'a'.repeat(1990);
        const replyStyle = {
            headerLine: '-# ↩︎ Replying to <@123>',
            quoteLine: 'This is a quote',
            allowedMentions: { parse: ['users'], repliedUser: false },
        };

        const result = assembleWebhookPayload(longContent, replyStyle);

        expect(result.content.length).toBeLessThanOrEqual(2000);
        expect(result.content).toContain('...');
    });
});