import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/shared/db/schema.ts',
    out: './drizzle',
    driver: 'pg',
    dbCredentials: {
        connectionString: process.env.DATABASE_URL!,
    },
    verbose: true,
    strict: true,
});