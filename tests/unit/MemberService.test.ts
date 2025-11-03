import { describe, it, expect, beforeEach } from 'vitest';
import { MemberService } from '../../src/discord/services/MemberService';

describe('MemberService', () => {
    let memberService: MemberService;

    beforeEach(() => {
        memberService = new MemberService();
    });

    describe('addMember', () => {
        it('should reject when no system exists for the ownerUserId', async () => {
            const ownerUserId = 'user123';
            const name = 'TestMember';

            await expect(memberService.addMember(ownerUserId, name)).rejects.toThrow('Owner does not have a system');
        });
    });
});