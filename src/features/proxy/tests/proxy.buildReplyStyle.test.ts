import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildReplyStyle } from '../app/BuildReplyStyle';

// Mock the createSnippet utility
vi.mock('../../../shared/utils/snippet', () => ({
    createSnippet: vi.fn(),
}));

import { createSnippet } from '../../../shared/utils/snippet';

describe('buildReplyStyle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('reply style generation', () => {
        it('should generate header, quote, and jumpUrl with userId and messageUrl', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle('JohnDoe', 'https://discord.com/channels/123/456/789', 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe>');
            expect(result.quoteLine).toBe('test snippet');
            expect(result.jumpUrl).toBe('https://discord.com/channels/123/456/789');
            expect(result.allowedMentions).toEqual({ parse: ['users'], repliedUser: false });
        });

        it('should generate header and quote with userId but no messageUrl', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle('JohnDoe', null, 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe>');
            expect(result.quoteLine).toBe('test snippet');
            expect(result.jumpUrl).toBeUndefined();
            expect(result.allowedMentions).toEqual({ parse: ['users'], repliedUser: false });
        });

        it('should generate header and quote without userId but with messageUrl', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle(null, 'https://discord.com/channels/123/456/789', 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying');
            expect(result.quoteLine).toBe('test snippet');
            expect(result.jumpUrl).toBe('https://discord.com/channels/123/456/789');
            expect(result.allowedMentions).toEqual({ parse: ['users'], repliedUser: false });
        });

        it('should use createSnippet for content and trim quote if needed', () => {
            vi.mocked(createSnippet).mockReturnValue('This is a quote');

            const result = buildReplyStyle('JohnDoe', null, 'Hello world', false, false);

            expect(createSnippet).toHaveBeenCalledWith({
                content: 'Hello world',
                embeds: undefined,
                attachments: undefined,
            });
            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe>');
            expect(result.quoteLine).toBe('This is a quote');
        });

        it('should pass embeds placeholder to createSnippet', () => {
            vi.mocked(createSnippet).mockReturnValue('[embed]');

            const result = buildReplyStyle('JohnDoe', null, '', true, false);

            expect(createSnippet).toHaveBeenCalledWith({
                content: '',
                embeds: [{} as unknown],
                attachments: undefined,
            });
            expect(result.quoteLine).toBe('[embed]');
        });

        it('should pass attachments placeholder to createSnippet', () => {
            vi.mocked(createSnippet).mockReturnValue('[image]');

            const result = buildReplyStyle('JohnDoe', null, '', false, true);

            expect(createSnippet).toHaveBeenCalledWith({
                content: '',
                embeds: undefined,
                attachments: [{} as unknown],
            });
            expect(result.quoteLine).toBe('[image]');
        });

        it('should trim quote if header + quote + newline exceeds 2000 chars', () => {
            const longSnippet = 'a'.repeat(1980); // Make it long enough to trigger trimming
            vi.mocked(createSnippet).mockReturnValue(longSnippet);

            const result = buildReplyStyle('JohnDoe', null, 'a'.repeat(1980), false, false);

            const totalLength = result.headerLine.length + result.quoteLine.length + 1; // +1 for newline
            expect(totalLength).toBeLessThanOrEqual(2000);
            expect(result.quoteLine).toContain('...');
        });

        it('should not trim if within limits', () => {
            const shortSnippet = 'Short quote';
            vi.mocked(createSnippet).mockReturnValue(shortSnippet);

            const result = buildReplyStyle('JohnDoe', null, 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe>');
            expect(result.quoteLine).toBe('Short quote');
        });
    });
});