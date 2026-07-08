import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getTeamNamesByRosterId } from '../services/rosterService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { SleeperBracketMatchup } from '../types/sleeper';
import type { BotCommand } from '../types/commands';

function teamLabel(
  matchup: SleeperBracketMatchup,
  side: 't1' | 't2',
  teamNames: Map<number, string>,
): string {
  const rosterId = matchup[side];
  if (rosterId !== null && rosterId !== undefined) {
    return teamNames.get(rosterId) ?? `Roster ${rosterId}`;
  }
  const from = side === 't1' ? matchup.t1_from : matchup.t2_from;
  if (from?.w !== undefined) return `Winner of match ${from.w}`;
  if (from?.l !== undefined) return `Loser of match ${from.l}`;
  return 'TBD';
}

function formatMatch(matchup: SleeperBracketMatchup, teamNames: Map<number, string>): string {
  const t1 = teamLabel(matchup, 't1', teamNames);
  const t2 = teamLabel(matchup, 't2', teamNames);
  const placement =
    matchup.p === 1 ? ' 🏆 Championship' : matchup.p === 3 ? ' 🥉 3rd place' : '';

  if (matchup.w !== null && matchup.w !== undefined) {
    const winner = teamNames.get(matchup.w) ?? `Roster ${matchup.w}`;
    return `Match ${matchup.m}: **${t1}** vs **${t2}** → **${winner}** wins${placement}`;
  }
  return `Match ${matchup.m}: **${t1}** vs **${t2}**${placement}`;
}

const playoffBracket: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('playoff_bracket')
    .setDescription('Show the playoff bracket for a linked league.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('bracket')
        .setDescription('Which bracket to show (default: winners)')
        .setRequired(false)
        .addChoices({ name: 'winners', value: 'winners' }, { name: 'losers', value: 'losers' }),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const bracketType = interaction.options.getString('bracket') ?? 'winners';
    const bracket =
      bracketType === 'losers'
        ? await sleeperApi.getLosersBracket(guildLeague.league_id)
        : await sleeperApi.getWinnersBracket(guildLeague.league_id);

    if (!bracket) {
      throw new UserFacingError(Messages.genericFailure);
    }

    const title = `${bracketType === 'losers' ? 'Losers' : 'Winners'} bracket — ${guildLeague.league_name ?? guildLeague.league_nickname}`;

    if (bracket.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            title,
            'No playoff bracket found yet. Brackets appear once the league reaches the playoffs.',
          ),
        ],
      });
      return;
    }

    const teamNames = await getTeamNamesByRosterId(guildLeague.league_id);

    const rounds = new Map<number, SleeperBracketMatchup[]>();
    for (const matchup of bracket) {
      const list = rounds.get(matchup.r) ?? [];
      list.push(matchup);
      rounds.set(matchup.r, list);
    }

    const sections = [...rounds.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, matchups]) => {
        const lines = matchups
          .sort((a, b) => a.m - b.m)
          .map((m) => formatMatch(m, teamNames));
        return `**Round ${round}**\n${lines.join('\n')}`;
      });

    const embed = infoEmbed(title, truncate(sections.join('\n\n'), 4096));
    await interaction.editReply({ embeds: [embed] });
  },
};

export default playoffBracket;
