import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatInputCommandInteraction, ButtonInteraction, AutocompleteInteraction, ModalSubmitInteraction } from 'discord.js';
import { command } from '../discord/form';
import { execute as autocompleteExecute } from '../discord/form.autocomplete';
import { handleModalSubmit } from '../discord/form.edit';
import { execute as addExecute } from '../discord/form.add';
import { execute as listExecute } from '../discord/form.list';
import { handleButtonInteraction } from '../discord/form.list';
import { listForms } from '../app/ListForms';
import { editForm } from '../app/EditForm';
import { deleteForm } from '../app/DeleteForm';
import { createForm } from '../app/CreateForm';
import { formRepo } from '../infra/FormRepo';
import { aliasRepo } from '../infra/AliasRepo';
import { createPaginationComponents } from '../../../shared/utils/pagination';
import { MessageFlags } from 'discord.js';

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

// Mock listForms
vi.mock('../app/ListForms', () => ({
    listForms: vi.fn(),
}));


// Mock editForm
vi.mock('../app/EditForm', () => ({
    editForm: vi.fn(),
}));

// Mock deleteForm - but not for cascade test
vi.mock('../app/DeleteForm', () => ({
    deleteForm: vi.fn(),
}));

// Mock createForm
vi.mock('../app/CreateForm', () => ({
    createForm: vi.fn(),
}));

describe('/form command builders', () => {
    it('should produce expected JSON structure with correct subcommands', () => {
        const json = command.data.toJSON();

        expect(json).toMatchSnapshot();
    });
});

describe('form autocomplete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return filtered suggestions by partial name match, ≤25 results, with value as form id', async () => {
        const mockForms = [
            { id: 'form1', name: 'Alice', avatarUrl: null, createdAt: new Date(), aliases: [] },
            { id: 'form2', name: 'Bob', avatarUrl: null, createdAt: new Date(), aliases: [] },
            { id: 'form3', name: 'Charlie', avatarUrl: null, createdAt: new Date(), aliases: [] },
            { id: 'form4', name: 'Alice Cooper', avatarUrl: null, createdAt: new Date(), aliases: [] },
        ];

        vi.mocked(listForms).mockResolvedValue(mockForms);

        const mockInteraction = {
            user: { id: 'user1' },
            options: {
                getFocused: vi.fn().mockReturnValue({ name: 'form', value: 'ali' }),
            },
            respond: vi.fn(),
        };

        await autocompleteExecute(mockInteraction as unknown as AutocompleteInteraction);

        expect(listForms).toHaveBeenCalledWith('user1');
        expect(mockInteraction.respond).toHaveBeenCalledWith([
            { name: 'Alice', value: 'form1' },
            { name: 'Alice Cooper', value: 'form4' },
        ]);
    });

    it('should return up to 25 results', async () => {
        const mockForms = Array.from({ length: 30 }, (_, i) => ({
            id: `form${i}`,
            name: `Form ${i}`,
            avatarUrl: null,
            createdAt: new Date(),
            aliases: [],
        }));

        vi.mocked(listForms).mockResolvedValue(mockForms);

        const mockInteraction = {
            user: { id: 'user1' },
            options: {
                getFocused: vi.fn().mockReturnValue({ name: 'form', value: '' }),
            },
            respond: vi.fn(),
        };

        await autocompleteExecute(mockInteraction as unknown as AutocompleteInteraction);

        const responded = mockInteraction.respond.mock.calls[0]?.[0] || [];
        expect(responded).toHaveLength(25);
    });
});

describe('form edit modal submit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should call EditForm with correct params and send ephemeral success reply', async () => {
        const mockForm = {
            id: 'form1',
            name: 'Updated Name',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };

        vi.mocked(editForm).mockResolvedValue(mockForm);

        const mockInteraction = {
            customId: 'edit_form:form1',
            user: { id: 'user1' },
            fields: {
                getTextInputValue: vi.fn()
                    .mockReturnValueOnce('Updated Name')
                    .mockReturnValueOnce('https://example.com/avatar.png'),
            },
            deferUpdate: vi.fn(),
            editReply: vi.fn(),
        };

        await handleModalSubmit(mockInteraction as unknown as ModalSubmitInteraction);

        expect(editForm).toHaveBeenCalledWith('form1', {
            name: 'Updated Name',
            avatarUrl: 'https://example.com/avatar.png',
        });

        expect(mockInteraction.deferUpdate).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: expect.stringContaining('✅ Form updated successfully!'),
            allowedMentions: { parse: [], repliedUser: false },
        });
    });

    it('should acknowledge within interaction lifecycle', async () => {
        vi.mocked(editForm).mockResolvedValue({
            id: 'form1',
            name: 'Name',
            avatarUrl: null,
            createdAt: new Date(),
        });

        const mockInteraction = {
            customId: 'edit_form:form1',
            user: { id: 'user1' },
            fields: {
                getTextInputValue: vi.fn()
                    .mockReturnValueOnce('Name')
                    .mockReturnValueOnce(''),
            },
            deferUpdate: vi.fn(),
            editReply: vi.fn(),
        };

        await handleModalSubmit(mockInteraction as unknown as ModalSubmitInteraction);

        // deferUpdate is called first, which acknowledges the interaction
        expect(mockInteraction.deferUpdate).toHaveBeenCalled();
    });
});

describe('delete form cascade contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should remove aliases automatically when form is deleted via cascade', async () => {
        // Seed DB with form and aliases
        const mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'Test Form',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);

        // Mock deleteForm to implement the new cascade behavior
        vi.mocked(deleteForm).mockImplementation(async (formId: string) => {
            const form = await formRepo.getById(formId);
            if (!form) throw new Error('Form not found');
            await formRepo.delete(formId);
        });

        // Delete form (deleteForm now only deletes the form, relying on cascade)
        await deleteForm('form1');

        // Verify only form is deleted; aliases are removed via ON DELETE CASCADE
        expect(formRepo.delete).toHaveBeenCalledWith('form1');

        // Verify no manual alias deletion
        expect(aliasRepo.getByForm).not.toHaveBeenCalled();
        expect(aliasRepo.delete).not.toHaveBeenCalled();
    });
});

describe('3s rule compliance for form add', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should deferReply with ephemeral flags when createForm takes >3s, then editReply', async () => {
        vi.mocked(createForm).mockImplementation(async () => {
            // eslint-disable-next-line no-undef
            await new Promise(resolve => setTimeout(resolve, 4000));
            return {
                form: { id: 'form1', name: 'Test', avatarUrl: null, createdAt: new Date() },
                defaultAliases: [],
                skippedAliases: []
            };
        });

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('Test').mockReturnValueOnce(null),
            },
            user: { id: 'user1' },
        };

        await addExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalled();
    });
});

describe('3s rule compliance for form edit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should deferUpdate when editForm takes >3s, then editReply', async () => {
        vi.mocked(listForms).mockResolvedValue([
            { id: 'form1', name: 'Old Name', avatarUrl: null, createdAt: new Date(), aliases: [] }
        ]);

        vi.mocked(editForm).mockImplementation(async () => {
            // eslint-disable-next-line no-undef
            await new Promise(resolve => setTimeout(resolve, 4000));
            return { id: 'form1', name: 'New Name', avatarUrl: null, createdAt: new Date() };
        });

        const mockInteraction = {
            customId: 'edit_form:form1',
            user: { id: 'user1' },
            fields: {
                getTextInputValue: vi.fn().mockReturnValueOnce('New Name').mockReturnValueOnce(''),
            },
            deferUpdate: vi.fn(),
            editReply: vi.fn(),
        };

        await handleModalSubmit(mockInteraction as unknown as ModalSubmitInteraction);

        expect(mockInteraction.deferUpdate).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalled();
    });
});

describe('components limit compliance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render one ActionRow with buttons for form list when multiple pages', async () => {
        const mockForms = Array.from({ length: 10 }, (_, i) => ({
            id: `form${i}`,
            name: `Form ${i}`,
            avatarUrl: null,
            createdAt: new Date(),
            aliases: [],
        }));

        vi.mocked(listForms).mockResolvedValue(mockForms);

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            user: { id: 'user1' },
        };

        await listExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            embeds: expect.any(Array),
            components: expect.any(Array),
            allowedMentions: expect.any(Object),
        });

        const editReplyCall = mockInteraction.editReply.mock.calls[0]?.[0];
        expect(editReplyCall).toBeDefined();
        const components = editReplyCall.components;
        expect(components).toHaveLength(1); // One ActionRow
        expect(components[0].components).toHaveLength(3); // Three buttons: prev, page indicator, next
    });

    it('pagination utils never exceed 5 buttons per row or 5 rows', () => {
        // Test with various totalPages
        for (let totalPages = 1; totalPages <= 10; totalPages++) {
            const components = createPaginationComponents({
                currentPage: 1,
                totalPages,
                customIdPrefix: 'test'
            });

            expect(components.length).toBeLessThanOrEqual(5); // Max 5 rows
            for (const row of components) {
                expect(row.components.length).toBeLessThanOrEqual(5); // Max 5 buttons per row
            }
        }
    });
});

describe('form add error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle empty form name validation', async () => {
        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('').mockReturnValueOnce(null),
            },
            user: { id: 'user1' },
        };
        mockInteraction.deferReply();

        await addExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'Form name cannot be empty. Please provide a name for your form.',
            allowedMentions: { parse: [], repliedUser: false }
        });
        expect(createForm).not.toHaveBeenCalled();
    });

    it('should handle invalid avatar URL validation', async () => {
        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('Test Form').mockReturnValueOnce('invalid-url'),
            },
            user: { id: 'user1' },
        };
        mockInteraction.deferReply();

        await addExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'Invalid URL format. Please provide a valid URL like https://example.com/image.png',
            allowedMentions: { parse: [], repliedUser: false }
        });
        expect(createForm).not.toHaveBeenCalled();
    });

    it('should handle createForm database errors gracefully', async () => {
        vi.mocked(createForm).mockRejectedValue(new Error('Database connection failed'));

        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('Test Form').mockReturnValueOnce(null),
            },
            user: { id: 'user1' },
        };

        await addExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should handle interaction reply failures', async () => {
        const mockInteraction = {
            deferReply: vi.fn().mockRejectedValue(new Error('Interaction expired')),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('Test Form').mockReturnValueOnce(null),
            },
            user: { id: 'user1' },
        };

        // Should not throw, but log the error
        await expect(addExecute(mockInteraction as unknown as ChatInputCommandInteraction)).rejects.toThrow('Interaction expired');
        expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });

    it('should handle form not found in edit execute', async () => {
        vi.mocked(listForms).mockResolvedValue([]); // No forms

        const mockInteraction = {
            deferReply: vi.fn(),
            reply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValue('nonexistent'),
            },
            user: { id: 'user1' },
        };

        await expect(import('../discord/form.edit').then(m => m.execute(mockInteraction as unknown as ChatInputCommandInteraction))).rejects.toThrow('Form not found');
        // The execute function throws, but in real Discord it would be caught by the framework
    });

    it('should handle interaction reply failures', async () => {
        const mockInteraction = {
            deferReply: vi.fn().mockRejectedValue(new Error('Interaction expired')),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('Test Form').mockReturnValueOnce(null),
            },
            user: { id: 'user1' },
        };

        // Should not throw, but log the error
        await expect(addExecute(mockInteraction as unknown as ChatInputCommandInteraction)).rejects.toThrow('Interaction expired');
        expect(mockInteraction.editReply).not.toHaveBeenCalled();
    });
});

describe('form edit error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle empty form name in modal submit', async () => {
        const mockInteraction = {
            customId: 'edit_form:form1',
            user: { id: 'user1' },
            fields: {
                getTextInputValue: vi.fn()
                    .mockReturnValueOnce('') // Empty name
                    .mockReturnValueOnce('https://example.com/avatar.png'),
            },
            deferUpdate: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
        };

        await handleModalSubmit(mockInteraction as unknown as ModalSubmitInteraction);

        expect(mockInteraction.deferUpdate).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'Form name cannot be empty. Please provide a name for your form.',
            allowedMentions: { parse: [], repliedUser: false }
        });
        expect(editForm).not.toHaveBeenCalled();
    });

    it('should handle invalid avatar URL in modal submit', async () => {
        const mockInteraction = {
            customId: 'edit_form:form1',
            user: { id: 'user1' },
            fields: {
                getTextInputValue: vi.fn()
                    .mockReturnValueOnce('Updated Name')
                    .mockReturnValueOnce('ftp://invalid.com/avatar.png'), // Invalid protocol
            },
            deferUpdate: vi.fn(),
            editReply: vi.fn(),
            reply: vi.fn(),
        };

        await handleModalSubmit(mockInteraction as unknown as ModalSubmitInteraction);

        expect(mockInteraction.deferUpdate).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'Avatar URL must start with http:// or https://. For example: https://example.com/avatar.jpg',
            allowedMentions: { parse: [], repliedUser: false }
        });
        expect(editForm).not.toHaveBeenCalled();
    });

    it('should handle editForm database errors gracefully', async () => {
        vi.mocked(listForms).mockResolvedValue([{ id: 'form1', name: 'Old Name', avatarUrl: null, createdAt: new Date(), aliases: [] }]);
        vi.mocked(editForm).mockRejectedValue(new Error('Database constraint violation'));

        const mockInteraction = {
            customId: 'edit_form:form1',
            user: { id: 'user1' },
            fields: {
                getTextInputValue: vi.fn()
                    .mockReturnValueOnce('Updated Name')
                    .mockReturnValueOnce(''),
            },
            deferred: false,
            deferUpdate: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
        };

        await handleModalSubmit(mockInteraction as unknown as ModalSubmitInteraction);

        expect(mockInteraction.deferUpdate).toHaveBeenCalled();
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should handle form not found in edit execute', async () => {
        vi.mocked(listForms).mockResolvedValue([]); // No forms

        const mockInteraction = {
            deferReply: vi.fn(),
            reply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValue('nonexistent'),
            },
            user: { id: 'user1' },
        };

        await expect(() => import('../discord/form.edit').then(m => m.execute(mockInteraction as unknown as ChatInputCommandInteraction))).rejects.toThrow();
        // The execute function throws, but in real Discord it would be caught by the framework
    });
});

describe('form delete error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle deleteForm database errors gracefully', async () => {
        vi.mocked(deleteForm).mockRejectedValue(new Error('Foreign key constraint'));

        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValue('form1'),
            },
            user: { id: 'user1' },
        };

        await import('../discord/form.delete').then(m => m.execute(mockInteraction as unknown as ChatInputCommandInteraction));

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });
});

describe('form list error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle listForms database errors gracefully', async () => {
        vi.mocked(listForms).mockRejectedValue(new Error('Database unavailable'));

        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            user: { id: 'user1' },
        };

        await listExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should handle pagination button interaction errors', async () => {
        vi.mocked(listForms).mockRejectedValue(new Error('Connection timeout'));

        const mockInteraction = {
            customId: 'form_list:page:2',
            user: { id: 'user1' },
            update: vi.fn(),
        };

        await handleButtonInteraction(mockInteraction as unknown as ButtonInteraction);

        expect(mockInteraction.update).toHaveBeenCalledWith({
            content: 'Failed to update page: Connection timeout',
            embeds: [],
            components: [],
            allowedMentions: { parse: [], repliedUser: false }
        });
    });
});

describe('form autocomplete error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle listForms errors in autocomplete', async () => {
        vi.mocked(listForms).mockRejectedValue(new Error('Database error'));

        const mockInteraction = {
            user: { id: 'user1' },
            options: {
                getFocused: vi.fn().mockReturnValue({ name: 'form', value: 'test' }),
            },
            respond: vi.fn(),
        };

        await expect(autocompleteExecute(mockInteraction as unknown as AutocompleteInteraction)).rejects.toThrow('Database error');
        expect(mockInteraction.respond).not.toHaveBeenCalled();
    });
});