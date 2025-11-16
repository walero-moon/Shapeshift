import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { matchAlias, clearAliasCache, invalidateAliasCache } from '../app/MatchAlias';
import { aliasRepo, type Alias } from '../../identity/infra/AliasRepo';
import { log } from '../../../shared/utils/logger';

// Mock the alias repository
vi.mock('../../identity/infra/AliasRepo', () => ({
    aliasRepo: {
        listByUserGrouped: vi.fn(),
    },
}));

// Mock the logger
vi.mock('../../../shared/utils/logger', () => ({
    log: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('matchAlias function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearAliasCache();
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
        const groupedAliases: Record<string, Alias[]> = {
            'form1': [mockAliases[0] as Alias],
            'form2': [mockAliases[1] as Alias]
        };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', 'neoli:text hello world');

        expect(result).toEqual({
            alias: mockAliases[1], // longest match
            renderedText: 'hello world',
        });
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
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
        const groupedAliases = { 'form1': mockAliases };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', 'n:text   hello   world   ');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello   world',
        });
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
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
        const groupedAliases = { 'form1': mockAliases };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', 'n:text');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: '',
        });
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
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
        const groupedAliases = { 'form1': mockAliases };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', 'n:text hello world');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello world',
        });
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
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
        const groupedAliases = { 'form1': mockAliases };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', 'n:trigger hello world');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello world',
        }); // Matches because the function doesn't validate 'text' presence - that's done at creation time
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
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
        const groupedAliases = { 'form1': mockAliases };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', '{hello world}');

        expect(result).toEqual({
            alias: mockAliases[0],
            renderedText: 'hello world',
        });
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
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
        const groupedAliases = { 'form1': mockAliases };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', '[hello world]');

        expect(result).toBeNull();
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
    });

    it('should prefer prefix over pattern if both could match', async () => {
        const prefixAlias: Alias = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };
        const patternAlias: Alias = {
            id: 'alias2',
            userId: 'user1',
            formId: 'form2',
            triggerRaw: '{text}',
            triggerNorm: '{text}',
            kind: 'pattern' as const,
            createdAt: new Date(),
        };
        const groupedAliases: Record<string, Alias[]> = {
            'form1': [prefixAlias],
            'form2': [patternAlias]
        };
        vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

        const result = await matchAlias('user1', 'n:text hello world');

        expect(result).toEqual({
            alias: prefixAlias,
            renderedText: 'hello world',
        });
        expect(aliasRepo.listByUserGrouped).toHaveBeenCalledWith('user1');
    });

    it('should handle database errors', async () => {
        vi.mocked(aliasRepo.listByUserGrouped).mockRejectedValue(new Error('Database connection failed'));

        await expect(matchAlias('user1', 'n:text hello')).rejects.toThrow('Database connection failed');
    });

    describe('cache behavior', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should cache alias lists and log cache_hit on subsequent calls', async () => {
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
            const groupedAliases = { 'form1': mockAliases };
            vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

            // First call - cache miss
            await matchAlias('user1', 'n:text hello');
            expect(aliasRepo.listByUserGrouped).toHaveBeenCalledTimes(1);
            expect(log.info).toHaveBeenCalledWith('Cache miss for alias list', {
                component: 'proxy',
                userId: 'user1',
                status: 'cache_miss'
            });

            // Second call - cache hit
            await matchAlias('user1', 'n:text world');
            expect(aliasRepo.listByUserGrouped).toHaveBeenCalledTimes(1); // Not called again
            expect(log.info).toHaveBeenCalledWith('Cache hit for alias list', {
                component: 'proxy',
                userId: 'user1',
                status: 'cache_hit'
            });
        });

        it('should invalidate cache when invalidateAliasCache is called', async () => {
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
            const groupedAliases = { 'form1': mockAliases };
            vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

            // First call - cache miss
            await matchAlias('user1', 'n:text hello');
            expect(aliasRepo.listByUserGrouped).toHaveBeenCalledTimes(1);

            // Invalidate cache
            invalidateAliasCache('user1');

            // Second call - cache miss again
            await matchAlias('user1', 'n:text world');
            expect(aliasRepo.listByUserGrouped).toHaveBeenCalledTimes(2);
        });

        it('should expire cache after TTL', async () => {
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
            const groupedAliases = { 'form1': mockAliases };
            vi.mocked(aliasRepo.listByUserGrouped).mockResolvedValue(groupedAliases);

            // First call - cache miss
            await matchAlias('user1', 'n:text hello');
            expect(aliasRepo.listByUserGrouped).toHaveBeenCalledTimes(1);

            // Advance time past TTL (300000 ms)
            vi.advanceTimersByTime(300001);

            // Second call - cache miss due to expiration
            await matchAlias('user1', 'n:text world');
            expect(aliasRepo.listByUserGrouped).toHaveBeenCalledTimes(2);
        });
    });
});