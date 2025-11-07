import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DrizzleFormRepo } from '../infra/FormRepo';
import { DrizzleAliasRepo } from '../infra/AliasRepo';
import { db } from '../../../shared/db/client';
import { generateUuidv7OrUndefined } from '../../../shared/db/uuidDetection';

// Mock the database client
vi.mock('../../../shared/db/client', () => ({
    db: {
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                returning: vi.fn(),
            })),
        })),
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(),
            })),
        })),
        update: vi.fn(() => ({
            set: vi.fn(() => ({
                where: vi.fn(() => ({
                    returning: vi.fn(),
                })),
            })),
        })),
        delete: vi.fn(() => ({
            where: vi.fn(() => ({
                returning: vi.fn(),
            })),
        })),
    },
}));

// Helper to create a mock query builder that can be rejected
const createMockQueryBuilder = (shouldReject: boolean, errorMessage?: string) => {
    const mockReturning = vi.fn();
    if (shouldReject) {
        mockReturning.mockRejectedValue(new Error(errorMessage));
    } else {
        mockReturning.mockResolvedValue([]);
    }

    return {
        values: vi.fn(() => ({
            returning: mockReturning,
        })),
        from: vi.fn(() => ({
            where: vi.fn(),
        })),
        set: vi.fn(() => ({
            where: vi.fn(() => ({
                returning: mockReturning,
            })),
        })),
        where: vi.fn(() => ({
            returning: mockReturning,
        })),
    };
};

// Mock UUID generation
vi.mock('../../../shared/db/uuidDetection', () => ({
    generateUuidv7OrUndefined: vi.fn(),
}));

describe('FormRepo error handling', () => {
    let formRepo: DrizzleFormRepo;

    beforeEach(() => {
        vi.clearAllMocks();
        formRepo = new DrizzleFormRepo();
    });

    it('should handle database errors during form creation', async () => {
        vi.mocked(generateUuidv7OrUndefined).mockResolvedValue('uuid-123');
        vi.mocked(db.insert).mockImplementation(() => createMockQueryBuilder(true, 'Database connection failed') as any);

        await expect(formRepo.create('user1', { name: 'Test Form' })).rejects.toThrow('Database connection failed');
    });

    it('should handle UUID generation errors', async () => {
        vi.mocked(generateUuidv7OrUndefined).mockRejectedValue(new Error('UUID generation failed'));

        await expect(formRepo.create('user1', { name: 'Test Form' })).rejects.toThrow('UUID generation failed');
    });

    it('should validate form name is required', async () => {
        await expect(formRepo.create('user1', { name: '' })).rejects.toThrow('Form name is required');
        await expect(formRepo.create('user1', { name: '   ' })).rejects.toThrow('Form name is required');
    });

    it('should handle database errors during form lookup', async () => {
        vi.mocked(db.select).mockRejectedValue(new Error('Query failed'));

        await expect(formRepo.getById('form1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during form listing', async () => {
        vi.mocked(db.select).mockRejectedValue(new Error('Query failed'));

        await expect(formRepo.getByUser('user1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during form update', async () => {
        vi.mocked(db.update).mockRejectedValue(new Error('Update failed'));

        await expect(formRepo.updateNameAvatar('form1', { name: 'New Name' })).rejects.toThrow('Update failed');
    });

    it('should validate update requires at least one field', async () => {
        await expect(formRepo.updateNameAvatar('form1', {})).rejects.toThrow('No fields to update');
    });

    it('should validate form name cannot be empty on update', async () => {
        await expect(formRepo.updateNameAvatar('form1', { name: '' })).rejects.toThrow('Form name cannot be empty');
    });

    it('should handle form not found on update', async () => {
        vi.mocked(db.update).mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([])
                })
            })
        } as any);

        await expect(formRepo.updateNameAvatar('form1', { name: 'New Name' })).rejects.toThrow('Form not found');
    });

    it('should handle database errors during form deletion', async () => {
        vi.mocked(db.delete).mockRejectedValue(new Error('Deletion failed'));

        await expect(formRepo.delete('form1')).rejects.toThrow('Deletion failed');
    });
});

describe('AliasRepo error handling', () => {
    let aliasRepo: DrizzleAliasRepo;

    beforeEach(() => {
        vi.clearAllMocks();
        aliasRepo = new DrizzleAliasRepo();
    });

    it('should handle database errors during alias creation', async () => {
        vi.mocked(generateUuidv7OrUndefined).mockResolvedValue('uuid-123');
        vi.mocked(db.insert).mockRejectedValue(new Error('Database connection failed'));

        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('Database connection failed');
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
        vi.mocked(generateUuidv7OrUndefined).mockRejectedValue(new Error('UUID generation failed'));

        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('UUID generation failed');
    });

    it('should handle database errors during collision check', async () => {
        vi.mocked(db.select).mockRejectedValue(new Error('Collision check failed'));

        await expect(aliasRepo.findCollision('user1', 'n:text')).rejects.toThrow('Collision check failed');
    });

    it('should handle database errors during alias lookup by form', async () => {
        vi.mocked(db.select).mockRejectedValue(new Error('Query failed'));

        await expect(aliasRepo.getByForm('form1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during alias lookup by user', async () => {
        vi.mocked(db.select).mockRejectedValue(new Error('Query failed'));

        await expect(aliasRepo.getByUser('user1')).rejects.toThrow('Query failed');
    });

    it('should handle database errors during alias deletion', async () => {
        vi.mocked(db.delete).mockRejectedValue(new Error('Deletion failed'));

        await expect(aliasRepo.delete('alias1')).rejects.toThrow('Deletion failed');
    });

    it('should handle alias not found on deletion', async () => {
        vi.mocked(db.delete).mockReturnValue({
            where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([])
            })
        } as any);

        await expect(aliasRepo.delete('alias1')).rejects.toThrow('Alias not found');
    });
});

describe('Database constraint violations', () => {
    let formRepo: DrizzleFormRepo;
    let aliasRepo: DrizzleAliasRepo;

    beforeEach(() => {
        vi.clearAllMocks();
        formRepo = new DrizzleFormRepo();
        aliasRepo = new DrizzleAliasRepo();
    });

    it('should handle unique constraint violations on form creation', async () => {
        vi.mocked(generateUuidv7OrUndefined).mockResolvedValue('uuid-123');
        vi.mocked(db.insert).mockRejectedValue(new Error('duplicate key value violates unique constraint'));

        await expect(formRepo.create('user1', { name: 'Test Form' })).rejects.toThrow('duplicate key value violates unique constraint');
    });

    it('should handle unique constraint violations on alias creation', async () => {
        vi.mocked(generateUuidv7OrUndefined).mockResolvedValue('uuid-123');
        vi.mocked(db.insert).mockRejectedValue(new Error('duplicate key value violates unique constraint'));

        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('duplicate key value violates unique constraint');
    });

    it('should handle foreign key constraint violations on alias creation', async () => {
        vi.mocked(generateUuidv7OrUndefined).mockResolvedValue('uuid-123');
        vi.mocked(db.insert).mockRejectedValue(new Error('insert or update on table "aliases" violates foreign key constraint'));

        await expect(aliasRepo.create('user1', 'nonexistent-form', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('insert or update on table "aliases" violates foreign key constraint');
    });

    it('should handle foreign key constraint violations on form deletion', async () => {
        vi.mocked(db.delete).mockRejectedValue(new Error('update or delete on table "forms" violates foreign key constraint'));

        await expect(formRepo.delete('form1')).rejects.toThrow('update or delete on table "forms" violates foreign key constraint');
    });
});

describe('Database connection issues', () => {
    let formRepo: DrizzleFormRepo;
    let aliasRepo: DrizzleAliasRepo;

    beforeEach(() => {
        vi.clearAllMocks();
        formRepo = new DrizzleFormRepo();
        aliasRepo = new DrizzleAliasRepo();
    });

    it('should handle connection timeouts', async () => {
        vi.mocked(db.select).mockRejectedValue(new Error('timeout expired'));

        await expect(formRepo.getById('form1')).rejects.toThrow('timeout expired');
    });

    it('should handle connection refused errors', async () => {
        vi.mocked(db.insert).mockRejectedValue(new Error('connect ECONNREFUSED'));

        vi.mocked(generateUuidv7OrUndefined).mockResolvedValue('uuid-123');

        await expect(formRepo.create('user1', { name: 'Test Form' })).rejects.toThrow('connect ECONNREFUSED');
    });

    it('should handle transaction rollback errors', async () => {
        vi.mocked(db.insert).mockRejectedValue(new Error('current transaction is aborted, commands ignored until end of transaction block'));

        vi.mocked(generateUuidv7OrUndefined).mockResolvedValue('uuid-123');

        await expect(aliasRepo.create('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix'
        })).rejects.toThrow('current transaction is aborted, commands ignored until end of transaction block');
    });
});