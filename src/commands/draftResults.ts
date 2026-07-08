import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getDraftResults } from '../services/draftService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

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
    .addIntegerOption((option) =>
      option
        .setName('round')
        .setDescription('Round to show (defaults to round 1)')
        .setMinValue(1)
        .setMaxValue(30)
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

    const round = interaction.options.getInteger('round') ?? undefined;
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
          : `No picks found for round ${view.round}.`;
      await interaction.editReply({ embeds: [infoEmbed(title, reason)] });
      return;
    }

    const lines = view.picks.map((pick) => {
      const amount = pick.isAuction && pick.amount ? ` ($${pick.amount})` : '';
      return `**${pick.pickNo}.** ${pick.playerName} (${pick.position} - ${pick.team}) → ${pick.teamName}${amount}`;
    });

    const embed = infoEmbed(
      `${title} — Round ${view.round}`,
      truncate(lines.join('\n'), 4096),
    ).setFooter({
      text: `Draft status: ${view.draft.status}${view.totalRounds ? ` • ${view.totalRounds} rounds` : ''}`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default draftResults;
