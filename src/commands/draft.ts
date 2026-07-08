import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getTeamNamesByRosterId } from '../services/rosterService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { SleeperDraftPick } from '../types/sleeper';
import type { BotCommand } from '../types/commands';

function pickPlayerName(pick: SleeperDraftPick): string {
  const meta = pick.metadata;
  const name = [meta?.first_name, meta?.last_name].filter(Boolean).join(' ');
  const details = [meta?.position, meta?.team].filter(Boolean).join(' - ');
  return `${name || pick.player_id}${details ? ` (${details})` : ''}`;
}

const draft: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('draft')
    .setDescription('Show draft info and picks for a linked league.')
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
        .setDescription('Show picks for this round (default: round 1)')
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

    const drafts = await sleeperApi.getLeagueDrafts(guildLeague.league_id);
    if (!drafts) {
      throw new UserFacingError(Messages.genericFailure);
    }
    if (drafts.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            `Draft — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
            'No draft found for this league yet.',
          ),
        ],
      });
      return;
    }

    // The league drafts endpoint returns the most recent draft first.
    const leagueDraft = drafts[0];
    const round = interaction.options.getInteger('round') ?? 1;

    const embed = infoEmbed(
      `Draft — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
    ).addFields(
      { name: 'Status', value: leagueDraft.status ?? '—', inline: true },
      { name: 'Type', value: leagueDraft.type ?? '—', inline: true },
      { name: 'Season', value: leagueDraft.season ?? '—', inline: true },
      { name: 'Rounds', value: String(leagueDraft.settings?.rounds ?? '—'), inline: true },
      { name: 'Teams', value: String(leagueDraft.settings?.teams ?? '—'), inline: true },
      {
        name: 'Start',
        value: leagueDraft.start_time ? `<t:${Math.floor(leagueDraft.start_time / 1000)}:f>` : '—',
        inline: true,
      },
    );

    if (leagueDraft.status === 'complete' || leagueDraft.status === 'in_progress') {
      const picks = await sleeperApi.getDraftPicks(leagueDraft.draft_id);
      const roundPicks = (picks ?? []).filter((p) => p.round === round);

      if (roundPicks.length > 0) {
        const teamNames = await getTeamNamesByRosterId(guildLeague.league_id);
        const lines = roundPicks
          .sort((a, b) => a.pick_no - b.pick_no)
          .map((pick) => {
            const team =
              pick.roster_id !== null
                ? (teamNames.get(pick.roster_id) ?? `Roster ${pick.roster_id}`)
                : 'Unknown team';
            return `**${pick.pick_no}.** ${pickPlayerName(pick)} — ${team}`;
          });
        embed.addFields({
          name: `Round ${round} picks`,
          value: truncate(lines.join('\n'), 1024),
          inline: false,
        });
      } else {
        embed.addFields({
          name: `Round ${round} picks`,
          value: 'No picks found for this round.',
          inline: false,
        });
      }
    } else {
      embed.setDescription('The draft has not started yet.');
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default draft;
