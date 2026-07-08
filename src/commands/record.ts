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

const record: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('record')
    .setDescription("Show a team's record and point totals.")
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
        .setDescription('Whose record to show (defaults to you)')
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
      commandName: 'record',
    });

    const stats = await getTeamStats(resolved.guildLeague.league_id);
    const stat = findTeamStatByRosterId(stats, resolved.roster.roster_id);
    if (!stat) throw new UserFacingError(Messages.genericFailure);

    const diff = stat.pointDiff;
    const embed = infoEmbed(
      `${stat.teamName} — ${resolved.guildLeague.league_nickname}`,
      `Manager: **${stat.managerName}** | League rank: **#${stat.standingsRank}**`,
    ).addFields(
      { name: 'Record', value: formatRecord(stat.wins, stat.losses, stat.ties), inline: true },
      { name: 'Wins', value: String(stat.wins), inline: true },
      { name: 'Losses', value: String(stat.losses), inline: true },
      { name: 'Ties', value: String(stat.ties), inline: true },
      { name: 'Points For', value: formatPoints(stat.pointsFor), inline: true },
      { name: 'Points Against', value: formatPoints(stat.pointsAgainst), inline: true },
      {
        name: 'Point Diff',
        value: `${diff >= 0 ? '+' : ''}${formatPoints(diff)}`,
        inline: true,
      },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default record;
