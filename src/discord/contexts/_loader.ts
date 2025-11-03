import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
} from 'discord.js';

import { logger } from '../../utils/logger';

export interface MessageContextCommand {
   data: ContextMenuCommandBuilder;
   execute: (interaction: MessageContextMenuCommandInteraction) => Promise<any>;
}

const isContextFile = (fileName: string) => {
  if (fileName.startsWith('_')) {
    return false;
  }

  const ext = path.extname(fileName);
  return ext === '.ts' || ext === '.js';
};

export const loadMessageContextCommands = async (): Promise<
  Map<string, MessageContextCommand>
> => {
  const directoryUrl = new URL('.', import.meta.url);
  const entries = await readdir(directoryUrl, { withFileTypes: true });

  const contextFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isContextFile);

  logger.info(`Found ${contextFiles.length} context files: ${contextFiles.join(', ')}`);

  const contexts = new Map<string, MessageContextCommand>();

  for (const fileName of contextFiles) {
    const module = await import(new URL(fileName, directoryUrl).href);
    const context: MessageContextCommand | undefined = module.context;

    if (!context) {
      logger.warn(`Context menu module "${fileName}" does not export a \`context\` object.`);
      continue;
    }

    if (!context.data || typeof context.execute !== 'function') {
      logger.warn(`Context menu module "${fileName}" is missing required properties.`);
      continue;
    }

    if (context.data.type !== ApplicationCommandType.Message) {
      logger.warn(`Context menu module "${fileName}" must define a message context menu.`);
      continue;
    }

    const name = context.data.name;

    if (!name) {
      logger.warn(`Context menu module "${fileName}" has no command name.`);
      continue;
    }

    logger.info(`Loaded context command "${name}" from "${fileName}"`);

    if (contexts.has(name)) {
      logger.warn(`Duplicate context command name "${name}" found. Overwriting previous command.`);
    }

    contexts.set(name, context);
  }

  logger.info(`Loaded ${contexts.size} message context commands: ${Array.from(contexts.keys()).join(', ')}`);

  return contexts;
};
