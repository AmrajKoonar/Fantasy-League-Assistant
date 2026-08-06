import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getCurrentNflWeek, getWeekMatchups } from '../services/matchupService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatCodeTable } from '../utils/formatting';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const matchups: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('matchups')
    .setDescription('Show weekly matchups and scores.')
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
    const pairings = await getWeekMatchups(guildLeague.league_id, week);

    if (pairings.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            `Matchups — Week ${week}`,
            `No matchups found for week ${week} in **${guildLeague.league_name ?? guildLeague.league_nickname}**.`,
          ),
        ],
      });
      return;
    }

    const rows = pairings.map((pairing) => {
      if (pairing.teams.length < 2) {
        const team = pairing.teams[0];
        return [team.teamName, formatPoints(team.points), '', '', '—', 'No opponent'];
      }
      const [a, b] = pairing.teams;
      let verdict = 'Tied';
      if (a.points !== b.points) {
        const leader = a.points > b.points ? a : b;
        verdict = `${leader.teamName} leads`;
      } else if (a.points === 0) {
        verdict = 'Not started';
      }
      return [
        a.teamName,
        formatPoints(a.points),
        'vs',
        formatPoints(b.points),
        b.teamName,
        verdict,
      ];
    });
    const table = formatCodeTable(
      [
        { header: 'Team', maxWidth: 20 },
        { header: 'Score', align: 'right' },
        { header: '' },
        { header: 'Score', align: 'right' },
        { header: 'Team', maxWidth: 20 },
        { header: 'Status', maxWidth: 24 },
      ],
      rows,
    );

    const embed = infoEmbed(
      `Matchups — ${guildLeague.league_name ?? guildLeague.league_nickname} (Week ${week})`,
      table,
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default matchups;
