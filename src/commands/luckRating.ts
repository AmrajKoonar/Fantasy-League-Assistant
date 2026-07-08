import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForUserCommand } from '../services/leagueResolver';
import { findTeamStatByRosterId, getTeamStats } from '../services/teamService';
import { calculateLuckRating } from '../services/funService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { formatRecord } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const luckRating: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('luck_rating')
    .setDescription('A fun estimate of how lucky a team has been.')
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
        .setDescription('Whose luck to rate (defaults to you)')
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
      commandName: 'luck_rating',
    });

    const stats = await getTeamStats(resolved.guildLeague.league_id);
    const stat = findTeamStatByRosterId(stats, resolved.roster.roster_id);
    if (!stat) throw new UserFacingError(Messages.genericFailure);

    const luck = calculateLuckRating(stat);
    const embed = infoEmbed(`Luck rating — ${stat.teamName}`)
      .setDescription(`**${luck.rating}**\n${luck.line}`)
      .addFields(
        { name: 'Record', value: formatRecord(stat.wins, stat.losses, stat.ties), inline: true },
        { name: 'Points For rank', value: `#${luck.pointsForRank}`, inline: true },
        { name: 'Standings rank', value: `#${luck.standingsRank}`, inline: true },
      )
      .setFooter({ text: 'Bot-calculated for fun. Not official Sleeper data.' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default luckRating;
