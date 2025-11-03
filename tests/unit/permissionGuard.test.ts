import { describe, it, expect, vi, beforeEach } from 'vitest';
import { permissionGuard } from '../../src/discord/middleware/permissionGuard';
import { GuildMember, GuildTextBasedChannel, PermissionsBitField, MessageFlags } from 'discord.js';

describe('permissionGuard', () => {
    let mockMember: GuildMember;
    let mockChannel: GuildTextBasedChannel;
    let mockPermissions: any;

    beforeEach(() => {
        mockPermissions = {
            has: vi.fn(),
        };

        mockMember = {
            permissionsIn: vi.fn(() => mockPermissions),
        } as any;

        mockChannel = {} as any;
    });

    it('should return null if member cannot send messages', () => {
        mockPermissions.has.mockReturnValue(false);

        const result = permissionGuard({
            member: mockMember,
            channel: mockChannel,
            source: { content: 'test' },
        });

        expect(result).toBeNull();
        expect(mockPermissions.has).toHaveBeenCalledWith(PermissionsBitField.Flags.SendMessages);
    });

    it('should suppress embeds if no embed links permission', () => {
        mockPermissions.has
            .mockReturnValueOnce(true) // SendMessages
            .mockReturnValueOnce(false) // EmbedLinks
            .mockReturnValueOnce(true) // AttachFiles
            .mockReturnValueOnce(false); // MentionEveryone

        const result = permissionGuard({
            member: mockMember,
            channel: mockChannel,
            source: { content: 'test' },
        });

        expect(result).toEqual({
            allowedMentions: { parse: ['users', 'roles'] },
            files: undefined,
            flags: MessageFlags.SuppressEmbeds,
        });
    });

    it('should drop attachments if no attach files permission', () => {
        mockPermissions.has
            .mockReturnValueOnce(true) // SendMessages
            .mockReturnValueOnce(true) // EmbedLinks
            .mockReturnValueOnce(false) // AttachFiles
            .mockReturnValueOnce(false); // MentionEveryone

        const result = permissionGuard({
            member: mockMember,
            channel: mockChannel,
            source: { content: 'test', attachments: [{ name: 'file.png' }] },
        });

        expect(result).toEqual({
            allowedMentions: { parse: ['users', 'roles'] },
            files: undefined,
            flags: undefined,
        });
    });

    it('should allow everything with full permissions', () => {
        mockPermissions.has
            .mockReturnValueOnce(true) // SendMessages
            .mockReturnValueOnce(true) // EmbedLinks
            .mockReturnValueOnce(true) // AttachFiles
            .mockReturnValueOnce(true); // MentionEveryone

        const result = permissionGuard({
            member: mockMember,
            channel: mockChannel,
            source: {
                content: 'test',
                attachments: [{ name: 'file.png' }],
                mentions: { users: ['user1'], roles: ['role1'] }
            },
        });

        expect(result).toEqual({
            allowedMentions: { parse: ['users', 'roles', 'everyone'] },
            files: [{ name: 'file.png' }],
            flags: undefined,
        });
    });

    it('should include specific mentions when no mention everyone permission', () => {
        mockPermissions.has
            .mockReturnValueOnce(true) // SendMessages
            .mockReturnValueOnce(true) // EmbedLinks
            .mockReturnValueOnce(true) // AttachFiles
            .mockReturnValueOnce(false); // MentionEveryone

        const result = permissionGuard({
            member: mockMember,
            channel: mockChannel,
            source: {
                content: 'test',
                mentions: { users: ['user1'], roles: ['role1'] }
            },
        });

        expect(result).toEqual({
            allowedMentions: {
                parse: ['users', 'roles'],
                users: ['user1'],
                roles: ['role1']
            },
            files: undefined,
            flags: undefined,
        });
    });
});