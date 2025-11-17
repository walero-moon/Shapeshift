import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ButtonInteraction, StringSelectMenuInteraction, Client } from 'discord.js';
import { handleButtonInteraction, handleSelectInteraction } from '../../proxy/discord/shapeshift';

vi.mock('../app/autoproxy/ClearAutoproxyState', () => ({
    clearAutoproxyState: vi.fn(() => Promise.resolve({ success: true, clearedCount: 1 })),
}));

vi.mock('../app/autoproxy/SetAutoproxyState', () => ({
    setAutoproxyState: vi.fn(() =>
        Promise.resolve({
            success: true,
            state: {
                id: 'state1',
                userId: 'user1',
                mode: 'form' as const,
                formId: 'form1',
                lastFormId: null,
                guildId: 'guild1',
                channelId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        })
    ),
}));

vi.mock('../../identity/app/ListForms', () => ({
    listForms: vi.fn(() =>
        Promise.resolve([
            { id: 'form1', name: 'Form One', aliases: [], avatarUrl: null, createdAt: new Date() },
            { id: 'form2', name: 'Form Two', aliases: [], avatarUrl: null, createdAt: new Date() },
        ])
    ),
}));

vi.mock('../../identity/infra/FormRepo', () => ({
    formRepo: {
        getCachedByUserAndId: vi.fn(() => Promise.resolve({ id: 'form2', name: 'Form Two' })),
    },
}));

vi.mock('../infra/AutoproxyRepo', () => ({
    autoproxyRepo: {
        getAllStates: vi.fn(),
        getStateById: vi.fn(() =>
            Promise.resolve({
                id: 'state1',
                userId: 'user1',
                mode: 'form' as const,
                formId: 'form1',
                lastFormId: null,
                guildId: 'guild1',
                channelId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
        ),
    },
}));

vi.mock('../../../shared/utils/logger', () => ({
    log: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

import { clearAutoproxyState } from '../app/autoproxy/ClearAutoproxyState';
import { setAutoproxyState } from '../app/autoproxy/SetAutoproxyState';
import { autoproxyRepo } from '../infra/AutoproxyRepo';
import { listForms } from '../../identity/app/ListForms';
import { formRepo } from '../../identity/infra/FormRepo';

describe('shapeshift button handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockClient = {
        guilds: { cache: new Map([['guild1', { name: 'Dev Guild' }]]) },
        channels: { cache: new Map() },
    } as unknown as Client;

    function createButtonInteraction(customId: string): ButtonInteraction {
        return {
            customId,
            user: { id: 'user1' },
            guild: null,
            channel: null,
            client: mockClient,
            deferReply: vi.fn(() => Promise.resolve()),
            editReply: vi.fn(() => Promise.resolve()),
        } as unknown as ButtonInteraction;
    }

    function createSelectInteraction(customId: string, value: string): StringSelectMenuInteraction {
        return {
            customId,
            values: [value],
            user: { id: 'user1' },
            guild: null,
            channel: null,
            client: mockClient,
            replied: false,
            deferred: false,
            update: vi.fn(() => Promise.resolve()),
            reply: vi.fn(() => Promise.resolve()),
            editReply: vi.fn(() => Promise.resolve()),
        } as unknown as StringSelectMenuInteraction;
    }

    it('handles clear button', async () => {
        const interaction = createButtonInteraction('autoproxy:clear:state1');

        await handleButtonInteraction(interaction);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(autoproxyRepo.getStateById).toHaveBeenCalledWith('state1');
        expect(clearAutoproxyState).toHaveBeenCalledWith({
            userId: 'user1',
            scope: 'guild',
            guildId: 'guild1',
            channelId: null
        });
        expect(interaction.editReply).toHaveBeenCalled();
    });

    it('renders switch select when switch button pressed', async () => {
        const interaction = createButtonInteraction('autoproxy:switch:state1');

        await handleButtonInteraction(interaction);

        expect(interaction.deferReply).toHaveBeenCalled();
        expect(autoproxyRepo.getStateById).toHaveBeenCalledWith('state1');
        expect(listForms).toHaveBeenCalledWith('user1');
        expect(interaction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({
                components: expect.any(Array),
            })
        );
    });

    it('switch select updates autoproxy', async () => {
        const interaction = createSelectInteraction('autoproxy:switch-select:state1', 'form2');

        await handleSelectInteraction(interaction);

        expect(setAutoproxyState).toHaveBeenCalledWith({
            userId: 'user1',
            mode: 'form',
            formId: 'form2',
            scope: 'guild',
            guildId: 'guild1',
            channelId: null
        });
        expect(formRepo.getCachedByUserAndId).toHaveBeenCalledWith('user1', 'form2');
        expect(interaction.update).toHaveBeenCalledWith({
            content: expect.stringContaining('Form Two'),
            components: []
        });
    });
});
