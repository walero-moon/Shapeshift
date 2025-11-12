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

            expect(result.headerLine).toBe('-# ↩︎ **@JohnDoe** test snippet');
        });

        it('should generate header with displayName only', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle('JohnDoe', null, 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ **@JohnDoe** test snippet');
        });

        it('should generate generic header when no displayName', () => {
            vi.mocked(createSnippet).mockReturnValue('test snippet');

            const result = buildReplyStyle(null, 'https://discord.com/channels/123/456/789', 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ test snippet');
        });

        it('should use createSnippet for content and trim if needed', () => {
            vi.mocked(createSnippet).mockReturnValue('This is a quote');

            const result = buildReplyStyle('JohnDoe', null, 'Hello world', false, false);

            expect(createSnippet).toHaveBeenCalledWith({
                content: 'Hello world',
                embeds: undefined,
                attachments: undefined,
            });
            expect(result.headerLine).toBe('-# ↩︎ **@JohnDoe** This is a quote');
        });

        it('should pass embeds placeholder to createSnippet', () => {
            vi.mocked(createSnippet).mockReturnValue('[embed]');

            const result = buildReplyStyle('JohnDoe', null, '', true, false);

            expect(createSnippet).toHaveBeenCalledWith({
                content: '',
                embeds: [{} as unknown],
                attachments: undefined,
            });
            expect(result.headerLine).toBe('-# ↩︎ **@JohnDoe** [embed]');
        });

        it('should pass attachments placeholder to createSnippet', () => {
            vi.mocked(createSnippet).mockReturnValue('[image]');

            const result = buildReplyStyle('JohnDoe', null, '', false, true);

            expect(createSnippet).toHaveBeenCalledWith({
                content: '',
                embeds: undefined,
                attachments: [{} as unknown],
            });
            expect(result.headerLine).toBe('-# ↩︎ **@JohnDoe** [image]');
        });

        it('should trim content if total exceeds 2000 chars', () => {
            const longSnippet = 'a'.repeat(1950); // Make it long enough to trigger trimming
            vi.mocked(createSnippet).mockReturnValue(longSnippet);

            const result = buildReplyStyle('JohnDoe', null, 'a'.repeat(1950), false, false);

            expect(result.headerLine.length).toBeLessThanOrEqual(2000);
            expect(result.headerLine).toContain('...');
        });

        it('should not trim if within limits', () => {
            const shortSnippet = 'Short quote';
            vi.mocked(createSnippet).mockReturnValue(shortSnippet);

            const result = buildReplyStyle('JohnDoe', null, 'Hello', false, false);

            expect(result.headerLine).toBe('-# ↩︎ **@JohnDoe** Short quote');
        });
    });
});