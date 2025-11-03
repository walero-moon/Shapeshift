import { describe, it, expect, beforeEach } from 'vitest';
import { SystemService } from '../../src/discord/services/SystemService';

describe('SystemService', () => {
    let systemService: SystemService;

    beforeEach(() => {
        systemService = new SystemService();
    });

    describe('createSystem', () => {
        it('should create a new system when ownerUserId does not exist', async () => {
            const ownerUserId = 'user123';
            const result = await systemService.createSystem(ownerUserId);

            expect(result.created).toBe(true);
            expect(result.system).toBeDefined();
            expect(result.system.ownerUserId).toBe(ownerUserId);
            expect(result.system.id).toBeDefined();
        });

        it('should return existing system when ownerUserId already exists (idempotent)', async () => {
            const ownerUserId = 'user123';

            // First call
            const firstResult = await systemService.createSystem(ownerUserId);
            expect(firstResult.created).toBe(true);

            // Second call with same ownerUserId
            const secondResult = await systemService.createSystem(ownerUserId);
            expect(secondResult.created).toBe(false);
            expect(secondResult.system).toBeDefined();
            expect(secondResult.system.id).toBe(firstResult.system.id);
            expect(secondResult.system.ownerUserId).toBe(ownerUserId);
        });
    });
});