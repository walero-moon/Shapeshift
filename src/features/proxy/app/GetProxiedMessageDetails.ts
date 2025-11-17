import { proxiedMessageRepo, ProxiedMessageRepo, ProxiedMessage } from '../infra/ProxiedMessageRepo';
import { formRepo, FormRepo } from '../../identity/infra/FormRepo';
import { log } from '../../../shared/utils/logger';

export interface ProxiedMessageDetails extends ProxiedMessage {
    formName: string;
    formAvatarUrl: string | null;
}

export async function getProxiedMessageDetails(
    messageId: string,
    repo: ProxiedMessageRepo = proxiedMessageRepo,
    forms: FormRepo = formRepo
): Promise<ProxiedMessageDetails> {
    log.debug('Looking up proxied message details', {
        component: 'proxy-context',
        messageId,
        status: 'who_lookup_start'
    });

    const record = await repo.getByWebhookMessageId(messageId);
    if (!record) {
        throw new Error('This message is not tracked as a proxied message.');
    }

    const form = await forms.getById(record.formId);

    return {
        ...record,
        formName: form?.name ?? 'Unknown form',
        formAvatarUrl: form?.avatarUrl ?? null
    };
}
