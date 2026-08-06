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
      { usage: '/current_week', description: 'Current NFL season and week from Sleeper.' },
    ],
  },
  {
    title: '👤 Account',
    commands: [
      {
        usage: '/link_sleeper username:<name>',
        description: 'Link your Discord account to your Sleeper account (one time).',
      },
      { usage: '/me', description: 'Show your linked Sleeper account.' },
      {
        usage: '/my_leagues',
        description: 'List your Sleeper leagues and which are linked to this server.',
      },
    ],
  },
  {
    title: '🛠️ League Management (server owner only)',
    commands: [
      {
        usage: '/add_league league_id:<id> nickname:<name>',
        description: 'Link a Sleeper league to this server.',
      },
      { usage: '/remove_league nickname:<name>', description: 'Remove a linked league.' },
      { usage: '/set_default_league nickname:<name>', description: 'Set the default league.' },
    ],
  },
  {
    title: '🏆 League Info',
    commands: [
      { usage: '/leagues', description: 'List all leagues linked to this server.' },
      { usage: '/league_info [league]', description: 'Core league settings and roster positions.' },
      { usage: '/league_settings [league]', description: 'Detailed league settings.' },
      { usage: '/scoring [league]', description: 'Scoring settings breakdown.' },
      { usage: '/managers [league]', description: 'All managers in a league.' },
      { usage: '/standings [league]', description: 'Standings by record and points for.' },
      { usage: '/power_rankings [league]', description: 'Bot-calculated power rankings.' },
      { usage: '/league_records [league]', description: 'Fun league records and extremes.' },
    ],
  },
  {
    title: '📅 Matchups',
    commands: [
      { usage: '/matchups [league] [week]', description: 'Weekly matchups and live scores.' },
      { usage: '/matchup_detail [league] [week] [user]', description: "One manager's matchup." },
      { usage: '/weekly_recap [league] [week]', description: 'Fun recap of a week.' },
      { usage: '/biggest_blowout [league] [week]', description: 'Largest win margin of a week.' },
      { usage: '/closest_matchup [league] [week]', description: 'Closest matchup of a week.' },
    ],
  },
  {
    title: '🧑‍🤝‍🧑 Teams',
    commands: [
      {
        usage: '/roster [league] [user]',
        description: 'A team roster (auto-detects your league).',
      },
      { usage: '/team [league] [user]', description: 'Team profile without the full roster.' },
      { usage: '/record [league] [user]', description: "A team's record and point totals." },
      { usage: '/moves [league]', description: 'Total roster moves by team.' },
      { usage: '/faab [league]', description: 'FAAB (waiver budget) usage by team.' },
      { usage: '/waiver_order [league]', description: 'Waiver priority order.' },
    ],
  },
  {
    title: '📝 Draft',
    commands: [
      { usage: '/draft [league] [round]', description: 'Draft info and picks by round.' },
      { usage: '/draft_order [league]', description: 'Draft pick order.' },
      { usage: '/draft_results [league] [round]', description: 'Draft picks by round.' },
      {
        usage: '/create_draft_grades [league]',
        description: 'Generate AI-assisted league draft grades (admin/owner only).',
      },
      {
        usage: '/draft_grade [league] [user]',
        description: "Show a team's latest saved draft grade.",
      },
      { usage: '/traded_picks [league]', description: 'Draft picks that have been traded.' },
      {
        usage: '/playoff_bracket [league] [bracket]',
        description: 'Playoff bracket (winners/losers).',
      },
    ],
  },
  {
    title: '🔁 Transactions & Trades',
    commands: [
      {
        usage: '/transactions [league] [week]',
        description: 'Recent trades, waivers, and FA moves.',
      },
      { usage: '/trade_history [league] [week]', description: 'Completed Sleeper trades.' },
      { usage: '/waiver_history [league] [week]', description: 'Waiver and free-agent activity.' },
      {
        usage: '/trade user:<@user> send:<...> receive:<...> [league] [note]',
        description: 'Propose a Discord-only trade offer (not submitted to Sleeper).',
      },
      {
        usage: '/counteroffer trade_id:<id> [send] [receive] [note]',
        description: 'Counter an existing trade offer.',
      },
      {
        usage: '/trade_history_local [league] [user]',
        description: 'Discord-only trade offers made here.',
      },
    ],
  },
  {
    title: '🔎 Players',
    commands: [
      { usage: '/player name:<name>', description: 'Search the Sleeper player database.' },
      {
        usage: '/trending type:<add|drop> [hours] [limit]',
        description: 'Most added or dropped players across Sleeper.',
      },
    ],
  },
  {
    title: '⏰ Reminders (server owner only)',
    commands: [
      {
        usage: '/draftreminder [league] [minutes] [message]',
        description: 'Ping linked members about the draft (manual).',
      },
      {
        usage: '/waiversreminder [league] [message]',
        description: 'Ping linked members to submit waivers (manual).',
      },
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
      const value = section.commands.map((c) => `\`${c.usage}\`\n${c.description}`).join('\n');
      embed.addFields({ name: section.title, value, inline: false });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default help;
