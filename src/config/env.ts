import dotenv from 'dotenv';
import { z } from 'zod';

import { logger } from '../utils/logger';

dotenv.config();

const snowflakeRegex = /^[0-9]{17,19}$/;

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().regex(snowflakeRegex, 'Invalid Snowflake ID'),
  DATABASE_PATH: z.string().default('./data/bot.sqlite'),
  DEV_GUILD_ID: z.string().regex(snowflakeRegex, 'Invalid Snowflake ID').optional(),
  ENABLE_TAG_PROXY: z.coerce.boolean().default(false),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  logger.error('Invalid environment variables:', result.error.flatten());
  process.exit(1);
}

export const env = result.data;