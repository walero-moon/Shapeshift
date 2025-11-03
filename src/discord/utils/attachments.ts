/**
 * Sanitizes attachments based on Attach Files permission.
 * Returns the attachments if permission is granted, otherwise undefined.
 *
 * @param hasAttachFilesPermission - Whether the actor has Attach Files permission
 * @param attachments - The source attachments array
 * @returns Sanitized attachments or undefined
 */
export function sanitizeAttachments(hasAttachFilesPermission: boolean, attachments?: unknown[]): unknown[] | undefined {
    if (!hasAttachFilesPermission) {
        return undefined;
    }
    return attachments;
}