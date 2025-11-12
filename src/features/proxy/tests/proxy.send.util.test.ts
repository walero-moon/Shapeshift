import { describe, it, expect } from 'vitest';
import { assembleWebhookPayload } from '../discord/send.util';
import { ButtonBuilder, ButtonStyle } from 'discord.js';

describe('assembleWebhookPayload', () => {
    it('should assemble payload without reply-style', () => {
        const result = assembleWebhookPayload('Hello world', null);

        expect(result).toMatchSnapshot();
    });

    it('should assemble payload with reply-style', () => {
        const jumpButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Jump')
            .setURL('https://discord.com/channels/123/456/789');

        const replyStyle = {
            headerLine: '*↩︎ Replying to @User*',
            quoteLine: '> This is a quote',
            jumpButton,
        };

        const result = assembleWebhookPayload('Hello world', replyStyle);

        expect(result).toMatchSnapshot();
    });

    it('should assemble payload with reply-style but no jump button', () => {
        const replyStyle = {
            headerLine: '*↩︎ Replying to @User*',
            quoteLine: '> This is a quote',
            jumpButton: null,
        };

        const result = assembleWebhookPayload('Hello world', replyStyle);

        expect(result).toMatchSnapshot();
    });
});