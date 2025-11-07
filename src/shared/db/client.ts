import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../../config/env';

const client = postgres(env.DATABASE_URL, {
    max: 10, // Connection pool size
    idle_timeout: 20, // Close idle connections after 20s
    connect_timeout: 10, // Connection timeout
});

export const db = drizzle(client);