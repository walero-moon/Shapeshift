import { describe, expect, it, vi } from 'vitest';
import { command } from './ping';

describe('/ping command', () => {
    it('defers ephemerally and edits with Pong', async () => {
        const message = { id: 'reply' };
        const interaction = {
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(message),
        };

        await expect(command.execute(interaction as never)).resolves.toBe(message);
        expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Pong!' });
    });
});
