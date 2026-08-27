import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek } from '../services/matchupService';
import { getWeekTransactions, type TransactionView } from '../services/transactionService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatCodeTable } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const TYPE_TAGS: Record<string, string> = {
  trade: '🔁',
  waiver: 'W',
  free_agent: 'FA',
  commissioner: 'C',
};

function transactionRows(tx: TransactionView): unknown[][] {
  const tag = TYPE_TAGS[tx.type] ?? tx.type.slice(0, 3).toUpperCase();
  const faab = tx.faabSpent !== null && tx.faabSpent > 0 ? `$${tx.faabSpent}` : '—';
  const rows: unknown[][] = [];

  for (const add of tx.adds) {
    rows.push([`${tag}➕`, add.playerName, add.teamName, faab]);
  }
  for (const drop of tx.drops) {
    rows.push([`${tag}➖`, drop.playerName, drop.teamName, faab]);
  }
  if (tx.adds.length === 0 && tx.drops.length === 0 && tx.teamsInvolved.length > 0) {
    rows.push([tag, tx.teamsInvolved.join(' ↔ '), '—', faab]);
  }
  if (rows.length === 0) rows.push([tag, 'No player details', '—', faab]);
  return rows;
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

    const rows = views.flatMap(transactionRows).slice(0, 40);
    const table = formatCodeTable(
      [
        { header: 'Action', maxWidth: 6 },
        { header: 'Player', maxWidth: 20 },
        { header: 'Team', maxWidth: 14 },
        { header: 'FAAB', align: 'right', maxWidth: 5 },
      ],
      rows,
      { forceCodeBlock: true },
    );
    const embed = infoEmbed(title, table);

    await interaction.editReply({ embeds: [embed] });
  },
};

export default transactions;
