import { describe, expect, it } from 'vitest';
import { createSnippet } from '../snippet';

describe('createSnippet', () => {
    it('strips common markdown and collapses whitespace', () => {
        expect(createSnippet({
            content: '**bold** *italic* __under__ _em_ ~~gone~~ `code`\n\nnext'
        })).toBe('bold italic under em gone code next');
    });

    it('uses embed and attachment placeholders when content is empty', () => {
        expect(createSnippet({ embeds: [{}], attachments: [{}] })).toBe('[embed] [image]');
        expect(createSnippet({ embeds: [{}] })).toBe('[embed]');
        expect(createSnippet({ attachments: [{}] })).toBe('[image]');
        expect(createSnippet({})).toBe('');
    });

    it('removes fenced code blocks and trims long snippets', () => {
        const result = createSnippet({
            content: `before\n\`\`\`ts\nconst secret = true;\n\`\`\`\n${'a'.repeat(140)}`
        });

        expect(result).toHaveLength(120);
        expect(result).toBe(`before ${'a'.repeat(110)}...`);
    });
});
