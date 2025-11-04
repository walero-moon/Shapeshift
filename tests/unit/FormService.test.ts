import { describe, it, expect, beforeEach } from 'vitest';
import { FormService } from '../../src/discord/services/FormService';

describe('FormService', () => {
    let formService: FormService;

    beforeEach(() => {
        formService = new FormService();
    });

    describe('addForm', () => {
        it('should reject when no system exists for the ownerUserId', async () => {
            const ownerUserId = 'user123';
            const name = 'TestForm';

            await expect(formService.addForm(ownerUserId, name)).rejects.toThrow('Owner does not have a system');
        });
    });
});