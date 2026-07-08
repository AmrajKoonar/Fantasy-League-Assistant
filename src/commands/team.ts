import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForUserCommand } from '../services/leagueResolver';
import { findTeamStatByRosterId, getTeamStats } from '../services/teamService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { formatRecord } from '../utils/formatting';
import { formatPoints } from '../utils/sleeperPoints';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const team: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Show a team profile (no full roster).')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (auto-detected if omitted)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Whose team to show (defaults to you)')
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
      commandName: 'team',
    });

    const stats = await getTeamStats(resolved.guildLeague.league_id);
    const stat = findTeamStatByRosterId(stats, resolved.roster.roster_id);
    if (!stat) throw new UserFacingError(Messages.genericFailure);

    const diff = stat.pointDiff;
    const embed = infoEmbed(`${stat.teamName} — ${resolved.guildLeague.league_nickname}`).addFields(
      { name: 'Manager', value: stat.managerName, inline: true },
      {
        name: 'Sleeper',
        value: stat.sleeperUsername ? `@${stat.sleeperUsername}` : '—',
        inline: true,
      },
      { name: 'Record', value: formatRecord(stat.wins, stat.losses, stat.ties), inline: true },
      { name: 'Points For', value: formatPoints(stat.pointsFor), inline: true },
      { name: 'Points Against', value: formatPoints(stat.pointsAgainst), inline: true },
      {
        name: 'Point Diff',
        value: `${diff >= 0 ? '+' : ''}${formatPoints(diff)}`,
        inline: true,
      },
      { name: 'Standings Rank', value: `#${stat.standingsRank}`, inline: true },
      {
        name: 'Waiver Position',
        value: stat.waiverPosition !== null ? `#${stat.waiverPosition}` : '—',
        inline: true,
      },
      {
        name: 'FAAB Used',
        value: stat.faabUsed !== null ? `$${stat.faabUsed}` : '—',
        inline: true,
      },
      { name: 'Total Moves', value: String(stat.totalMoves), inline: true },
      { name: 'Roster', value: `${stat.playersCount} players`, inline: true },
      { name: 'Starters', value: String(stat.startersCount), inline: true },
      { name: 'Bench', value: String(stat.benchCount), inline: true },
    );

    if (stat.irCount > 0)
      embed.addFields({ name: 'IR', value: String(stat.irCount), inline: true });
    if (stat.taxiCount > 0) {
      embed.addFields({ name: 'Taxi', value: String(stat.taxiCount), inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default team;
