import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import {
  getDraftReminderData,
  getLeagueMembersWithDiscordLinks,
} from '../services/reminderService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed, warningEmbed } from '../utils/embeds';
import { chunkDiscordMessage, formatTimestamp, safeMentionUser } from '../utils/formatting';
import { requireGuild, requireServerOwner } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const draftReminder: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('draftreminder')
    .setDescription('Ping linked members in a league about the draft (server owner only).')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Minutes until the draft (default 15)')
        .setMinValue(1)
        .setMaxValue(1440)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('message').setDescription('Optional custom message').setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    requireServerOwner(interaction);
    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const minutes = interaction.options.getInteger('minutes') ?? 15;
    const customMessage = interaction.options.getString('message');

    const [{ draft, startTimeMs }, members] = await Promise.all([
      getDraftReminderData(guildLeague.league_id),
      getLeagueMembersWithDiscordLinks(guildLeague.league_id),
    ]);

    if (members.linkedDiscordUserIds.length === 0) {
      await interaction.editReply({
        embeds: [
          warningEmbed(
            'No linked members',
            'No one in this league has linked their Discord account yet, so there is no one to remind.',
          ),
        ],
      });
      return;
    }

    const lines: string[] = [`📢 **Draft Reminder for ${guildLeague.league_nickname}**`];
    if (draft) lines.push(`Draft status: ${draft.status}`);
    if (startTimeMs) {
      lines.push(
        `Draft starts at ${formatTimestamp(startTimeMs, 'F')} (${formatTimestamp(startTimeMs, 'R')}).`,
      );
    } else {
      lines.push(
        `I could not find an exact draft time from Sleeper, but this is your requested draft reminder (about ${minutes} minutes' notice).`,
      );
    }
    if (customMessage) lines.push(`\n${customMessage}`);
    if (members.unlinkedCount > 0) {
      lines.push(
        `\n_${members.unlinkedCount} league member(s) have not linked Discord and were not pinged._`,
      );
    }

    const embed = infoEmbed('Draft Reminder', lines.join('\n'));

    // Ping linked members, chunking mentions to stay within message limits.
    const mentionText = members.linkedDiscordUserIds.map(safeMentionUser).join(' ');
    const chunks = chunkDiscordMessage(mentionText, 1900);
    const allowedMentions = { users: members.linkedDiscordUserIds };

    await interaction.editReply({ content: chunks[0], embeds: [embed], allowedMentions });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, allowedMentions });
    }
  },
};

export default draftReminder;
