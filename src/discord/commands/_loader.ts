import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

import { logger } from '../../utils/logger';

export interface SlashCommand {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const isCommandFile = (fileName: string) => {
  if (fileName.startsWith('_')) {
    return false;
  }

  const ext = path.extname(fileName);
  return ext === '.ts' || ext === '.js';
};

export const loadSlashCommands = async (): Promise<Map<string, SlashCommand>> => {
  const directoryUrl = new URL('.', import.meta.url);
  const entries = await readdir(directoryUrl, { withFileTypes: true });

  const commandFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isCommandFile);

  logger.info(`Found ${commandFiles.length} command files: ${commandFiles.join(', ')}`);

  const commands = new Map<string, SlashCommand>();

  for (const fileName of commandFiles) {
    const module = await import(new URL(fileName, directoryUrl).href);
    const command: SlashCommand | undefined = module.command;

    if (!command) {
      logger.warn(`Slash command module "${fileName}" does not export a \`command\` object.`);
      continue;
    }

    if (!command.data || typeof command.execute !== 'function') {
      logger.warn(`Slash command module "${fileName}" is missing required properties.`);
      continue;
    }

    const commandName = command.data.name;

    if (!commandName) {
      logger.warn(`Slash command module "${fileName}" has no command name.`);
      continue;
    }

    logger.info(`Loaded command "${commandName}" from "${fileName}"`);

    if (commands.has(commandName)) {
      logger.warn(`Duplicate command name "${commandName}" found. Overwriting previous command.`);
    }

    commands.set(commandName, command);
  }

  logger.info(`Loaded ${commands.size} slash commands: ${Array.from(commands.keys()).join(', ')}`);

  return commands;
};
