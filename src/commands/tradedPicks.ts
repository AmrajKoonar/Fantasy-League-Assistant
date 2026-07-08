import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getTeamNamesByRosterId } from '../services/rosterService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const tradedPicks: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('traded_picks')
    .setDescription('Show draft picks that have been traded in a linked league.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const picks = await sleeperApi.getTradedPicks(guildLeague.league_id);
    if (!picks) {
      throw new UserFacingError(Messages.genericFailure);
    }

    const title = `Traded picks — ${guildLeague.league_name ?? guildLeague.league_nickname}`;

    if (picks.length === 0) {
      await interaction.editReply({
        embeds: [infoEmbed(title, 'No draft picks have been traded in this league.')],
      });
      return;
    }

    const teamNames = await getTeamNamesByRosterId(guildLeague.league_id);
    const name = (rosterId: number): string => teamNames.get(rosterId) ?? `Roster ${rosterId}`;

    // Group by season, ordered by season then round.
    const bySeason = new Map<string, string[]>();
    const sorted = picks
      .slice()
      .sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round);

    for (const pick of sorted) {
      const line = `Round ${pick.round} (orig. ${name(pick.roster_id)}) → **${name(pick.owner_id)}**`;
      const list = bySeason.get(pick.season) ?? [];
      list.push(line);
      bySeason.set(pick.season, list);
    }

    const sections = [...bySeason.entries()].map(
      ([season, lines]) => `**${season} season**\n${lines.join('\n')}`,
    );

    const embed = infoEmbed(title, truncate(sections.join('\n\n'), 4096));
    await interaction.editReply({ embeds: [embed] });
  },
};

export default tradedPicks;
