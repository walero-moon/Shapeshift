import { describe, it, expect } from 'vitest';
import { sanitizeAttachments } from '../../src/discord/utils/attachments';

describe('sanitizeAttachments', () => {
    it('should return attachments when permission is granted', () => {
        const attachments = [{ name: 'file1.png' }, { name: 'file2.jpg' }];
        const result = sanitizeAttachments(true, attachments);

        expect(result).toEqual(attachments);
    });

    it('should return undefined when permission is not granted', () => {
        const attachments = [{ name: 'file1.png' }];
        const result = sanitizeAttachments(false, attachments);

        expect(result).toBeUndefined();
    });

    it('should return undefined when attachments is undefined', () => {
        const result = sanitizeAttachments(true, undefined);

        expect(result).toBeUndefined();
    });

    it('should return undefined when attachments is undefined and no permission', () => {
        const result = sanitizeAttachments(false, undefined);

        expect(result).toBeUndefined();
    });
});