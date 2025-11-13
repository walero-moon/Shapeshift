import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildProxyMessage } from '../app/BuildProxyMessage';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { Form } from '../../identity/infra/FormRepo';
import { ProxyAttachment } from '../../../shared/ports/ChannelProxyPort';

describe('buildProxyMessage function', () => {
    let mockForm: Form;

    beforeEach(() => {
        vi.clearAllMocks();
        mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'TestForm',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };
    });

    it('should build payload with form name and avatar', () => {
        const result = buildProxyMessage(mockForm, 'Hello world!');

        expect(result).toEqual({
            username: 'TestForm',
            avatar_url: 'https://example.com/avatar.png',
            content: 'Hello world!',
            allowed_mentions: DEFAULT_ALLOWED_MENTIONS,
        });
    });

    it('should build payload without avatar when null', () => {
        mockForm.avatarUrl = null;

        const result = buildProxyMessage(mockForm, 'Hello world!');

        expect(result).toEqual({
            username: 'TestForm',
            content: 'Hello world!',
            allowed_mentions: DEFAULT_ALLOWED_MENTIONS,
        });
        expect(result).not.toHaveProperty('avatar_url');
    });

    it('should trim whitespace from content', () => {
        const result = buildProxyMessage(mockForm, '  Hello world!  ');

        expect(result.content).toBe('Hello world!');
    });

    it('should truncate content to 2000 characters', () => {
        const longContent = 'a'.repeat(2010);
        const result = buildProxyMessage(mockForm, longContent);

        expect(result.content).toBe('a'.repeat(2000));
        expect(result.content.length).toBe(2000);
    });

    it('should not truncate content under 2000 characters', () => {
        const content = 'a'.repeat(1999);
        const result = buildProxyMessage(mockForm, content);

        expect(result.content).toBe(content);
        expect(result.content.length).toBe(1999);
    });

    it('should handle empty content', () => {
        const result = buildProxyMessage(mockForm, '');

        expect(result.content).toBe('');
    });

    it('should handle whitespace-only content', () => {
        const result = buildProxyMessage(mockForm, '   ');

        expect(result.content).toBe('');
    });

    it('should include attachments when provided', () => {
        const attachments = [
            { name: 'file1.png', data: Buffer.from('test file 1') },
            { name: 'file2.jpg', data: Buffer.from('test file 2') },
        ] as ProxyAttachment[];

        const result = buildProxyMessage(mockForm, 'Hello with attachments!', attachments);

        expect(result.attachments).toBe(attachments);
    });

    it('should not include attachments when not provided', () => {
        const result = buildProxyMessage(mockForm, 'Hello world!');

        expect(result).not.toHaveProperty('attachments');
    });

    it('should always include allowed_mentions', () => {
        const result = buildProxyMessage(mockForm, 'Hello world!');

        expect(result.allowed_mentions).toBe(DEFAULT_ALLOWED_MENTIONS);
    });

    it('should use form name as username', () => {
        mockForm.name = 'CustomName';

        const result = buildProxyMessage(mockForm, 'Hello world!');

        expect(result.username).toBe('CustomName');
    });
});