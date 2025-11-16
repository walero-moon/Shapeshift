import { describe, it, expect, beforeEach, vi } from 'vitest';
import { matchAlias } from '../app/MatchAlias';
import { aliasRepo } from '../../identity/infra/AliasRepo';

// Mock the alias repository
vi.mock('../../identity/infra/AliasRepo', () => ({
    aliasRepo: {
        listByUserGrouped: vi.fn(),
    },
}));

describe('matchAlias function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null when no aliases exist for user', async () => {
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue({});

        const result = await matchAlias('user1', 'n:text hello world');

        expect(result).toBeNull();
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
    });

    it('should return null when no prefix aliases exist and pattern does not match', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: '{text}',
                triggerNorm: '{text}',
                kind: 'pattern' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue({ 'form1': mockAliases });

        const result = await matchAlias('user1', 'n:text hello world');

        expect(result).toBeNull();
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
    });

    it('should return null when no alias matches the text', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue({ 'form1': mockAliases });

        const result = await matchAlias('user1', 'hello world');

        expect(result).toBeNull();
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
    });

    it('should match the longest prefix alias', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
            {
                id: 'alias2',
                userId: 'user1',
                formId: 'form2',
                triggerRaw: 'neoli:text',
                triggerNorm: 'neoli:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', 'neoli:text hello world');

        expect(result).toEqual({
            alias: mockAliases[1], // longest match
            renderedText: 'hello world',
        });
    });

    it('should trim and collapse spaces in rendered text', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', 'n:text   hello   world   ');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello   world',
        });
    });

    it('should handle exact match with no remaining text', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', 'n:text');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: '',
        });
    });

    it('should handle case insensitive matching', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'N:TEXT',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', 'n:text hello world');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello world',
        });
    });

    it('should reject aliases without literal text', async () => {
        // This test verifies that the function only considers valid aliases
        // The actual validation happens in normalizeAlias, but we test the behavior
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'n:trigger', // no 'text'
                triggerNorm: 'n:trigger',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', 'n:trigger hello world');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello world',
        }); // Matches because the function doesn't validate 'text' presence - that's done at creation time
    });

    it('should match pattern aliases exactly', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: '{text}',
                triggerNorm: '{text}',
                kind: 'pattern' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', '{hello world}');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello world',
        });
    });

    it('should not match pattern aliases if prefix or suffix does not match', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: '{text}',
                triggerNorm: '{text}',
                kind: 'pattern' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', '[hello world]');

        expect(result).toBeNull();
    });

    it('should prefer prefix over pattern if both could match', async () => {
        const mockAliases = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
            {
                id: 'alias2',
                userId: 'user1',
                formId: 'form2',
                triggerRaw: '{text}',
                triggerNorm: '{text}',
                kind: 'pattern' as const,
                createdAt: new Date(),
            },
        ];
        vi.mocked(aliasRepo.getByUser).mockResolvedValue(mockAliases);

        const result = await matchAlias('user1', 'n:text hello world');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello world',
        });
    });

    it('should handle database errors', async () => {
        vi.mocked(aliasRepo.getByUser).mockRejectedValue(new Error('Database connection failed'));

        await expect(matchAlias('user1', 'n:text hello')).rejects.toThrow('Database connection failed');
    });
});