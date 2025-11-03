import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutocompleteInteraction } from 'discord.js';
import { memberAutocomplete } from '../../src/discord/commands/_autocomplete/memberAutocomplete';
import { MemberService } from '../../src/discord/services/MemberService';

// Mock MemberService
vi.mock('../../src/discord/services/MemberService', () => ({
    MemberService: class {
        getMembers = vi.fn();
    },
}));

describe('memberAutocomplete', () => {
    let mockInteraction: AutocompleteInteraction;
    let mockMemberService: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockMemberService = new MemberService();
        (MemberService as any).mockClear();

        mockInteraction = {
            options: {
                getFocused: vi.fn(),
            },
            user: {
                id: 'user123',
            },
            respond: vi.fn(),
        } as any;
    });

    it('should return filtered members matching the focused value', async () => {
        const focusedOption = { value: 'test' };
        (mockInteraction.options.getFocused as any).mockReturnValue(focusedOption);

        const members = [
            { id: 1, name: 'TestMember' },
            { id: 2, name: 'OtherMember' },
            { id: 3, name: 'testAlt' },
        ];
        mockMemberService.getMembers.mockResolvedValue(members);

        await memberAutocomplete(mockInteraction);

        expect(mockMemberService.getMembers).toHaveBeenCalledWith('user123');
        expect(mockInteraction.respond).toHaveBeenCalledWith([
            { name: 'TestMember', value: '1' },
            { name: 'testAlt', value: '3' },
        ]);
    });

    it('should be case insensitive when filtering', async () => {
        const focusedOption = { value: 'TEST' };
        (mockInteraction.options.getFocused as any).mockReturnValue(focusedOption);

        const members = [
            { id: 1, name: 'testmember' },
            { id: 2, name: 'OtherMember' },
        ];
        mockMemberService.getMembers.mockResolvedValue(members);

        await memberAutocomplete(mockInteraction);

        expect(mockInteraction.respond).toHaveBeenCalledWith([
            { name: 'testmember', value: '1' },
        ]);
    });

    it('should limit results to 25 members', async () => {
        const focusedOption = { value: '' };
        (mockInteraction.options.getFocused as any).mockReturnValue(focusedOption);

        const members = Array.from({ length: 30 }, (_, i) => ({
            id: i + 1,
            name: `Member${i + 1}`,
        }));
        mockMemberService.getMembers.mockResolvedValue(members);

        await memberAutocomplete(mockInteraction);

        const respondedChoices = (mockInteraction.respond as any).mock.calls[0][0];
        expect(respondedChoices).toHaveLength(25);
    });

    it('should return empty array on error', async () => {
        (mockInteraction.options.getFocused as any).mockReturnValue({ value: 'test' });
        mockMemberService.getMembers.mockRejectedValue(new Error('Database error'));

        await memberAutocomplete(mockInteraction);

        expect(mockInteraction.respond).toHaveBeenCalledWith([]);
    });

    it('should return all members when focused value is empty', async () => {
        const focusedOption = { value: '' };
        (mockInteraction.options.getFocused as any).mockReturnValue(focusedOption);

        const members = [
            { id: 1, name: 'Member1' },
            { id: 2, name: 'Member2' },
        ];
        mockMemberService.getMembers.mockResolvedValue(members);

        await memberAutocomplete(mockInteraction);

        expect(mockInteraction.respond).toHaveBeenCalledWith([
            { name: 'Member1', value: '1' },
            { name: 'Member2', value: '2' },
        ]);
    });
});