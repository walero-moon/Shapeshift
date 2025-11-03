import { describe, it, expect } from 'vitest';
import { buildAllowedMentions } from '../../src/discord/utils/allowedMentions';
import { AllowedMentionsTypes } from 'discord.js';

describe('buildAllowedMentions', () => {
    it('should allow everyone mentions when hasMentionEveryone is true', () => {
        const result = buildAllowedMentions(true);

        expect(result).toEqual({
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role, AllowedMentionsTypes.Everyone],
        });
    });

    it('should restrict mentions when hasMentionEveryone is false', () => {
        const result = buildAllowedMentions(false);

        expect(result).toEqual({
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role],
        });
    });

    it('should include specific users when provided and no mention everyone permission', () => {
        const result = buildAllowedMentions(false, { users: ['user1', 'user2'] });

        expect(result).toEqual({
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role],
            users: ['user1', 'user2'],
        });
    });

    it('should include specific roles when provided and no mention everyone permission', () => {
        const result = buildAllowedMentions(false, { roles: ['role1', 'role2'] });

        expect(result).toEqual({
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role],
            roles: ['role1', 'role2'],
        });
    });

    it('should include both users and roles when provided and no mention everyone permission', () => {
        const result = buildAllowedMentions(false, { users: ['user1'], roles: ['role1'] });

        expect(result).toEqual({
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role],
            users: ['user1'],
            roles: ['role1'],
        });
    });

    it('should not include specific mentions when hasMentionEveryone is true', () => {
        const result = buildAllowedMentions(true, { users: ['user1'], roles: ['role1'] });

        expect(result).toEqual({
            parse: [AllowedMentionsTypes.User, AllowedMentionsTypes.Role, AllowedMentionsTypes.Everyone],
        });
    });
});