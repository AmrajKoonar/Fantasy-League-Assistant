import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForUserCommand } from '../services/leagueResolver';
import { getLatestDraftGrades } from '../services/draftGradeService';
import { draftGradeTeamEmbed } from '../services/draftGradeFormatter';
import { handleLeagueAutocomplete } from './shared';
import { UserFacingError } from '../utils/errors';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const draftGrade: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('draft_grade')
    .setDescription("Show a team's latest saved draft grade and projected record.")
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
        .setDescription("Show another member's draft grade (defaults to you)")
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = requireGuild(interaction);
    const target = interaction.options.getUser('user') ?? interaction.user;
    const resolved = await resolveLeagueForUserCommand({
      guildId,
      discordUserId: target.id,
      isSelf: target.id === interaction.user.id,
      username: target.username,
      providedLeagueNickname: interaction.options.getString('league'),
      commandName: 'draft_grade',
    });

    await interaction.deferReply();
    const saved = await getLatestDraftGrades(guildId, resolved.guildLeague.league_id);
    if (!saved) {
      throw new UserFacingError(
        'No draft grades have been created for this league yet. Ask an admin to run `/create_draft_grades league:' +
          resolved.guildLeague.league_nickname +
          '`.',
        'No saved draft grades',
      );
    }
    const team = saved.teams.find(
      (entry) =>
        entry.sleeper_user_id === resolved.linked.sleeper_user_id ||
        entry.roster_id === resolved.roster.roster_id,
    );
    if (!team) {
      throw new UserFacingError(
        'I could not find that user’s team in the latest draft grades for this league.',
        'Team not found',
      );
    }
    await interaction.editReply({
      embeds: [draftGradeTeamEmbed(team, saved.league_name)],
    });
  },
};

export default draftGrade;
