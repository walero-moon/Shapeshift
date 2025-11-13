import { AllowedMentions } from '../ports/ChannelProxyPort';

export const DEFAULT_ALLOWED_MENTIONS: AllowedMentions = {
    parse: [],
    repliedUser: false,
};

export const REPLY_ALLOWED_MENTIONS: AllowedMentions = {
    parse: [],
    repliedUser: true,
};