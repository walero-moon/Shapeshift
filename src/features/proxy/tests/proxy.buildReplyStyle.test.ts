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

    describe('header generation', () => {
        it('should generate header with displayName and content', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle('JohnDoe', 'https://discord.com/channels/123/456/789', 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe> **🡒** [test snippet](https://discord.com/channels/123/456/789)');
            expect(result.allowedMentions).toEqual({ parse: ['users'], repliedUser: false });
        });

        it('should generate header with displayName only', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle('JohnDoe', null, 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe> **🡒** [test snippet](null)');
        });

        it('should generate generic header when no displayName', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle(null, 'https://discord.com/channels/123/456/789', 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying **🡒** [test snippet](https://discord.com/channels/123/456/789)');
        });

        it('should use createSnippet for content and trim if needed', () => {
            vi.mocked(createSnippet).mockReturnValue('This is a quote');

            const result = buildReplyStyle('JohnDoe', null, 'Hello world', false, false);

            expect(createSnippet).toHaveBeenCalledWith({
                content: 'Hello world',
            });
            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe> **🡒** [This is a quote](null)');
        });

        it('should pass embeds placeholder to createSnippet', () => {
            vi.mocked(createSnippet).mockReturnValue('[embed]');

            const result = buildReplyStyle('JohnDoe', null, '', true, false);

            expect(createSnippet).toHaveBeenCalledWith({
                content: '',
                embeds: [{} as unknown],
            });
            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe> **🡒** [[embed]](null)');
        });

        it('should pass attachments placeholder to createSnippet', () => {
            vi.mocked(createSnippet).mockReturnValue('[image]');

            const result = buildReplyStyle('JohnDoe', null, '', false, true);

            expect(createSnippet).toHaveBeenCalledWith({
                content: '',
                attachments: [{} as unknown],
            });
            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe> **🡒** [[image]](null)');
        });

        it('should trim content if total exceeds 2000 chars', () => {
            const longSnippet = 'a'.repeat(3000); // Make it long enough to trigger trimming
            vi.mocked(createSnippet).mockReturnValue(longSnippet);

            const result = buildReplyStyle('JohnDoe', null, 'a'.repeat(3000), false, false);

            expect(result.headerLine.length).toBeLessThanOrEqual(2000);
            expect(result.headerLine).toContain('...');
        });

        it('should not trim if within limits', () => {
            const shortSnippet = 'Short quote';
            vi.mocked(createSnippet).mockReturnValue(shortSnippet);

            const result = buildReplyStyle('JohnDoe', null, 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ Replying to <@JohnDoe> **🡒** [Short quote](null)');
        });
    });
});
