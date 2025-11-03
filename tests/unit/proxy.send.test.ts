import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInputCommandInteraction, MessageFlags, GuildMember, GuildTextBasedChannel } from 'discord.js';
import { command } from '../../src/discord/commands/proxy.send';
import { ProxyService } from '../../src/discord/services/ProxyService';
import { permissionGuard } from '../../src/discord/middleware/permissionGuard';

// Mock ProxyService
vi.mock('../../src/discord/services/ProxyService', () => ({
    ProxyService: class {
        sendProxied = vi.fn();
    },
}));

// Mock permissionGuard
vi.mock('../../src/discord/middleware/permissionGuard', () => ({
    permissionGuard: vi.fn(),
}));

describe('/proxy send command', () => {
    let mockInteraction: ChatInputCommandInteraction;
    let mockProxyService: any;
    let mockChannel: GuildTextBasedChannel;
    let mockGuildMember: GuildMember;

    beforeEach(() => {
        vi.clearAllMocks();
        mockProxyService = new ProxyService();
        (ProxyService as any).mockClear();

        mockChannel = {
            id: 'channel123',
            isTextBased: vi.fn().mockReturnValue(true),
            isDMBased: vi.fn().mockReturnValue(false),
        } as any;

        mockGuildMember = {
            id: 'user123',
        } as any;

        mockInteraction = {
            options: {
                getSubcommand: vi.fn(),
                getString: vi.fn(),
                getAttachment: vi.fn(),
            },
            user: { id: 'user123' },
            channel: mockChannel,
            guild: {
                id: 'guild123',
                members: {
                    fetch: vi.fn(),
                },
            },
            reply: vi.fn(),
            id: 'interaction123',
        } as any;
    });

    it('should reply with unknown subcommand for invalid subcommand', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('invalid');

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Unknown subcommand.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should reply with error when member is missing', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return null;
            if (name === 'text') return 'test message';
            return null;
        });

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Member and text are required.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should reply with error when text is missing', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return '1';
            if (name === 'text') return null;
            return null;
        });

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Member and text are required.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should reply with error for invalid member ID', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return 'invalid';
            if (name === 'text') return 'test message';
            return null;
        });

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Invalid member ID.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should reply with error when not in guild text channel', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return '1';
            if (name === 'text') return 'test message';
            return null;
        });
        mockChannel.isTextBased.mockReturnValue(false);

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'This command can only be used in guild text channels.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should reply with error when in DM channel', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return '1';
            if (name === 'text') return 'test message';
            return null;
        });
        mockChannel.isDMBased.mockReturnValue(true);

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'This command can only be used in guild text channels.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should reply with error when permission guard fails', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return '1';
            if (name === 'text') return 'test message';
            return null;
        });
        mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
        vi.mocked(permissionGuard).mockReturnValue(null);

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Insufficient permissions to send message.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should successfully proxy message and reply with confirmation', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return '1';
            if (name === 'text') return 'test message';
            return null;
        });
        mockInteraction.options.getAttachment.mockImplementation((name: string) => {
            if (name === 'file1') return { name: 'file1.png' };
            if (name === 'file2') return { name: 'file2.png' };
            return null;
        });

        mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
        vi.mocked(permissionGuard).mockReturnValue({
            allowedMentions: { parse: ['users'] },
            files: [{ name: 'file1.png' }, { name: 'file2.png' }],
            flags: 4,
        });

        mockProxyService.sendProxied.mockResolvedValue({
            channelId: 'channel123',
            messageId: 'message123',
        });

        await command.execute(mockInteraction);

        expect(mockProxyService.sendProxied).toHaveBeenCalledWith({
            actorUserId: 'user123',
            memberId: 1,
            channel: mockChannel,
            content: 'test message',
            attachments: [{ name: 'file1.png' }, { name: 'file2.png' }],
            originalMessageId: 'interaction123',
        });

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Message sent: https://discord.com/channels/guild123/channel123/message123',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should handle proxy service errors', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return '1';
            if (name === 'text') return 'test message';
            return null;
        });

        mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
        vi.mocked(permissionGuard).mockReturnValue({
            allowedMentions: { parse: ['users'] },
            files: [],
            flags: 4,
        });

        mockProxyService.sendProxied.mockRejectedValue(new Error('Insufficient permissions to send message'));

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Insufficient permissions to send message.',
            flags: MessageFlags.Ephemeral,
        });
    });

    it('should handle generic proxy service errors', async () => {
        mockInteraction.options.getSubcommand.mockReturnValue('send');
        mockInteraction.options.getString.mockImplementation((name: string) => {
            if (name === 'member') return '1';
            if (name === 'text') return 'test message';
            return null;
        });

        mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
        vi.mocked(permissionGuard).mockReturnValue({
            allowedMentions: { parse: ['users'] },
            files: [],
            flags: 4,
        });

        mockProxyService.sendProxied.mockRejectedValue(new Error('Some other error'));

        await command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'An error occurred while sending the message.',
            flags: MessageFlags.Ephemeral,
        });
    });
});