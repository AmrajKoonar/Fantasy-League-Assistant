import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { infoEmbed } from '../utils/embeds';
import type { BotCommand } from '../types/commands';

interface HelpSection {
  title: string;
  commands: { usage: string; description: string }[];
}

const SECTIONS: HelpSection[] = [
  {
    title: '🏠 General',
    commands: [
      { usage: '/ping', description: 'Check if the bot is online and its latency.' },
      { usage: '/help', description: 'Show this command overview.' },
    ],
  },
  {
    title: '👤 Your Account',
    commands: [
      {
        usage: '/link_sleeper username:<name>',
        description: 'Link your Discord account to your Sleeper account (one time).',
      },
      { usage: '/me', description: 'Show your linked Sleeper account.' },
      {
        usage: '/my_leagues',
        description: 'List your Sleeper leagues this season and which are linked to this server.',
      },
    ],
  },
  {
    title: '🛠️ League Management (server owner only)',
    commands: [
      {
        usage: '/add_league league_id:<id> nickname:<name>',
        description: 'Link a Sleeper league to this server. Re-run to update or rename it.',
      },
      { usage: '/remove_league nickname:<name>', description: 'Remove a linked league.' },
      {
        usage: '/set_default_league nickname:<name>',
        description: 'Choose the league used when commands omit the league option.',
      },
    ],
  },
  {
    title: '🏆 League Info',
    commands: [
      { usage: '/leagues', description: 'List all leagues linked to this server.' },
      {
        usage: '/league_info [league]',
        description: 'League settings, scoring type, and roster positions.',
      },
      {
        usage: '/standings [league]',
        description: 'Standings sorted by record and points for.',
      },
      { usage: '/matchups [league] [week]', description: 'Weekly matchups and live scores.' },
      {
        usage: '/playoff_bracket [league] [bracket]',
        description: 'Playoff bracket (winners or losers).',
      },
      {
        usage: '/transactions [league] [week]',
        description: 'Recent trades, waivers, and free agent moves.',
      },
      { usage: '/traded_picks [league]', description: 'Draft picks that have been traded.' },
      { usage: '/draft [league] [round]', description: 'Draft info and picks by round.' },
    ],
  },
  {
    title: '🧑‍🤝‍🧑 Teams & Players',
    commands: [
      {
        usage: '/roster [league] [user]',
        description: 'A team roster — auto-detects your league if omitted.',
      },
      {
        usage: '/trending type:<add|drop> [hours] [limit]',
        description: 'Most added or dropped players across Sleeper.',
      },
      { usage: '/player name:<name>', description: 'Search the Sleeper player database.' },
    ],
  },
];

const help: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all commands and what they do.'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = infoEmbed(
      'Fantasy League Assistant — Commands',
      'Options in `[brackets]` are optional. Most league commands fall back to the server default league.',
    );

    for (const section of SECTIONS) {
      const value = section.commands
        .map((c) => `\`${c.usage}\`\n${c.description}`)
        .join('\n');
      embed.addFields({ name: section.title, value, inline: false });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default help;
