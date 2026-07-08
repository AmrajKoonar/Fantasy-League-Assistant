import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForUserCommand } from '../services/leagueResolver';
import { findTeamStatByRosterId, getTeamStats } from '../services/teamService';
import { calculatePanicMeter } from '../services/funService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

/** A simple 10-segment bar for the panic percentage. */
function panicBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return `${'🟥'.repeat(filled)}${'⬜'.repeat(10 - filled)}`;
}

const panicMeter: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('panic_meter')
    .setDescription('A playful panic level for a team.')
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
        .setDescription('Whose panic level to check (defaults to you)')
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
      commandName: 'panic_meter',
    });

    const stats = await getTeamStats(resolved.guildLeague.league_id);
    const stat = findTeamStatByRosterId(stats, resolved.roster.roster_id);
    if (!stat) throw new UserFacingError(Messages.genericFailure);

    const panic = calculatePanicMeter(stat, stats.length);
    const embed = infoEmbed(`Panic meter — ${stat.teamName}`)
      .setDescription(
        `${panicBar(panic.percent)}\n**${panic.percent}% — ${panic.level}**\n${panic.line}`,
      )
      .setFooter({ text: 'Bot-calculated for fun. Not official Sleeper data.' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default panicMeter;
