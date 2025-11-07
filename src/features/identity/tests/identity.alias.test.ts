import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normalizeAlias, getAliasKind } from '../app/NormalizeAlias';
import { addAlias, AddAliasInput } from '../app/AddAlias';
import { listAliases } from '../app/ListAliases';
import { removeAlias } from '../app/RemoveAlias';
import { formRepo } from '../infra/FormRepo';
import { aliasRepo } from '../infra/AliasRepo';

// Mock the repositories
vi.mock('../infra/FormRepo', () => ({
    formRepo: {
        getById: vi.fn(),
        getByUser: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../infra/AliasRepo', () => ({
    aliasRepo: {
        create: vi.fn(),
        getByForm: vi.fn(),
        getByUser: vi.fn(),
        delete: vi.fn(),
        findCollision: vi.fn(),
    },
}));

describe('Alias normalization', () => {
    it('should normalize aliases correctly', () => {
        expect(normalizeAlias('N:text')).toBe('n:text');
        expect(normalizeAlias('  neoli:text  ')).toBe('neoli:text');
        expect(normalizeAlias('n:  text')).toBe('n: text');
        expect(normalizeAlias('{TEXT}')).toBe('{text}');
        expect(normalizeAlias('  {  text  }  ')).toBe('{ text }');
    });

    it('should detect literal text requirement', () => {
        expect(() => normalizeAlias('n:trigger')).toThrow('Alias trigger must contain the literal word "text"');
        expect(() => normalizeAlias('mytext')).toThrow('Alias trigger must contain the literal word "text"');
        expect(() => normalizeAlias('texting')).toThrow('Alias trigger must contain the literal word "text"');

        // Valid cases should not throw
        expect(() => normalizeAlias('n:text')).not.toThrow();
        expect(() => normalizeAlias('neoli:text')).not.toThrow();
        expect(() => normalizeAlias('{text}')).not.toThrow();
    });

    it('should classify alias kinds correctly', () => {
        expect(getAliasKind('n:text')).toBe('prefix');
        expect(getAliasKind('neoli:text')).toBe('prefix');
        expect(getAliasKind('{text}')).toBe('pattern');
        expect(getAliasKind('{  text  }')).toBe('pattern');
    });

    it('should handle empty or whitespace-only input', () => {
        expect(() => normalizeAlias('')).toThrow('Alias trigger must contain the literal word "text"');
        expect(() => normalizeAlias('   ')).toThrow('Alias trigger must contain the literal word "text"');
    });

    it('should handle malformed patterns', () => {
        expect(() => normalizeAlias('{text')).toThrow('Alias trigger must contain the literal word "text"');
        expect(() => normalizeAlias('text}')).toThrow('Alias trigger must contain the literal word "text"');
    });
});

describe('addAlias function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should add alias successfully', async () => {
        // Mock form exists
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

        // Mock no collision
        vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);

        // Mock alias creation
        const mockAlias = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };
        vi.mocked(aliasRepo.create).mockResolvedValue(mockAlias);

        const input: AddAliasInput = { trigger: 'n:text' };
        const result = await addAlias('form1', 'user1', input);

        expect(result).toEqual({
            id: mockAlias.id,
            triggerRaw: mockAlias.triggerRaw,
            triggerNorm: mockAlias.triggerNorm,
            kind: mockAlias.kind,
            createdAt: mockAlias.createdAt,
        });

        expect(aliasRepo.create).toHaveBeenCalledWith('user1', 'form1', {
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix',
        });
    });

    it('should handle form not found', async () => {
        vi.mocked(formRepo.getById).mockResolvedValue(null);

        const input: AddAliasInput = { trigger: 'n:text' };

        await expect(addAlias('form1', 'user1', input)).rejects.toThrow('Form not found');

        expect(aliasRepo.create).not.toHaveBeenCalled();
    });

    it('should handle alias collision', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

        const existingAlias = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form2',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };
        vi.mocked(aliasRepo.findCollision).mockResolvedValue(existingAlias);

        const input: AddAliasInput = { trigger: 'n:text' };

        await expect(addAlias('form1', 'user1', input)).rejects.toThrow(
            'Alias "n:text" already exists for this user'
        );

        expect(aliasRepo.create).not.toHaveBeenCalled();
    });

    it('should reject aliases without literal text', async () => {
        const input: AddAliasInput = { trigger: 'n:trigger' };

        await expect(addAlias('form1', 'user1', input)).rejects.toThrow(
            'Alias trigger must contain the literal word "text"'
        );

        expect(aliasRepo.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during form lookup', async () => {
        vi.mocked(formRepo.getById).mockRejectedValue(new Error('Database connection failed'));

        const input: AddAliasInput = { trigger: 'n:text' };

        await expect(addAlias('form1', 'user1', input)).rejects.toThrow('Database connection failed');
        expect(aliasRepo.findCollision).not.toHaveBeenCalled();
    });

    it('should handle database errors during collision check', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(aliasRepo.findCollision).mockRejectedValue(new Error('Collision check failed'));

        const input: AddAliasInput = { trigger: 'n:text' };

        await expect(addAlias('form1', 'user1', input)).rejects.toThrow('Collision check failed');
        expect(aliasRepo.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during alias creation', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
        vi.mocked(aliasRepo.create).mockRejectedValue(new Error('Unique constraint violation'));

        const input: AddAliasInput = { trigger: 'n:text' };

        await expect(addAlias('form1', 'user1', input)).rejects.toThrow('Unique constraint violation');
    });
});

describe('listAliases function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should list aliases for a form', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };

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
                formId: 'form1',
                triggerRaw: 'neoli:text',
                triggerNorm: 'neoli:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            },
        ];

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(aliasRepo.getByForm).mockResolvedValue(mockAliases);

        const result = await listAliases('form1', 'user1');

        expect(result).toEqual({
            form: {
                id: mockForm.id,
                name: mockForm.name,
                avatarUrl: mockForm.avatarUrl || null,
            },
            aliases: mockAliases.map(alias => ({
                id: alias.id,
                triggerRaw: alias.triggerRaw,
                triggerNorm: alias.triggerNorm,
                kind: alias.kind,
                createdAt: alias.createdAt,
            })),
        });

        expect(aliasRepo.getByForm).toHaveBeenCalledWith('form1');
    });

    it('should handle form not found', async () => {
        vi.mocked(formRepo.getById).mockResolvedValue(null);

        await expect(listAliases('form1', 'user1')).rejects.toThrow('Form not found');
    });

    it('should handle database errors during form lookup', async () => {
        vi.mocked(formRepo.getById).mockRejectedValue(new Error('Database unavailable'));

        await expect(listAliases('form1', 'user1')).rejects.toThrow('Database unavailable');
        expect(aliasRepo.getByForm).not.toHaveBeenCalled();
    });

    it('should handle database errors during alias listing', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(aliasRepo.getByForm).mockRejectedValue(new Error('Alias query failed'));

        await expect(listAliases('form1', 'user1')).rejects.toThrow('Alias query failed');
    });

    it('should handle forms with no aliases', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(aliasRepo.getByForm).mockResolvedValue([]);

        const result = await listAliases('form1', 'user1');

        expect(result.aliases).toEqual([]);
    });
});

describe('removeAlias function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should remove alias successfully', async () => {
        const mockAlias = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };

        vi.mocked(aliasRepo.getByUser).mockResolvedValue([mockAlias]);
        vi.mocked(aliasRepo.delete).mockResolvedValue(undefined);

        await removeAlias('alias1', 'user1');

        expect(aliasRepo.delete).toHaveBeenCalledWith('alias1');
    });

    it('should handle alias not found', async () => {
        vi.mocked(aliasRepo.getByUser).mockResolvedValue([]);

        await expect(removeAlias('nonexistent', 'user1')).rejects.toThrow(
            'Alias not found or does not belong to user'
        );

        expect(aliasRepo.delete).not.toHaveBeenCalled();
    });

    it('should handle alias belonging to different user', async () => {
        const mockAlias = {
            id: 'alias1',
            userId: 'user2',
            formId: 'form1',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };

        vi.mocked(aliasRepo.getByUser).mockResolvedValue([mockAlias]);

        await expect(removeAlias('alias1', 'user1')).rejects.toThrow(
            'Alias not found or does not belong to user'
        );

        expect(aliasRepo.delete).not.toHaveBeenCalled();
    });

    it('should handle database errors during alias lookup', async () => {
        vi.mocked(aliasRepo.getByUser).mockRejectedValue(new Error('Database connection failed'));

        await expect(removeAlias('alias1', 'user1')).rejects.toThrow('Database connection failed');
        expect(aliasRepo.delete).not.toHaveBeenCalled();
    });

    it('should handle database errors during alias deletion', async () => {
        const mockAlias = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };

        vi.mocked(aliasRepo.getByUser).mockResolvedValue([mockAlias]);
        vi.mocked(aliasRepo.delete).mockRejectedValue(new Error('Deletion failed'));

        await expect(removeAlias('alias1', 'user1')).rejects.toThrow('Deletion failed');
    });
});