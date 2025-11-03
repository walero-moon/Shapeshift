import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Interaction, MessageFlags } from 'discord.js';
import { handleInteractionError } from '../../src/discord/utils/errorHandler';
import { logger } from '../../src/utils/logger';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('handleInteractionError', () => {
    let mockInteraction: Interaction;

    beforeEach(() => {
        vi.clearAllMocks();
        mockInteraction = {
            type: 2, // ChatInputCommand
            user: { id: 'user123' },
            guild: { id: 'guild123' },
            isRepliable: vi.fn().mockReturnValue(true),
            replied: false,
            deferred: false,
            reply: vi.fn(),
            isCommand: vi.fn().mockReturnValue(true),
            isMessageComponent: vi.fn().mockReturnValue(false),
            isModalSubmit: vi.fn().mockReturnValue(false),
        } as any;
    });

    it('should log the error and reply with default message', async () => {
        const error = new Error('Test error');

        await handleInteractionError({ interaction: mockInteraction, error });

        expect(logger.error).toHaveBeenCalledWith('Error while handling interaction', {
            error: 'Test error',
            interactionType: 2,
            commandName: undefined,
            customId: undefined,
            userId: 'user123',
            guildId: 'guild123',
        });

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Something went wrong while handling that interaction. Please try again later.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should log the error and reply with custom message', async () => {
        const error = new Error('Custom error');

        await handleInteractionError({
            interaction: mockInteraction,
            error,
            customMessage: 'Custom error message',
        });

        expect(logger.error).toHaveBeenCalledWith('Error while handling interaction', {
            error: 'Custom error',
            interactionType: 2,
            commandName: undefined,
            customId: undefined,
            userId: 'user123',
            guildId: 'guild123',
        });

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Custom error message',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should handle "Unknown interaction" error silently', async () => {
        const error = { code: 10062, message: 'Unknown interaction' };

        await handleInteractionError({ interaction: mockInteraction, error });

        expect(logger.warn).toHaveBeenCalledWith('Unknown interaction encountered, skipping reply');
        expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should handle expired interaction gracefully', async () => {
        const error = new Error('Test error');
        mockInteraction.reply.mockRejectedValue({ code: 10062, message: 'Unknown interaction' });

        await handleInteractionError({ interaction: mockInteraction, error });

        expect(logger.warn).toHaveBeenCalledWith('Interaction expired or unknown, could not reply');
    });

    it('should not reply if interaction is not repliable', async () => {
        const error = new Error('Test error');
        mockInteraction.isRepliable.mockReturnValue(false);

        await handleInteractionError({ interaction: mockInteraction, error });

        expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should not reply if interaction is already replied', async () => {
        const error = new Error('Test error');
        mockInteraction.replied = true;

        await handleInteractionError({ interaction: mockInteraction, error });

        expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should not reply if interaction is deferred', async () => {
        const error = new Error('Test error');
        mockInteraction.deferred = true;

        await handleInteractionError({ interaction: mockInteraction, error });

        expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should handle silent mode', async () => {
        const error = new Error('Test error');

        await handleInteractionError({ interaction: mockInteraction, error, silent: true });

        expect(logger.error).toHaveBeenCalled();
        expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects', async () => {
        const error = 'String error';

        await handleInteractionError({ interaction: mockInteraction, error });

        expect(logger.error).toHaveBeenCalledWith('Error while handling interaction', {
            error: 'String error',
            interactionType: 2,
            commandName: undefined,
            customId: undefined,
            userId: 'user123',
            guildId: 'guild123',
        });
    });
});