import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync } from 'fs';
import { join } from 'path';

import { logger } from '../utils/logger';

import { db } from './client';

logger.info('Running database migrations...');

const migrationsFolder = join(__dirname, 'migrations');

if (!existsSync(migrationsFolder)) {
  logger.warn(`Migrations folder not found at ${migrationsFolder}. Skipping migrations.`);
} else {
  migrate(db, { migrationsFolder });
  logger.info('Migrations applied successfully.');
}