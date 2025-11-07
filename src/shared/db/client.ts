import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../../config/env';
import log from '../utils/logger';
import { retryAsync } from '../utils/retry';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let connectionPromise: Promise<ReturnType<typeof drizzle>> | null = null;

/**
 * Creates a database connection with retry logic and fallback handling
 */
async function createDatabaseConnection(): Promise<ReturnType<typeof drizzle>> {
    if (dbInstance) {
        return dbInstance;
    }

    if (!connectionPromise) {
        connectionPromise = retryAsync(
            async () => {
                try {
                    const client = postgres(env.DATABASE_URL, {
                        max: 10, // Connection pool size
                        idle_timeout: 20, // Close idle connections after 20s
                        connect_timeout: 10, // Connection timeout
                    });

                    // Test the connection
                    await client`SELECT 1`;

                    log.info('Database connection established successfully', {
                        component: 'db-client',
                        status: 'connected'
                    });

                    return drizzle(client);
                } catch (error) {
                    log.error('Database connection failed', {
                        component: 'db-client',
                        error: error instanceof Error ? error.message : String(error),
                        status: 'connection_failed'
                    });
                    throw error;
                }
            },
            {
                maxAttempts: 5,
                baseDelay: 1000,
                maxDelay: 30000,
                backoffFactor: 2,
                component: 'db-client',
                operation: 'connection'
            }
        );
    }

    try {
        dbInstance = await connectionPromise;
        return dbInstance;
    } catch (error) {
        log.error('All database connection attempts failed, operating in degraded mode', {
            component: 'db-client',
            error: error instanceof Error ? error.message : String(error),
            status: 'degraded_mode'
        });
        // Return null to indicate degraded mode - consumers should handle gracefully
        return null as any; // Type assertion for degraded mode
    }
}

/**
 * Gets the database instance, creating connection if needed
 * In degraded mode, returns null - callers should check and handle gracefully
 */
export async function getDatabase(): Promise<ReturnType<typeof drizzle> | null> {
    return createDatabaseConnection();
}

/**
 * Exported db instance - lazy initialization for backward compatibility
 * In degraded mode, this will be null - consumers should check and handle gracefully
 */
let dbPromise: Promise<ReturnType<typeof drizzle> | null> | null = null;

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    if (!dbPromise) {
      dbPromise = createDatabaseConnection();
    }
    // For synchronous access, we need to return a proxy that handles async operations
    // This is a compromise - ideally consumers should use getDatabase()
    return async (...args: any[]) => {
      const dbInstance = await dbPromise;
      if (!dbInstance) {
        throw new Error('Database connection failed - operating in degraded mode');
      }
      const method = (dbInstance as any)[prop];
      if (typeof method === 'function') {
        return method.apply(dbInstance, args);
      }
      return method;
    };
  }
});