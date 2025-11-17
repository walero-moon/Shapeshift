import { ChannelProxyPort } from '../../../shared/ports/ChannelProxyPort';
import { log } from '../../../shared/utils/logger';
import { ProxiedMessage, ProxiedMessageRepo, proxiedMessageRepo } from '../infra/ProxiedMessageRepo';

export interface DeleteProxiedMessageInput {
    record: ProxiedMessage;
    userId: string;
}

/**
 * Deletes a proxied webhook message we control and removes its record from storage.
 */
export async function deleteProxiedMessage(
    input: DeleteProxiedMessageInput,
    channelProxy: ChannelProxyPort,
    repo: ProxiedMessageRepo = proxiedMessageRepo
): Promise<void> {
    const { record, userId } = input;

    log.info('Starting proxied message deletion', {
        component: 'proxy-context',
        userId,
        formId: record.formId,
        guildId: record.guildId,
        channelId: record.channelId,
        messageId: record.messageId,
        status: 'delete_start'
    });

    if (record.userId !== userId) {
        throw new Error('You can only delete messages you proxied.');
    }

    await channelProxy.delete(record.webhookId, record.webhookToken, record.messageId);

    await repo.deleteById(record.id);

    log.info('Proxied message deletion complete', {
        component: 'proxy-context',
        userId,
        formId: record.formId,
        guildId: record.guildId,
        channelId: record.channelId,
        messageId: record.messageId,
        status: 'delete_success'
    });
}
