import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setAutoproxyState, SetAutoproxyStateInput } from '../app/autoproxy/SetAutoproxyState';
import { getAutoproxyState, GetAutoproxyStateInput } from '../app/autoproxy/GetAutoproxyState';
import { clearAutoproxyState, ClearAutoproxyStateInput } from '../app/autoproxy/ClearAutoproxyState';
import { recordLatchedForm, RecordLatchedFormInput } from '../app/autoproxy/RecordLatchedForm';
import { autoproxyRepo } from '../infra/AutoproxyRepo';
import { formRepo } from '../../identity/infra/FormRepo';

const mockAutoproxyRepo = vi.mocked(autoproxyRepo);
const mockFormRepo = vi.mocked(formRepo);

// Mock the logger
vi.mock('../../../shared/utils/logger', () => ({
    log: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
    },
}));

// Mock the retry utility
vi.mock('../../../shared/utils/retry', () => ({
    retryAsync: vi.fn((fn) => fn()),
}));

// Mock the form repo
vi.mock('../../identity/infra/FormRepo', () => ({
    formRepo: {
        getCachedByUserAndId: vi.fn(),
    },
}));

// Mock the autoproxy repo
vi.mock('../infra/AutoproxyRepo', () => ({
    autoproxyRepo: {
        upsertState: vi.fn(),
        getState: vi.fn(),
        getStateById: vi.fn(),
        getStateForScope: vi.fn(),
        getAllStates: vi.fn(),
        clearState: vi.fn(),
        clearAll: vi.fn(),
        recordLatch: vi.fn(),
        recordLatchById: vi.fn(),
        deleteMissingForm: vi.fn(),
    },
}));

describe('Autoproxy Application Use Cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('setAutoproxyState', () => {
        it('should set form mode with valid form ownership', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test Form',
                avatarUrl: null,
                createdAt: new Date(),
            };
            const mockState = {
                id: 'state1',
                userId: 'user1',
                guildId: 'guild1',
                channelId: null,
                mode: 'form' as const,
                formId: 'form1',
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            formRepo.getCachedByUserAndId.mockResolvedValue(mockForm);
            mockAutoproxyRepo.getStateForScope.mockResolvedValue(null);
            autoproxyRepo.upsertState.mockResolvedValue(mockState);

            const input: SetAutoproxyStateInput = {
                userId: 'user1',
                mode: 'form',
                formId: 'form1',
                scope: 'guild',
                guildId: 'guild1',
            };

            const result = await setAutoproxyState(input);

            expect(result.success).toBe(true);
            expect(result.state).toEqual(mockState);
            expect(mockAutoproxyRepo.getStateForScope).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(mockAutoproxyRepo.clearState).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(formRepo.getCachedByUserAndId).toHaveBeenCalledWith('user1', 'form1');
            expect(autoproxyRepo.upsertState).toHaveBeenCalledWith({
                userId: 'user1',
                guildId: 'guild1',
                channelId: null,
                mode: 'form',
                formId: 'form1',
                lastFormId: null,
            });
        });

        it('should default scope to guild when undefined', async () => {
            const mockForm = {
                id: 'form1',
                userId: 'user1',
                name: 'Test Form',
                avatarUrl: null,
                createdAt: new Date(),
            };
            const mockState = {
                id: 'state1',
                userId: 'user1',
                guildId: 'guild1',
                channelId: null,
                mode: 'form' as const,
                formId: 'form1',
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            formRepo.getCachedByUserAndId.mockResolvedValue(mockForm);
            mockAutoproxyRepo.getStateForScope.mockResolvedValue(null);
            autoproxyRepo.upsertState.mockResolvedValue(mockState);

            const input: SetAutoproxyStateInput = {
                userId: 'user1',
                mode: 'form',
                formId: 'form1',
                guildId: 'guild1',
            };

            await setAutoproxyState(input);

            expect(mockAutoproxyRepo.getStateForScope).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(mockAutoproxyRepo.clearState).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(mockAutoproxyRepo.upsertState).toHaveBeenCalledWith(
                expect.objectContaining({
                    guildId: 'guild1',
                    channelId: null,
                })
            );
        });

        it('should reject form mode with invalid form ownership', async () => {
            mockFormRepo.getCachedByUserAndId.mockResolvedValue(null);

            const input: SetAutoproxyStateInput = {
                userId: 'user1',
                mode: 'form',
                formId: 'form1',
                scope: 'guild',
                guildId: 'guild1',
            };

            await expect(setAutoproxyState(input)).rejects.toThrow('Form not found or not owned by user');
        });

        it('should set latch mode when prior form exists', async () => {
            const mockExistingState = {
                id: 'state1',
                userId: 'user1',
                guildId: 'guild1',
                channelId: null,
                mode: 'latch' as const,
                formId: null,
                lastFormId: 'form1',
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const mockNewState = { ...mockExistingState };

            mockAutoproxyRepo.getStateForScope.mockResolvedValue(mockExistingState);
            mockAutoproxyRepo.upsertState.mockResolvedValue(mockNewState);

            const input: SetAutoproxyStateInput = {
                userId: 'user1',
                mode: 'latch',
                scope: 'guild',
                guildId: 'guild1',
            };

            const result = await setAutoproxyState(input);

            expect(result.success).toBe(true);
            expect(mockAutoproxyRepo.getStateForScope).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(mockAutoproxyRepo.clearState).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(mockAutoproxyRepo.upsertState).toHaveBeenCalledWith(
                expect.objectContaining({
                    lastFormId: 'form1',
                })
            );
        });

        it('should arm latch mode even when no prior form exists', async () => {
            mockAutoproxyRepo.getStateForScope.mockResolvedValue(null);
            const mockNewState = {
                id: 'state2',
                userId: 'user1',
                guildId: 'guild1',
                channelId: null,
                mode: 'latch' as const,
                formId: null,
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockAutoproxyRepo.upsertState.mockResolvedValue(mockNewState);

            const input: SetAutoproxyStateInput = {
                userId: 'user1',
                mode: 'latch',
                scope: 'guild',
                guildId: 'guild1',
            };

            const result = await setAutoproxyState(input);

            expect(result.success).toBe(true);
            expect(mockAutoproxyRepo.getStateForScope).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(mockAutoproxyRepo.clearState).toHaveBeenCalledWith('user1', 'guild1', null);
            expect(mockAutoproxyRepo.upsertState).toHaveBeenCalledWith(
                expect.objectContaining({
                    lastFormId: null,
                })
            );
        });

        it('should reject front mode', async () => {
            const input: SetAutoproxyStateInput = {
                userId: 'user1',
                mode: 'front',
                scope: 'guild',
                guildId: 'guild1',
            };

            await expect(setAutoproxyState(input)).rejects.toThrow('Front mode is not available yet');
        });
    });

    describe('getAutoproxyState', () => {
        it('should return active state with priority order', async () => {
            const mockState = {
                id: 'state1',
                userId: 'user1',
                guildId: 'guild1',
                channelId: 'channel1',
                mode: 'form' as const,
                formId: 'form1',
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockAutoproxyRepo.getState.mockResolvedValue(mockState);

            const input: GetAutoproxyStateInput = {
                userId: 'user1',
                guildId: 'guild1',
                channelId: 'channel1',
            };

            const result = await getAutoproxyState(input);

            expect(result.success).toBe(true);
            expect(result.state).toEqual(mockState);
            expect(mockAutoproxyRepo.getState).toHaveBeenCalledWith('user1', 'guild1', 'channel1');
        });

        it('should return null when no state exists', async () => {
            mockAutoproxyRepo.getState.mockResolvedValue(null);

            const input: GetAutoproxyStateInput = {
                userId: 'user1',
                guildId: 'guild1',
                channelId: 'channel1',
            };

            const result = await getAutoproxyState(input);

            expect(result.success).toBe(true);
            expect(result.state).toBeNull();
        });
    });

    describe('clearAutoproxyState', () => {
        it('should clear all states for user', async () => {
            mockAutoproxyRepo.clearAll.mockResolvedValue();

            const input: ClearAutoproxyStateInput = {
                userId: 'user1',
                scope: 'all',
            };

            const result = await clearAutoproxyState(input);

            expect(result.success).toBe(true);
            expect(result.clearedCount).toBe(1);
            expect(mockAutoproxyRepo.clearAll).toHaveBeenCalledWith('user1');
        });

        it('should clear specific scope', async () => {
            mockAutoproxyRepo.clearState.mockResolvedValue();

            const input: ClearAutoproxyStateInput = {
                userId: 'user1',
                scope: 'guild',
                guildId: 'guild1',
            };

            const result = await clearAutoproxyState(input);

            expect(result.success).toBe(true);
            expect(result.clearedCount).toBe(1);
            expect(mockAutoproxyRepo.clearState).toHaveBeenCalledWith('user1', 'guild1', null);
        });
    });

    describe('recordLatchedForm', () => {
        const states = [
            {
                id: 'state-channel',
                userId: 'user1',
                guildId: 'guild1',
                channelId: 'channel1',
                mode: 'latch' as const,
                formId: null,
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: 'state-guild',
                userId: 'user1',
                guildId: 'guild1',
                channelId: null,
                mode: 'latch' as const,
                formId: null,
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                id: 'state-global',
                userId: 'user1',
                guildId: null,
                channelId: null,
                mode: 'latch' as const,
                formId: null,
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
        ];

        beforeEach(() => {
            mockAutoproxyRepo.recordLatchById.mockReset();
        });

        it('updates channel scope states', async () => {
            mockAutoproxyRepo.getAllStates.mockResolvedValue(states as any);

            const result = await recordLatchedForm({
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
            });

            expect(result.success).toBe(true);
            expect(mockAutoproxyRepo.recordLatchById).toHaveBeenCalledWith('state-channel', 'form1');
            expect(mockAutoproxyRepo.recordLatchById).toHaveBeenCalledTimes(1);
        });

        it('updates guild scope states', async () => {
            mockAutoproxyRepo.getAllStates.mockResolvedValue(states as any);

            const result = await recordLatchedForm({
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: null,
            });

            expect(result.success).toBe(true);
            expect(mockAutoproxyRepo.recordLatchById).toHaveBeenCalledWith('state-guild', 'form1');
            expect(mockAutoproxyRepo.recordLatchById).toHaveBeenCalledTimes(1);
        });

        it('updates global scope states', async () => {
            mockAutoproxyRepo.getAllStates.mockResolvedValue(states as any);

            const result = await recordLatchedForm({
                userId: 'user1',
                formId: 'form1',
                guildId: null,
                channelId: null,
            });

            expect(result.success).toBe(true);
            expect(mockAutoproxyRepo.recordLatchById).toHaveBeenCalledWith('state-global', 'form1');
            expect(mockAutoproxyRepo.recordLatchById).toHaveBeenCalledTimes(1);
        });

        it('should not throw on record failure (non-critical)', async () => {
            mockAutoproxyRepo.getAllStates.mockResolvedValue(states as any);
            mockAutoproxyRepo.recordLatchById.mockRejectedValue(new Error('DB error'));

            const result = await recordLatchedForm({
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
            });

            expect(result.success).toBe(true); // Still returns success
        });
    });
});
