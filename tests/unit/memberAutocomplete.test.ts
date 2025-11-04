import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutocompleteInteraction } from 'discord.js';
import { formAutocomplete } from '../../src/discord/commands/_autocomplete/formAutocomplete';
import { FormService } from '../../src/discord/services/FormService';

// Mock FormService
vi.mock('../../src/discord/services/FormService', () => ({
    FormService: class {
        getForms = vi.fn();
    },
}));

describe('formAutocomplete', () => {
    let mockInteraction: AutocompleteInteraction;
    let mockFormService: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockFormService = new FormService();
        (FormService as any).mockClear();

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

        const forms = [
            { id: 1, name: 'TestForm' },
            { id: 2, name: 'OtherForm' },
            { id: 3, name: 'testAlt' },
        ];
        mockFormService.getForms.mockResolvedValue(forms);

        await formAutocomplete(mockInteraction);

        expect(mockFormService.getForms).toHaveBeenCalledWith('user123');
        expect(mockInteraction.respond).toHaveBeenCalledWith([
            { name: 'TestForm', value: '1' },
            { name: 'testAlt', value: '3' },
        ]);
    });

    it('should be case insensitive when filtering', async () => {
        const focusedOption = { value: 'TEST' };
        (mockInteraction.options.getFocused as any).mockReturnValue(focusedOption);

        const forms = [
            { id: 1, name: 'testform' },
            { id: 2, name: 'OtherForm' },
        ];
        mockFormService.getForms.mockResolvedValue(forms);

        await formAutocomplete(mockInteraction);

        expect(mockInteraction.respond).toHaveBeenCalledWith([
            { name: 'testform', value: '1' },
        ]);
    });

    it('should limit results to 25 members', async () => {
        const focusedOption = { value: '' };
        (mockInteraction.options.getFocused as any).mockReturnValue(focusedOption);

        const forms = Array.from({ length: 30 }, (_, i) => ({
            id: i + 1,
            name: `Form${i + 1}`,
        }));
        mockFormService.getForms.mockResolvedValue(forms);

        await formAutocomplete(mockInteraction);

        const respondedChoices = (mockInteraction.respond as any).mock.calls[0][0];
        expect(respondedChoices).toHaveLength(25);
    });

    it('should return empty array on error', async () => {
        (mockInteraction.options.getFocused as any).mockReturnValue({ value: 'test' });
        mockFormService.getForms.mockRejectedValue(new Error('Database error'));

        await formAutocomplete(mockInteraction);

        expect(mockInteraction.respond).toHaveBeenCalledWith([]);
    });

    it('should return all members when focused value is empty', async () => {
        const focusedOption = { value: '' };
        (mockInteraction.options.getFocused as any).mockReturnValue(focusedOption);

        const forms = [
            { id: 1, name: 'Form1' },
            { id: 2, name: 'Form2' },
        ];
        mockFormService.getForms.mockResolvedValue(forms);

        await formAutocomplete(mockInteraction);

        expect(mockInteraction.respond).toHaveBeenCalledWith([
            { name: 'Form1', value: '1' },
            { name: 'Form2', value: '2' },
        ]);
    });
});