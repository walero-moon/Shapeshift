import { db } from './client';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import log from '../utils/logger';
import { retryAsync } from '../utils/retry';

/**
 * Runtime detection of UUIDv7 availability in PostgreSQL
 * Checks if the uuidv7() function is available and caches the result
 */
let uuidv7Available: boolean | null = null;
let detectionPromise: Promise<boolean> | null = null;

/**
 * Detects if UUIDv7 is available in the database by checking for the uuidv7() function
 * Uses caching to avoid repeated queries
 */
async function detectUuidv7Availability(): Promise<boolean> {
    if (uuidv7Available !== null) {
        return uuidv7Available;
    }

    if (!detectionPromise) {
        detectionPromise = checkUuidv7Function();
    }

    uuidv7Available = await detectionPromise;
    detectionPromise = null;
    return uuidv7Available;
}

/**
 * Performs the actual check for uuidv7 function availability
 */
async function checkUuidv7Function(): Promise<boolean> {
    try {
        // Try to call the uuidv7() function and see if it exists
        const result = await db.execute(sql`SELECT uuidv7()`);
        return (result as unknown as { rows: unknown[] }).rows.length > 0;
    } catch (error) {
        // If the function doesn't exist, it will throw an error
        log.error('Failed to check UUIDv7 function availability', {
            component: 'uuid-detection',
            error: error instanceof Error ? error.message : String(error),
            status: 'error'
        });
        return false;
    }
}

/**
 * Generates a UUIDv7 either from database or application layer
 * Falls back to application-generated UUIDv7 if database doesn't support it
 */
export async function generateUuidv7(): Promise<string> {
    const dbHasUuidv7 = await detectUuidv7Availability();

    if (dbHasUuidv7) {
        try {
            // Try to generate from database with retry
            const result = await retryAsync(
                async () => {
                    const queryResult = await db.execute(sql`SELECT uuidv7() as id`);
                    const rows = (queryResult as unknown as { rows: { id?: string }[] }).rows;
                    if (rows.length > 0 && rows[0]?.id) {
                        return rows[0].id as string;
                    }
                    throw new Error('No UUID returned from database');
                },
                {
                    maxAttempts: 3,
                    baseDelay: 100,
                    maxDelay: 1000,
                    backoffFactor: 2,
                    component: 'uuid-detection',
                    operation: 'generate_db'
                }
            );
            return result;
        } catch (error) {
            // Fall back to application generation if database call fails
            log.warn('Database UUIDv7 generation failed, falling back to application generation', {
                component: 'uuid-detection',
                error: error instanceof Error ? error.message : String(error),
                status: 'fallback'
            });
        }
    }

    // Generate UUIDv7 in application layer
    return uuidv7();
}

/**
 * Utility to generate UUIDv7 IDs for use in repository operations
 * Returns undefined when DB should handle ID generation (when UUIDv7 is available)
 */
export async function generateUuidv7OrUndefined(): Promise<string | undefined> {
    const dbHasUuidv7 = await detectUuidv7Availability();

    // If database supports UUIDv7, let it handle ID generation
    if (dbHasUuidv7) {
        return undefined;
    }

    // Otherwise generate UUIDv7 in application layer
    return uuidv7();
}

/**
 * Checks if the database supports UUIDv7 natively
 * Useful for conditional logic in repositories
 */
export async function isDatabaseUuidv7Supported(): Promise<boolean> {
    return detectUuidv7Availability();
}

/**
 * Resets the UUIDv7 availability cache (useful for testing)
 */
export function resetUuidv7Detection(): void {
    uuidv7Available = null;
    detectionPromise = null;
}