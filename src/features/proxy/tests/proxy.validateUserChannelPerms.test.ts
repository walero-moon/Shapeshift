import { describe, it, expect, beforeEach, vi, Mocked } from 'vitest';
import { validateUserChannelPerms } from '../app/ValidateUserChannelPerms';
import { TextChannel, Guild, GuildMember, PermissionsBitField, Attachment } from 'discord.js';

// Mock discord.js
vi.mock('discord.js', () => ({
    PermissionsBitField: {
        Flags: {
            ViewChannel: 1 << 10,
            SendMessages: 1 << 11,
            AttachFiles: 1 << 15,
        },
    },
}));

describe('validateUserChannelPerms function', () => {
    let mockChannel: Mocked<TextChannel>;
    let mockGuild: Mocked<Guild>;
    let mockMember: Mocked<GuildMember>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockGuild = {
            members: {
                fetch: vi.fn(),
            },
        } as unknown as Mocked<Guild>;

        mockMember = {
            permissionsIn: vi.fn(),
        } as unknown as Mocked<GuildMember>;

        mockChannel = {
            guild: mockGuild,
        } as unknown as Mocked<TextChannel>;

        (mockGuild.members.fetch as any).mockResolvedValue(mockMember);
    });

    it('should return true when user has all required permissions without attachments', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn().mockReturnValue(true),
        } as any);

        const result = await validateUserChannelPerms('user1', mockChannel);

        expect(result).toBe(true);
        expect(mockGuild.members.fetch).toHaveBeenCalledWith('user1');
        expect(mockMember.permissionsIn).toHaveBeenCalledWith(mockChannel);
    });

    it('should return true when user has all required permissions with attachments', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn().mockReturnValue(true),
        } as any);

        const attachments = [{ id: 'att1' }] as Attachment[];

        const result = await validateUserChannelPerms('user1', mockChannel, attachments);

        expect(result).toBe(true);
        expect(mockGuild.members.fetch).toHaveBeenCalledWith('user1');
        expect(mockMember.permissionsIn).toHaveBeenCalledWith(mockChannel);
    });

    it('should return false when user lacks ViewChannel permission', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn((flag) => flag !== PermissionsBitField.Flags.ViewChannel),
        } as any);

        const result = await validateUserChannelPerms('user1', mockChannel);

        expect(result).toBe(false);
    });

    it('should return false when user lacks SendMessages permission', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn((flag) => flag !== PermissionsBitField.Flags.SendMessages),
        } as any);

        const result = await validateUserChannelPerms('user1', mockChannel);

        expect(result).toBe(false);
    });

    it('should return false when user lacks AttachFiles permission with attachments', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn((flag) => flag !== PermissionsBitField.Flags.AttachFiles),
        } as any);

        const attachments = [{ id: 'att1' }] as Attachment[];

        const result = await validateUserChannelPerms('user1', mockChannel, attachments);

        expect(result).toBe(false);
    });

    it('should return true when user lacks AttachFiles permission but no attachments', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn((flag) => flag !== PermissionsBitField.Flags.AttachFiles),
        } as any);

        const result = await validateUserChannelPerms('user1', mockChannel);

        expect(result).toBe(true);
    });

    it('should return false when member fetch fails', async () => {
        (mockGuild.members.fetch as any).mockRejectedValue(new Error('Member not found'));

        const result = await validateUserChannelPerms('user1', mockChannel);

        expect(result).toBe(false);
        expect(mockGuild.members.fetch).toHaveBeenCalledWith('user1');
    });

    it('should return false when permissionsIn throws', async () => {
        mockMember.permissionsIn.mockImplementation(() => {
            throw new Error('Permissions error');
        });

        const result = await validateUserChannelPerms('user1', mockChannel);

        expect(result).toBe(false);
    });

    it('should use provided member and not call fetch', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn().mockReturnValue(true),
        } as any);

        const result = await validateUserChannelPerms('user1', mockChannel, undefined, mockMember);

        expect(result).toBe(true);
        expect(mockGuild.members.fetch).not.toHaveBeenCalled();
        expect(mockMember.permissionsIn).toHaveBeenCalledWith(mockChannel);
    });

    it('should fall back to fetch when member is not provided', async () => {
        mockMember.permissionsIn.mockReturnValue({
            has: vi.fn().mockReturnValue(true),
        } as any);

        const result = await validateUserChannelPerms('user1', mockChannel);

        expect(result).toBe(true);
        expect(mockGuild.members.fetch).toHaveBeenCalledWith('user1');
        expect(mockMember.permissionsIn).toHaveBeenCalledWith(mockChannel);
    });
});