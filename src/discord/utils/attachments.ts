/**
 * Sanitizes attachments based on Attach Files permission.
 * Returns the attachments if permission is granted, otherwise undefined.
 *
 * @param attachments - The source attachments array
 * @param hasAttachFilesPermission - Whether the actor has Attach Files permission
 * @returns Sanitized attachments or undefined
 */
export function sanitizeAttachments(hasAttachFilesPermission: boolean, attachments?: any[]): any[] | undefined {
    if (!hasAttachFilesPermission) {
        return undefined;
    }
    return attachments;
}