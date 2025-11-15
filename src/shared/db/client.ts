import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../../config/env';
import log from '../utils/logger';

const client = postgres(env.DATABASE_URL, {
    max: 10, // Connection pool size
    idle_timeout: 20, // Close idle connections after 20s
    connect_timeout: 10, // Connection timeout
});

export const db = drizzle(client);

// Log database configuration (without password)
try {
    // eslint-disable-next-line no-undef
    const url = new URL(env.DATABASE_URL);
    log.info('Database connection configured', {
        component: 'db-client',
        host: url.hostname,
        port: url.port,
        database: url.pathname.slice(1),
        user: url.username,
        status: 'configured'
    });
} catch (error) {
    log.error('Failed to parse DATABASE_URL', {
        component: 'db-client',
        error: error instanceof Error ? error.message : String(error),
        status: 'config_error'
    });
}