import { describe, it, expect } from 'vitest';
import { assembleWebhookPayload } from '../discord/send.util';

describe('assembleWebhookPayload', () => {
    it('should assemble payload without reply-style', () => {
        const result = assembleWebhookPayload('Hello world', null);

        expect(result).toMatchSnapshot();
    });

    it('should assemble payload with reply-style', () => {
        const replyStyle = {
            headerLine: '*↩︎ Replying to @User*',
            quoteLine: '> This is a quote',
        };

        const result = assembleWebhookPayload('Hello world', replyStyle);

        expect(result).toMatchSnapshot();
    });

    it('should assemble payload with reply-style but no jump button', () => {
        const replyStyle = {
            headerLine: '*↩︎ Replying to @User*',
            quoteLine: '> This is a quote',
        };

        const result = assembleWebhookPayload('Hello world', replyStyle);

        expect(result).toMatchSnapshot();
    });
});