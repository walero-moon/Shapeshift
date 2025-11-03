import { describe, it, expect } from 'vitest';
import { parseTag } from '../../src/discord/utils/tagParser';

describe('parseTag', () => {
    const members = ['Alice', 'Bob', 'Charlie'];

    it('should parse normal Member: text', () => {
        const result = parseTag('Alice: Hello world', members);
        expect(result).toEqual({ matched: true, memberName: 'Alice', content: 'Hello world' });
    });

    it('should handle case-insensitive member matching', () => {
        const result = parseTag('alice: Hello world', members);
        expect(result).toEqual({ matched: true, memberName: 'Alice', content: 'Hello world' });
    });

    it('should return false for leading \\ escape', () => {
        const result = parseTag('\\Alice: Hello world', members);
        expect(result).toEqual({ matched: false });
    });

    it('should return false for no colon', () => {
        const result = parseTag('Alice Hello world', members);
        expect(result).toEqual({ matched: false });
    });

    it('should trim leading and trailing spaces from member name', () => {
        const result = parseTag('  Alice  : Hello world', members);
        expect(result).toEqual({ matched: true, memberName: 'Alice', content: 'Hello world' });
    });

    it('should trim leading and trailing spaces from content', () => {
        const result = parseTag('Alice:  Hello world  ', members);
        expect(result).toEqual({ matched: true, memberName: 'Alice', content: 'Hello world' });
    });

    it('should return false for content exceeding 2000 characters', () => {
        const longContent = 'a'.repeat(2001);
        const result = parseTag(`Alice: ${longContent}`, members);
        expect(result).toEqual({ matched: false });
    });

    it('should return false for member not in list', () => {
        const result = parseTag('Dave: Hello world', members);
        expect(result).toEqual({ matched: false });
    });

    it('should handle empty content after colon', () => {
        const result = parseTag('Alice:', members);
        expect(result).toEqual({ matched: true, memberName: 'Alice', content: '' });
    });

    it('should handle colon at start', () => {
        const result = parseTag(': Hello world', members);
        expect(result).toEqual({ matched: false });
    });
});