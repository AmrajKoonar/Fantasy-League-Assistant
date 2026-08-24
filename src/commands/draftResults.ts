import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getDraftResults } from '../services/draftService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { formatCodeTable } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

function embedTextLength(embed: EmbedBuilder): number {
  const data = embed.toJSON();
  return (
    (data.title?.length ?? 0) +
    (data.description?.length ?? 0) +
    (data.footer?.text.length ?? 0) +
    (data.author?.name.length ?? 0) +
    (data.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0)
  );
}

/** Keeps each Discord message below 10 embeds and the 6,000-character embed limit. */
function batchEmbeds(embeds: EmbedBuilder[]): EmbedBuilder[][] {
  const batches: EmbedBuilder[][] = [];
  let current: EmbedBuilder[] = [];
  let currentLength = 0;

  for (const embed of embeds) {
    const embedLength = embedTextLength(embed);
    if (current.length > 0 && (current.length === 10 || currentLength + embedLength > 5_900)) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(embed);
    currentLength += embedLength;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const draftResults: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('draft_results')
    .setDescription('Show draft picks by round for a linked league.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('round')
        .setDescription('Round number (1-30) or "all" (defaults to round 1)')
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

    const rawRound = interaction.options.getString('round')?.trim().toLowerCase() ?? '1';
    const round = rawRound === 'all' ? 'all' : Number(rawRound);
    if (round !== 'all' && (!/^\d+$/.test(rawRound) || round < 1 || round > 30)) {
      throw new UserFacingError(
        'Enter a round number from 1 to 30, or enter `all` to show the entire draft.',
        'Invalid draft round',
      );
    }

    const view = await getDraftResults(guildLeague.league_id, round);
    const title = `Draft results — ${guildLeague.league_name ?? guildLeague.league_nickname}`;

    if (!view) {
      await interaction.editReply({
        embeds: [infoEmbed(title, 'No draft found for this league yet.')],
      });
      return;
    }

    if (view.picks.length === 0) {
      const reason =
        view.draft.status === 'pre_draft'
          ? 'The draft has not started yet.'
          : view.round === 'all'
            ? 'No draft picks were found.'
            : `No picks found for round ${view.round}.`;
      await interaction.editReply({ embeds: [infoEmbed(title, reason)] });
      return;
    }

    const picksByRound = new Map<number, typeof view.picks>();
    for (const pick of view.picks) {
      const roundPicks = picksByRound.get(pick.round) ?? [];
      roundPicks.push(pick);
      picksByRound.set(pick.round, roundPicks);
    }

    const embeds = [...picksByRound.entries()].map(([roundNumber, picks]) => {
      const showAmount = picks.some((pick) => pick.isAuction && pick.amount !== null);
      const table = formatCodeTable(
        [
          { header: 'Pick', align: 'right' as const },
          { header: 'Player', maxWidth: 24 },
          { header: 'Pos' },
          { header: 'NFL' },
          { header: 'Fantasy Team', maxWidth: 24 },
          ...(showAmount ? [{ header: 'Price', align: 'right' as const }] : []),
        ],
        picks.map((pick) => [
          pick.pickNo,
          pick.playerName,
          pick.position,
          pick.team,
          pick.teamName,
          ...(showAmount ? [pick.isAuction && pick.amount !== null ? `$${pick.amount}` : '—'] : []),
        ]),
      );
      return infoEmbed(`${title} — Round ${roundNumber}`, table).setFooter({
        text: `Draft status: ${view.draft.status}${view.totalRounds ? ` • ${view.totalRounds} rounds` : ''}`,
      });
    });

    const batches = batchEmbeds(embeds);
    await interaction.editReply({ embeds: batches[0] });
    for (const batch of batches.slice(1)) {
      await interaction.followUp({ embeds: batch });
    }
  },
};

export default draftResults;
