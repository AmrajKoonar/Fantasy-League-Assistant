import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getWeekTransactions, type TransactionView } from '../services/transactionService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { discordRelativeTime, truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const TYPE_LABELS: Record<string, string> = {
  trade: '🔁 Trade',
  waiver: '📥 Waiver',
  free_agent: '🆓 Free agent',
  commissioner: '🛠️ Commissioner',
};

function formatTransaction(tx: TransactionView): string {
  const label = TYPE_LABELS[tx.type] ?? `📄 ${tx.type}`;
  const lines: string[] = [`${label} — ${tx.status} ${discordRelativeTime(tx.createdAt)}`];

  for (const add of tx.adds) {
    lines.push(`  ➕ ${add.playerName} → ${add.teamName}`);
  }
  for (const drop of tx.drops) {
    lines.push(`  ➖ ${drop.playerName} (${drop.teamName})`);
  }
  if (tx.faabSpent !== null && tx.faabSpent > 0) {
    lines.push(`  💰 FAAB: $${tx.faabSpent}`);
  }
  if (tx.adds.length === 0 && tx.drops.length === 0 && tx.teamsInvolved.length > 0) {
    lines.push(`  Teams: ${tx.teamsInvolved.join(', ')}`);
  }
  return lines.join('\n');
}

const transactions: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('transactions')
    .setDescription('Show recent league transactions for a week.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('week')
        .setDescription('NFL week (defaults to the current week)')
        .setMinValue(1)
        .setMaxValue(22)
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const week = interaction.options.getInteger('week') ?? (await getCurrentNflWeek());
    const views = await getWeekTransactions(guildLeague.league_id, week, 10);

    const title = `Transactions — ${guildLeague.league_name ?? guildLeague.league_nickname} (Week ${week})`;

    if (views.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed(title, `No transactions found for week ${week}.`)],
      });
      return;
    }

    const embed = infoEmbed(
      title,
      truncate(views.map(formatTransaction).join('\n\n'), 4096),
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default transactions;
