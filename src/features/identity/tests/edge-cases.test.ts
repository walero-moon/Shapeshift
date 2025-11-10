import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm } from '../app/CreateForm';
import { editForm } from '../app/EditForm';
import { addAlias } from '../app/AddAlias';
import { normalizeAlias } from '../app/NormalizeAlias';
import { formRepo } from '../infra/FormRepo';
import { aliasRepo } from '../infra/AliasRepo';

// Mock the repositories
vi.mock('../infra/FormRepo', () => ({
    formRepo: {
        getById: vi.fn(),
        getByUser: vi.fn(),
        create: vi.fn(),
        updateNameAvatar: vi.fn(),
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

describe('Edge Cases and Input Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Empty and whitespace inputs', () => {
        it('should reject empty form name', async () => {
            await expect(createForm('user1', { name: '' })).rejects.toThrow('Form name is required');
            await expect(createForm('user1', { name: '   ' })).rejects.toThrow('Form name is required');
        });

        it('should reject empty alias triggers', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

            await expect(addAlias('form1', 'user1', { trigger: '' })).rejects.toThrow('Alias trigger is required');
            await expect(addAlias('form1', 'user1', { trigger: '   ' })).rejects.toThrow('Alias trigger is required');
        });

        it('should handle empty avatar URL as null', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test Form',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.create).mockResolvedValue(mockForm);
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
            vi.mocked(aliasRepo.create).mockResolvedValue({
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'test:text',
                triggerNorm: 'test:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            });

            await createForm('user1', { name: 'Test Form', avatarUrl: '' });

            expect(formRepo.create).toHaveBeenCalledWith('user1', {
                name: 'Test Form',
                avatarUrl: null
            });
        });
    });

    describe('Malformed URLs', () => {
        it('should handle various malformed URL formats', () => {
            // These should all be caught by URL constructor or validation
            expect(() => new globalThis.URL('')).toThrow();
            expect(() => new globalThis.URL('   ')).toThrow();
            expect(() => new globalThis.URL('not-a-url')).toThrow();
            expect(() => new globalThis.URL('http://')).toThrow();
            expect(() => new globalThis.URL('https://')).toThrow();
            expect(() => new globalThis.URL('ftp://example.com')).not.toThrow();
            expect(() => new globalThis.URL('://')).toThrow();
        });

        it('should handle URLs with special characters', () => {
            // Valid URLs with special characters
            expect(() => new globalThis.URL('https://example.com/path with spaces')).not.toThrow();
            expect(() => new globalThis.URL('https://example.com/path?query=value&other=test')).not.toThrow();
            expect(() => new globalThis.URL('https://example.com/path#fragment')).not.toThrow();
        });
    });

    describe('Duplicate handling', () => {
        it('should handle duplicate form names (allowed)', async () => {
            const mockForm1 = {
                id: 'form1',
                userId: 'user1',
                name: 'Duplicate Name',
                avatarUrl: null,
                createdAt: new Date(),
            };
            const mockForm2 = {
                id: 'form2',
                userId: 'user1',
                name: 'Duplicate Name',
                avatarUrl: null,
                createdAt: new Date(),
            };

            vi.mocked(formRepo.create).mockResolvedValueOnce(mockForm1);
            vi.mocked(formRepo.getByUser).mockResolvedValue([mockForm1, mockForm2]);

            // Forms can have duplicate names for the same user
            const result = await createForm('user1', { name: 'Duplicate Name' });
            expect(result.form.name).toBe('Duplicate Name');
        });

        it('should prevent duplicate normalized aliases', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

            const existingAlias = {
                id: 'existing',
                userId: 'user1',
                formId: 'other',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            };
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(existingAlias);

            await expect(addAlias('form1', 'user1', { trigger: 'n:text' })).rejects.toThrow('Alias "n:text" already exists for this user');
        });

        it('should handle case-insensitive duplicate detection', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

            const existingAlias = {
                id: 'existing',
                userId: 'user1',
                formId: 'other',
                triggerRaw: 'N:TEXT',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            };
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(existingAlias);

            await expect(addAlias('form1', 'user1', { trigger: 'n:text' })).rejects.toThrow('Alias "n:text" already exists for this user');
        });
    });

    describe('Database unavailability simulation', () => {
        it('should handle form creation during DB unavailability', async () => {
            vi.mocked(formRepo.create).mockRejectedValue(new Error('Connection refused'));

            await expect(createForm('user1', { name: 'Test' })).rejects.toThrow('Connection refused');
        });

        it('should handle form editing during DB unavailability', async () => {
            vi.mocked(formRepo.updateNameAvatar).mockRejectedValue(new Error('Database unavailable'));

            await expect(editForm('form1', { name: 'New Name' })).rejects.toThrow('Database unavailable');
        });

        it('should handle alias creation during DB unavailability', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
            vi.mocked(aliasRepo.create).mockRejectedValue(new Error('Connection timeout'));

            await expect(addAlias('form1', 'user1', { trigger: 'n:text' })).rejects.toThrow('Connection timeout');
        });
    });

    describe('Unicode and special characters', () => {
        it('should handle unicode characters in form names', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Tëst Førm 🌟',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.create).mockResolvedValue(mockForm);
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
            vi.mocked(aliasRepo.create).mockResolvedValue({
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'tëst:text',
                triggerNorm: 'tëst:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            });

            const result = await createForm('user1', { name: 'Tëst Førm 🌟' });
            expect(result.form.name).toBe('Tëst Førm 🌟');
        });

        it('should handle unicode in alias triggers', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
            vi.mocked(aliasRepo.create).mockResolvedValue({
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'tëst:text',
                triggerNorm: 'tëst:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            });

            const result = await addAlias('form1', 'user1', { trigger: 'tëst:text' });
            expect(result.triggerRaw).toBe('tëst:text');
        });
    });

    describe('Extremely long inputs', () => {
        it('should handle very long form names', async () => {
            const longName = 'A'.repeat(1000);
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: longName,
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.create).mockResolvedValue(mockForm);

            const result = await createForm('user1', { name: longName });
            expect(result.form.name).toBe(longName);
        });

        it('should handle very long alias triggers', async () => {
            const longTrigger = 'A'.repeat(500) + ':text';
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
            vi.mocked(aliasRepo.create).mockResolvedValue({
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: longTrigger,
                triggerNorm: longTrigger.toLowerCase(),
                kind: 'prefix' as const,
                createdAt: new Date(),
            });

            const result = await addAlias('form1', 'user1', { trigger: longTrigger });
            expect(result.triggerRaw).toBe(longTrigger);
        });
    });

    describe('Boundary conditions', () => {
        it('should handle single character form names', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'A',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.create).mockResolvedValue(mockForm);
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
            vi.mocked(aliasRepo.create).mockResolvedValue({
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'a:text',
                triggerNorm: 'a:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            });

            const result = await createForm('user1', { name: 'A' });
            expect(result.form.name).toBe('A');
            expect(result.defaultAliases).toHaveLength(1);
            expect(result.skippedAliases).toHaveLength(1); // Short alias skipped for single char
        });

        it('should handle form names with only special characters', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: '!@#$%',
                avatarUrl: null,
                createdAt: new Date(),
            };
            vi.mocked(formRepo.create).mockResolvedValue(mockForm);
            vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
            vi.mocked(aliasRepo.create).mockResolvedValue({
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: '!@#$%:text',
                triggerNorm: '!@#$%:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            });

            const result = await createForm('user1', { name: '!@#$%' });
            expect(result.form.name).toBe('!@#$%');
        });
    });

    describe('Pattern alias edge cases', () => {
        it('should handle pattern aliases with various bracket styles', async () => {
            expect(await normalizeAlias('{text}')).toBe('{text}');
            expect(await normalizeAlias('{ text }')).toBe('{ text }');
            expect(await normalizeAlias('{TEXT}')).toBe('{text}');
        });

        it('should reject malformed pattern aliases', async () => {
            await expect(normalizeAlias('{text')).rejects.toThrow('Alias trigger must contain the literal word "text"');
            await expect(normalizeAlias('text}')).rejects.toThrow('Alias trigger must contain the literal word "text"');
            await expect(normalizeAlias('{}')).rejects.toThrow('Alias trigger must contain the literal word "text"');
        });
    });
});