import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForUserCommand } from '../services/leagueResolver';
import { getCurrentNflWeek, getWeekMatchups } from '../services/matchupService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const matchupDetail: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('matchup_detail')
    .setDescription("Show one manager's matchup for a week.")
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (auto-detected if omitted)')
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
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Whose matchup to show (defaults to you)')
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    const resolved = await resolveLeagueForUserCommand({
      guildId,
      discordUserId: targetUser.id,
      isSelf: targetUser.id === interaction.user.id,
      username: targetUser.username,
      providedLeagueNickname: interaction.options.getString('league'),
      commandName: 'matchup_detail',
    });

    const week = interaction.options.getInteger('week') ?? (await getCurrentNflWeek());
    const pairings = await getWeekMatchups(resolved.guildLeague.league_id, week);
    const pairing = pairings.find((p) =>
      p.teams.some((t) => t.rosterId === resolved.roster.roster_id),
    );

    const title = `Matchup — ${resolved.guildLeague.league_nickname} (Week ${week})`;

    if (!pairing) {
      await interaction.editReply({
        embeds: [infoEmbed(title, `No matchup found for this manager in week ${week}.`)],
      });
      return;
    }

    if (pairing.teams.length < 2 || pairing.matchupId === null) {
      const me = pairing.teams.find((t) => t.rosterId === resolved.roster.roster_id);
      await interaction.editReply({
        embeds: [
          infoEmbed(
            title,
            `**${me?.teamName ?? 'This team'}** has no opponent this week (bye or unscheduled). Points: ${formatPoints(me?.points ?? 0)}`,
          ),
        ],
      });
      return;
    }

    // With 2+ teams, present the requested manager first.
    const teams = [...pairing.teams].sort((a, b) =>
      a.rosterId === resolved.roster.roster_id
        ? -1
        : b.rosterId === resolved.roster.roster_id
          ? 1
          : 0,
    );
    const [a, b] = teams;
    const margin = Math.abs(a.points - b.points);
    const aWinner = a.points > b.points;
    const bWinner = b.points > a.points;

    let verdict: string;
    if (a.points === b.points) {
      verdict = a.points > 0 ? 'Tied game 🤝' : 'Not started yet';
    } else {
      const leader = a.points > b.points ? a : b;
      verdict = `**${leader.teamName}** ${a.points > 0 || b.points > 0 ? 'leading' : 'ahead'} by ${formatPoints(margin)}`;
    }

    const extras =
      teams.length > 2
        ? `\n\n_Note: ${teams.length} teams share this matchup slot._\n` +
          teams
            .slice(2)
            .map((t) => `${t.teamName}: ${formatPoints(t.points)}`)
            .join('\n')
        : '';

    const embed = infoEmbed(title).addFields(
      {
        name: `${aWinner ? '🏆 ' : ''}${a.teamName}`,
        value: `**${formatPoints(a.points)}** pts`,
        inline: true,
      },
      { name: 'vs', value: '\u200b', inline: true },
      {
        name: `${bWinner ? '🏆 ' : ''}${b.teamName}`,
        value: `**${formatPoints(b.points)}** pts`,
        inline: true,
      },
      { name: 'Result', value: `${verdict}${extras}`, inline: false },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default matchupDetail;
