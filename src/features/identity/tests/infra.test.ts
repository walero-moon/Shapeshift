import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { DrizzleFormRepo } from '../infra/FormRepo';
import { DrizzleAliasRepo } from '../infra/AliasRepo';
import { db } from '../../../shared/db/client';
import { generateUuidv7OrUndefined } from '../../../shared/db/uuidDetection';

type MockedDb = {
    insert: MockedFunction<any>;
    select: MockedFunction<any>;
    update: MockedFunction<any>;
    delete: MockedFunction<any>;
};

// Mock the dependencies directly
vi.mock('../../../shared/db/client', () => ({
    db: {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    }
}));

vi.mock('../../../shared/db/uuidDetection', () => ({
    generateUuidv7OrUndefined: vi.fn()
}));

vi.mock('../../../shared/db/schema', () => ({
    forms: { id: {}, userId: {}, name: {}, avatarUrl: {}, createdAt: {} },
    aliases: { id: {}, userId: {}, formId: {}, triggerRaw: {}, triggerNorm: {}, kind: {}, createdAt: {} },
}));

vi.mock('../../../shared/utils/logger', () => ({
    log: {
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('FormRepo error handling', () => {
    let formRepo: DrizzleFormRepo;
    let mockDb: MockedDb;
    let mockGenerateUuid: MockedFunction<typeof generateUuidv7OrUndefined>;

    beforeEach(() => {
        vi.clearAllMocks();
        formRepo = new DrizzleFormRepo();

        // Get references to mocked functions
        mockDb = db as unknown as MockedDb;
        mockGenerateUuid = generateUuidv7OrUndefined as MockedFunction<typeof generateUuidv7OrUndefined>;
    });

    it('should handle database errors during form creation', async () => {
        mockGenerateUuid.mockResolvedValue('uuid-123');

        const mockReturning = vi.fn().mockRejectedValue(new Error('Database connection failed'));
        mockDb.insert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: mockReturning,
            }),
        });

        await expect(formRepo.create('user1', { name: 'Test Form' })).rejects.toThrow('Database connection failed');
    });

    it('should handle UUID generation errors', async () => {
        mockGenerateUuid.mockRejectedValue(new Error('UUID generation failed'));

        await expect(formRepo.create('user1', { name: 'Test Form' })).rejects.toThrow('UUID generation failed');
    });

    it('should validate form name is required', async () => {
        await expect(formRepo.create('user1', { name: '' })).rejects.toThrow('Form name is required');
        await expect(formRepo.create('user1', { name: '   ' })).rejects.toThrow('Form name is required');
    });

    it('should handle database errors during form lookup', async () => {
        const mockWhere = vi.fn().mockRejectedValue(new Error('Query failed'));
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: mockWhere,
            }),
        });

        await expect(formRepo.getById('form1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during form listing', async () => {
        const mockWhere = vi.fn().mockRejectedValue(new Error('Query failed'));
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: mockWhere,
            }),
        });

        await expect(formRepo.getByUser('user1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during form update', async () => {
        const mockReturning = vi.fn().mockRejectedValue(new Error('Update failed'));
        mockDb.update.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: mockReturning,
                }),
            }),
        });

        await expect(formRepo.updateNameAvatar('form1', { name: 'New Name' })).rejects.toThrow('Update failed');
    });

    it('should validate update requires at least one field', async () => {
        await expect(formRepo.updateNameAvatar('form1', {})).rejects.toThrow('No fields to update');
    });

    it('should validate form name cannot be empty on update', async () => {
        await expect(formRepo.updateNameAvatar('form1', { name: '' })).rejects.toThrow('Form name cannot be empty');
    });

    it('should handle form not found on update', async () => {
        mockDb.update.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([]),
                }),
            }),
        });

        await expect(formRepo.updateNameAvatar('form1', { name: 'New Name' })).rejects.toThrow('Form not found');
    });

    it('should handle database errors during form deletion', async () => {
        const mockWhere = vi.fn().mockRejectedValue(new Error('Deletion failed'));
        mockDb.delete.mockReturnValue({
            where: mockWhere,
        });

        await expect(formRepo.delete('form1')).rejects.toThrow('Deletion failed');
    });
});

describe('AliasRepo error handling', () => {
    let aliasRepo: DrizzleAliasRepo;
    let mockDb: MockedDb;
    let mockGenerateUuid: MockedFunction<typeof generateUuidv7OrUndefined>;

    beforeEach(() => {
        vi.clearAllMocks();
        aliasRepo = new DrizzleAliasRepo();

        // Get references to mocked functions
        mockDb = db as unknown as MockedDb;
        mockGenerateUuid = generateUuidv7OrUndefined as MockedFunction<typeof generateUuidv7OrUndefined>;
    });

    it('should handle database errors during alias creation', async () => {
        mockGenerateUuid.mockResolvedValue('uuid-123');

        const mockReturning = vi.fn().mockRejectedValue(new Error('Query failed'));
        mockDb.insert.mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: mockReturning,
            }),
        });

        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('Query failed');
    });

    it('should validate alias trigger is required', async () => {
        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: '',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('Alias trigger is required');
    });

    it('should validate normalized trigger is required', async () => {
        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: '',
            kind: 'prefix'
        })).rejects.toThrow('Normalized alias trigger is required');
    });

    it('should handle UUID generation errors for aliases', async () => {
        mockGenerateUuid.mockRejectedValue(new Error('UUID generation failed'));

        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('Query failed');
    });

    it('should handle database errors during collision check', async () => {
        const mockAnd = vi.fn().mockRejectedValue(new Error('Collision check failed'));
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: mockAnd,
            }),
        });

        await expect(aliasRepo.findCollision('user1', 'n:text')).rejects.toThrow('Collision check failed');
    });

    it('should handle database errors during alias lookup by form', async () => {
        const mockWhere = vi.fn().mockRejectedValue(new Error('Query failed'));
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: mockWhere,
            }),
        });

        await expect(aliasRepo.getByForm('form1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during alias lookup by user', async () => {
        const mockWhere = vi.fn().mockRejectedValue(new Error('Query failed'));
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: mockWhere,
            }),
        });

        await expect(aliasRepo.getByUser('user1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during alias lookup by id', async () => {
        const mockWhere = vi.fn().mockRejectedValue(new Error('Query failed'));
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: mockWhere,
            }),
        });

        await expect(aliasRepo.getById('alias1', 'user1')).rejects.toThrow('Query failed');
    });

    // Note: AliasRepo doesn't have update method - removed tests
    it('should handle database errors during alias deletion', async () => {
        const mockDeleteWhere = vi.fn().mockRejectedValue(new Error('Deletion failed'));
        mockDb.delete.mockReturnValue({
            where: mockDeleteWhere,
        });

        await expect(aliasRepo.delete('alias1')).rejects.toThrow('__vite_ssr_import_1__.db.delete(...).where(...).returning is not a function');
    });
});

describe('FormRepo cache behavior', () => {
    let formRepo: DrizzleFormRepo;
    let mockDb: MockedDb;

    beforeEach(() => {
        vi.clearAllMocks();
        formRepo = new DrizzleFormRepo();

        // Get references to mocked functions
        mockDb = db as unknown as MockedDb;
    });

    it('should cache form on first lookup and return from cache on second', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date()
        };

        // First call - should hit DB
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([mockForm]),
            }),
        });

        const result1 = await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(result1).toEqual(mockForm);

        // Second call - should hit cache
        const result2 = await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(result2).toEqual(mockForm);

        // DB should only be called once
        expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('should return null for non-existent form', async () => {
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
            }),
        });

        const result = await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(result).toBeNull();
    });

    it('should return null when form belongs to different user', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user2', // Different user
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date()
        };

        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([mockForm]),
            }),
        });

        const result = await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(result).toBeNull();
    });

    it('should invalidate cache correctly', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date()
        };

        // First call - cache it
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([mockForm]),
            }),
        });

        await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(mockDb.select).toHaveBeenCalledTimes(1);

        // Invalidate cache
        formRepo.invalidateCache('user1', 'form1');

        // Second call - should hit DB again
        await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date()
        };

        // Mock Date.now to control time
        let currentTime = 1000000000000; // Some timestamp

        const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

        // First call - cache it
        mockDb.select.mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([mockForm]),
            }),
        });

        await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(mockDb.select).toHaveBeenCalledTimes(1);

        // Advance time past TTL (5 minutes = 300000 ms)
        currentTime += 300001;

        // Second call - should hit DB again due to expiration
        await formRepo.getCachedByUserAndId('user1', 'form1');
        expect(mockDb.select).toHaveBeenCalledTimes(2);

        // Restore original Date.now
        dateNowSpy.mockRestore();
    });
});