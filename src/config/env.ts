import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const envSchema = z.object({
    BOT_TOKEN: z.string(),
    APPLICATION_ID: z.string(),
    DEV_GUILD_ID: z.string(),
    DATABASE_URL: z.string(),
    POSTGRES_USER: z.string(),
    POSTGRES_PASSWORD: z.string(),
    POSTGRES_DB: z.string(),
});

export const env = envSchema.parse(process.env);