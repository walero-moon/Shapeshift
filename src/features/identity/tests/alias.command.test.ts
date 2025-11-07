import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatInputCommandInteraction, AutocompleteInteraction, ButtonInteraction } from 'discord.js';
import { command } from '../discord/alias';
import { execute as autocompleteExecute } from '../discord/alias.autocomplete';
import { execute as addExecute } from '../discord/alias.add';
import { execute as listExecute } from '../discord/alias.list';
import { execute as removeExecute } from '../discord/alias.remove';
import { handleButtonInteraction } from '../discord/alias.list';
import { listForms } from '../app/ListForms';
import { addAlias } from '../app/AddAlias';
import { listAliases } from '../app/ListAliases';
import { removeAlias } from '../app/RemoveAlias';
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

// Mock addAlias
vi.mock('../app/AddAlias', () => ({
    addAlias: vi.fn(),
}));

// Mock listAliases
vi.mock('../app/ListAliases', () => ({
    listAliases: vi.fn(),
}));

// Mock removeAlias
vi.mock('../app/RemoveAlias', () => ({
    removeAlias: vi.fn(),
}));

describe('/alias command builders', () => {
    it('should produce expected JSON structure with correct subcommands', () => {
        const json = command.data.toJSON();

        expect(json).toMatchSnapshot();
    });
});

describe('alias autocomplete', () => {
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

describe('alias add', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should reject triggers without text', async () => {
        vi.mocked(addAlias).mockRejectedValue(new Error('Alias trigger must contain the literal word "text"'));

        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('form1').mockReturnValueOnce('invalidtrigger'),
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

    it('should accept n:text and {text} triggers', async () => {
        vi.mocked(addAlias).mockResolvedValue({
            id: 'alias1',
            triggerRaw: 'n:text',
            triggerNorm: 'n:text',
            kind: 'prefix',
            createdAt: new Date(),
        });

        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('form1').mockReturnValueOnce('n:text'),
            },
            user: { id: 'user1' },
        };

        await addExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(addAlias).toHaveBeenCalledWith('form1', 'user1', { trigger: 'n:text' });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: '✅ Alias "n:text" added successfully!',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should emit friendly error for duplicates by trigger_norm', async () => {
        vi.mocked(addAlias).mockRejectedValue(new Error('Alias "n:text" already exists for this user'));

        const mockInteraction = {
            deferred: false,
            deferReply: vi.fn().mockImplementation(() => { mockInteraction.deferred = true; }),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('form1').mockReturnValueOnce('n:text'),
            },
            user: { id: 'user1' },
        };

        await addExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });
});

describe('alias list', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should paginate correctly', async () => {
        const mockAliases = Array.from({ length: 10 }, (_, i) => ({
            id: `alias${i}`,
            triggerRaw: `trigger${i}:text`,
            triggerNorm: `trigger${i}:text`,
            kind: 'prefix' as const,
            createdAt: new Date(),
        }));

        vi.mocked(listAliases).mockResolvedValue({
            form: { id: 'form1', name: 'Test Form', avatarUrl: null },
            aliases: mockAliases,
        });

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            user: { id: 'user1' },
            options: {
                getString: vi.fn().mockReturnValue('form1'),
            },
        };

        await listExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            embeds: expect.any(Array),
            components: expect.any(Array),
            allowedMentions: expect.any(Object),
        });
    });

    it('should disable Prev on page 1', async () => {
        const mockAliases = Array.from({ length: 10 }, (_, i) => ({
            id: `alias${i}`,
            triggerRaw: `trigger${i}:text`,
            triggerNorm: `trigger${i}:text`,
            kind: 'prefix' as const,
            createdAt: new Date(),
        }));

        vi.mocked(listAliases).mockResolvedValue({
            form: { id: 'form1', name: 'Test Form', avatarUrl: null },
            aliases: mockAliases,
        });

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            user: { id: 'user1' },
            options: {
                getString: vi.fn().mockReturnValue('form1'),
            },
        };

        await listExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        const editReplyCall = mockInteraction.editReply.mock.calls[0]?.[0];
        expect(editReplyCall).toBeDefined();
        const components = editReplyCall.components;
        expect(components).toHaveLength(1);
        const buttons = components[0].components;
        expect(buttons[0].disabled).toBe(true); // Prev button
        expect(buttons[2].disabled).toBe(false); // Next button
    });

    it('should disable Next on last page', async () => {
        const mockAliases = Array.from({ length: 5 }, (_, i) => ({
            id: `alias${i}`,
            triggerRaw: `trigger${i}:text`,
            triggerNorm: `trigger${i}:text`,
            kind: 'prefix' as const,
            createdAt: new Date(),
        }));

        vi.mocked(listAliases).mockResolvedValue({
            form: { id: 'form1', name: 'Test Form', avatarUrl: null },
            aliases: mockAliases,
        });

        const mockInteraction = {
            customId: 'alias_list:1',
            user: { id: 'user1' },
            message: {
                embeds: [{ title: 'Aliases for Test Form (form1)' }],
            },
            update: vi.fn(),
        };

        await handleButtonInteraction(mockInteraction as unknown as ButtonInteraction);

        const updateCall = mockInteraction.update.mock.calls[0]?.[0];
        expect(updateCall).toBeDefined();
        const components = updateCall.components;
        expect(components).toHaveLength(1);
        const buttons = components[0].components;
        expect(buttons[0].disabled).toBe(false); // Prev button
        expect(buttons[2].disabled).toBe(true); // Next button
    });
});

describe('alias remove', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should succeed for own alias', async () => {
        vi.mocked(removeAlias).mockResolvedValue(undefined);

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValue('alias1'),
            },
            user: { id: 'user1' },
        };

        await removeExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(removeAlias).toHaveBeenCalledWith('alias1', 'user1');
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: '✅ Alias removed successfully!',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should fail with clear error for nonexistent alias', async () => {
        vi.mocked(removeAlias).mockRejectedValue(new Error('Alias not found or does not belong to user'));

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValue('nonexistent'),
            },
            user: { id: 'user1' },
        };

        await removeExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'Alias not found or does not belong to user',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should fail with clear error for foreign alias', async () => {
        vi.mocked(removeAlias).mockRejectedValue(new Error('Alias not found or does not belong to user'));

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValue('foreignalias'),
            },
            user: { id: 'user1' },
        };

        await removeExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'Alias not found or does not belong to user',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });
});

describe('alias command error handling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle addAlias database errors gracefully', async () => {
        vi.mocked(addAlias).mockRejectedValue(new Error('Database connection failed'));

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValueOnce('form1').mockReturnValueOnce('n:text'),
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

    it('should handle listAliases database errors gracefully', async () => {
        vi.mocked(listAliases).mockRejectedValue(new Error('Database unavailable'));

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            user: { id: 'user1' },
            options: {
                getString: vi.fn().mockReturnValue('form1'),
            },
        };

        await listExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should handle removeAlias database errors gracefully', async () => {
        vi.mocked(removeAlias).mockRejectedValue(new Error('Foreign key constraint'));

        const mockInteraction = {
            deferReply: vi.fn(),
            editReply: vi.fn(),
            options: {
                getString: vi.fn().mockReturnValue('alias1'),
            },
            user: { id: 'user1' },
        };

        await removeExecute(mockInteraction as unknown as ChatInputCommandInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should handle autocomplete errors', async () => {
        vi.mocked(listForms).mockRejectedValue(new Error('Database error'));

        const mockInteraction = {
            user: { id: 'user1' },
            options: {
                getFocused: vi.fn().mockReturnValue({ name: 'form', value: 'test' }),
            },
            respond: vi.fn(),
        };

        await expect(autocompleteExecute(mockInteraction as unknown as ChatInputCommandInteraction)).rejects.toThrow('Database error');
        expect(mockInteraction.respond).not.toHaveBeenCalled();
    });
});