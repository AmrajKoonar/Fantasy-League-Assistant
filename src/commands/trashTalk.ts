import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForUserCommand } from '../services/leagueResolver';
import { findTeamStatByRosterId, getTeamStats } from '../services/teamService';
import { generateTrashTalk } from '../services/funService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const trashTalk: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('trash_talk')
    .setDescription('Generate a light, harmless fantasy football joke about a team.')
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
        .setDescription('Whose team to roast (defaults to you)')
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
      commandName: 'trash_talk',
    });

    const stats = await getTeamStats(resolved.guildLeague.league_id);
    const stat = findTeamStatByRosterId(stats, resolved.roster.roster_id) ?? null;
    const joke = generateTrashTalk(stat, stats.length);

    const embed = infoEmbed(
      `🔥 Trash talk — ${stat?.teamName ?? targetUser.username}`,
      joke,
    ).setFooter({ text: 'All in good fun.' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default trashTalk;
