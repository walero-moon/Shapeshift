import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm, CreateFormInput } from '../app/CreateForm';
import { editForm, EditFormInput } from '../app/EditForm';
import { deleteForm } from '../app/DeleteForm';
import { listForms } from '../app/ListForms';
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

describe('createForm function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create form successfully with default aliases', async () => {
        // Mock form creation
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };
        vi.mocked(formRepo.create).mockResolvedValue(mockForm);

        // Mock no alias collisions
        vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);

        // Mock alias creation
        const mockAlias1 = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'neoli:text',
            triggerNorm: 'neoli:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };
        const mockAlias2 = {
            id: 'alias2',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };
        vi.mocked(aliasRepo.create)
            .mockResolvedValueOnce(mockAlias1)
            .mockResolvedValueOnce(mockAlias2);

        const input: CreateFormInput = {
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
        };
        const result = await createForm('user1', input);

        expect(result).toEqual({
            form: {
                id: mockForm.id,
                name: mockForm.name,
                avatarUrl: mockForm.avatarUrl,
                createdAt: mockForm.createdAt,
            },
            defaultAliases: [
                {
                    triggerRaw: mockAlias1.triggerRaw,
                    triggerNorm: mockAlias1.triggerNorm,
                    kind: mockAlias1.kind,
                },
                {
                    triggerRaw: mockAlias2.triggerRaw,
                    triggerNorm: mockAlias2.triggerNorm,
                    kind: mockAlias2.kind,
                },
            ],
            skippedAliases: [],
        });

        expect(formRepo.create).toHaveBeenCalledWith('user1', {
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
        });

        // Should create two default aliases
        expect(aliasRepo.create).toHaveBeenCalledTimes(2);
    });

    it('should create form without short alias if collision exists', async () => {
        // Mock form creation
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };
        vi.mocked(formRepo.create).mockResolvedValue(mockForm);

        // Mock collision for short alias (n:text) but not for long alias (neoli:text)
        vi.mocked(aliasRepo.findCollision)
            .mockResolvedValueOnce(null) // No collision for "neoli:text"
            .mockResolvedValueOnce({
                id: 'existing_alias',
                userId: 'user1',
                formId: 'other_form',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
            }); // Collision for "n:text"

        // Mock alias creation for the long alias only
        const mockAlias = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'neoli:text',
            triggerNorm: 'neoli:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };
        vi.mocked(aliasRepo.create).mockResolvedValue(mockAlias);

        const input: CreateFormInput = {
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
        };
        const result = await createForm('user1', input);

        expect(result).toEqual({
            form: {
                id: mockForm.id,
                name: mockForm.name,
                avatarUrl: mockForm.avatarUrl,
                createdAt: mockForm.createdAt,
            },
            defaultAliases: [
                {
                    triggerRaw: mockAlias.triggerRaw,
                    triggerNorm: mockAlias.triggerNorm,
                    kind: mockAlias.kind,
                },
            ],
            skippedAliases: [
                {
                    triggerRaw: 'n:text',
                    reason: 'Alias already exists',
                },
            ],
        });

        // Should only create one alias (skip the colliding short alias)
        expect(aliasRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid form name', async () => {
        const input: CreateFormInput = {
            name: '', // Empty name
            avatarUrl: 'https://example.com/avatar.png',
        };

        await expect(createForm('user1', input)).rejects.toThrow(
            'Form name is required'
        );
    });

    it('should handle database errors during form creation', async () => {
        vi.mocked(formRepo.create).mockRejectedValue(new Error('Database connection failed'));

        const input: CreateFormInput = {
            name: 'Test Form',
            avatarUrl: 'https://example.com/avatar.png',
        };

        await expect(createForm('user1', input)).rejects.toThrow('Database connection failed');
        expect(aliasRepo.create).not.toHaveBeenCalled();
    });

    it('should handle alias creation errors and cleanup form', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date(),
        };
        vi.mocked(formRepo.create).mockResolvedValue(mockForm);
        vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);
        vi.mocked(aliasRepo.create).mockRejectedValue(new Error('Alias creation failed'));
        vi.mocked(formRepo.delete).mockResolvedValue(undefined);

        const input: CreateFormInput = {
            name: 'Test Form',
        };

        await expect(createForm('user1', input)).rejects.toThrow('Alias creation failed');
        expect(formRepo.delete).toHaveBeenCalledWith('form1');
    });

    it('should handle single character names by skipping short alias', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'A',
            avatarUrl: null,
            createdAt: new Date(),
        };
        vi.mocked(formRepo.create).mockResolvedValue(mockForm);
        vi.mocked(aliasRepo.findCollision).mockResolvedValue(null);

        const mockAlias = {
            id: 'alias1',
            userId: 'user1',
            formId: 'form1',
            triggerRaw: 'a:text',
            triggerNorm: 'a:text',
            kind: 'prefix' as const,
            createdAt: new Date(),
        };
        vi.mocked(aliasRepo.create).mockResolvedValue(mockAlias);

        const input: CreateFormInput = {
            name: 'A',
        };
        const result = await createForm('user1', input);

        expect(aliasRepo.create).toHaveBeenCalledTimes(1);
        expect(result.skippedAliases).toEqual([
            {
                triggerRaw: 'a:text',
                reason: 'Single character name',
            },
        ]);
    });
});

describe('editForm function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should update form name and avatar', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'New Name',
            avatarUrl: 'https://example.com/new.png',
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(formRepo.updateNameAvatar).mockResolvedValue(mockForm);

        const input: EditFormInput = {
            name: 'New Name',
            avatarUrl: 'https://example.com/new.png',
        };
        const result = await editForm('form1', 'user1', input);

        expect(result).toEqual({
            id: mockForm.id,
            name: mockForm.name,
            avatarUrl: mockForm.avatarUrl,
            createdAt: mockForm.createdAt,
        });

        expect(formRepo.updateNameAvatar).toHaveBeenCalledWith('form1', {
            name: 'New Name',
            avatarUrl: 'https://example.com/new.png',
        });
    });

    it('should reject edit of form belonging to another user', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Original Name',
            avatarUrl: 'https://example.com/original.png',
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

        const input: EditFormInput = {
            name: 'New Name',
        };

        await expect(editForm('form1', 'user2', input)).rejects.toThrow(
            'Form does not belong to user'
        );

        expect(formRepo.updateNameAvatar).not.toHaveBeenCalled();
    });

    it('should require at least one field for update', async () => {
        const input: EditFormInput = {};

        await expect(editForm('form1', 'user1', input)).rejects.toThrow(
            'At least one field must be provided for update'
        );
    });

    it('should reject empty form name', async () => {
        const input: EditFormInput = {
            name: '',
        };

        await expect(editForm('form1', 'user1', input)).rejects.toThrow(
            'Form name cannot be empty'
        );
    });

    it('should handle database errors during update', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Original Name',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(formRepo.updateNameAvatar).mockRejectedValue(new Error('Database constraint violation'));

        const input: EditFormInput = {
            name: 'New Name',
        };

        await expect(editForm('form1', 'user1', input)).rejects.toThrow('Database constraint violation');
    });

    it('should handle partial updates (only name)', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'New Name',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(formRepo.updateNameAvatar).mockResolvedValue(mockForm);

        const input: EditFormInput = {
            name: 'New Name',
        };
        await editForm('form1', 'user1', input);

        expect(formRepo.updateNameAvatar).toHaveBeenCalledWith('form1', {
            name: 'New Name',
        });
    });

    it('should handle partial updates (only avatar)', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Old Name',
            avatarUrl: 'https://example.com/new.png',
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(formRepo.updateNameAvatar).mockResolvedValue(mockForm);

        const input: EditFormInput = {
            avatarUrl: 'https://example.com/new.png',
        };
        await editForm('form1', 'user1', input);

        expect(formRepo.updateNameAvatar).toHaveBeenCalledWith('form1', {
            avatarUrl: 'https://example.com/new.png',
        });
    });
});

describe('deleteForm function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should delete form and all its aliases via cascade', async () => {
        // Mock form exists
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

        await deleteForm('form1', 'user1');

        // Should only delete the form; aliases are removed via ON DELETE CASCADE
        expect(formRepo.delete).toHaveBeenCalledWith('form1');

        // No manual alias operations
        expect(aliasRepo.getByForm).not.toHaveBeenCalled();
        expect(aliasRepo.delete).not.toHaveBeenCalled();
    });

    it('should reject deletion of form belonging to another user', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

        await expect(deleteForm('form1', 'user2')).rejects.toThrow(
            'Form does not belong to user'
        );

        expect(formRepo.delete).not.toHaveBeenCalled();
    });

    it('should handle form not found', async () => {
        vi.mocked(formRepo.getById).mockResolvedValue(null);

        await expect(deleteForm('form1', 'user1')).rejects.toThrow(
            'Form not found'
        );
    });

    it('should handle database errors during deletion', async () => {
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(formRepo.delete).mockRejectedValue(new Error('Foreign key constraint'));

        await expect(deleteForm('form1', 'user1')).rejects.toThrow('Foreign key constraint');
    });
});

describe('listForms function', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should list forms for user with their aliases', async () => {
        const timestamp1 = new Date();
        const timestamp2 = new Date(timestamp1.getTime() + 1); // Different timestamp for second alias

        const mockForms = [
            {
                id: 'form1',
                userId: 'user1',
                name: 'Form 1',
                avatarUrl: 'https://example.com/avatar1.png',
                createdAt: new Date('2023-01-01'),
            },
            {
                id: 'form2',
                userId: 'user1',
                name: 'Form 2',
                avatarUrl: null,
                createdAt: new Date('2023-01-02'),
            },
        ];

        const mockAliases1 = [
            {
                id: 'alias1',
                userId: 'user1',
                formId: 'form1',
                triggerRaw: 'form1:text',
                triggerNorm: 'form1:text',
                kind: 'prefix' as const,
                createdAt: timestamp1,
            },
        ];

        const mockAliases2 = [
            {
                id: 'alias2',
                userId: 'user1',
                formId: 'form2',
                triggerRaw: 'form2:text',
                triggerNorm: 'form2:text',
                kind: 'prefix' as const,
                createdAt: timestamp2,
            },
        ];

        vi.mocked(formRepo.getByUser).mockResolvedValue(mockForms);
        vi.mocked(aliasRepo.getByForm)
            .mockResolvedValueOnce(mockAliases1)
            .mockResolvedValueOnce(mockAliases2);

        const result = await listForms('user1');

        expect(result).toEqual([
            {
                id: 'form1',
                name: 'Form 1',
                avatarUrl: 'https://example.com/avatar1.png',
                createdAt: new Date('2023-01-01'),
                aliases: [
                    {
                        id: 'alias1',
                        triggerRaw: 'form1:text',
                        triggerNorm: 'form1:text',
                        kind: 'prefix',
                        createdAt: timestamp1,
                    },
                ],
            },
            {
                id: 'form2',
                name: 'Form 2',
                avatarUrl: null,
                createdAt: new Date('2023-01-02'),
                aliases: [
                    {
                        id: 'alias2',
                        triggerRaw: 'form2:text',
                        triggerNorm: 'form2:text',
                        kind: 'prefix',
                        createdAt: timestamp2,
                    },
                ],
            },
        ]);

        expect(formRepo.getByUser).toHaveBeenCalledWith('user1');
        expect(aliasRepo.getByForm).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when user has no forms', async () => {
        vi.mocked(formRepo.getByUser).mockResolvedValue([]);

        const result = await listForms('user1');

        expect(result).toEqual([]);
    });

    it('should handle database errors during form listing', async () => {
        vi.mocked(formRepo.getByUser).mockRejectedValue(new Error('Database unavailable'));

        const result = await listForms('user1');

        expect(result).toEqual([]);
        expect(aliasRepo.getByForm).not.toHaveBeenCalled();
    });

    it('should handle database errors during alias fetching', async () => {
        const mockForms = [
            {
                id: 'form1',
                userId: 'user1',
                name: 'Form 1',
                avatarUrl: null,
                createdAt: new Date(),
            },
        ];

        vi.mocked(formRepo.getByUser).mockResolvedValue(mockForms);
        vi.mocked(aliasRepo.getByForm).mockRejectedValue(new Error('Alias query failed'));

        const result = await listForms('user1');

        expect(result).toEqual([
            {
                id: 'form1',
                name: 'Form 1',
                avatarUrl: null,
                createdAt: mockForms[0]!.createdAt,
                aliases: [],
            },
        ]);
    });

    it('should handle database errors during form listing', async () => {
        vi.mocked(formRepo.getByUser).mockRejectedValue(new Error('Database unavailable'));

        const result = await listForms('user1');

        expect(result).toEqual([]);
        expect(aliasRepo.getByForm).not.toHaveBeenCalled();
    });
});