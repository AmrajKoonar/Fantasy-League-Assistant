import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import {
  getLeagueMembersWithDiscordLinks,
  getWaiverReminderData,
} from '../services/reminderService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed, warningEmbed } from '../utils/embeds';
import { chunkDiscordMessage, safeMentionUser } from '../utils/formatting';
import { requireGuild, requireServerOwner } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const waiversReminder: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('waiversreminder')
    .setDescription('Ping linked members to submit waiver claims (server owner only).')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
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

    const customMessage = interaction.options.getString('message');

    const [data, members] = await Promise.all([
      getWaiverReminderData(guildLeague.league_id),
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

    const lines: string[] = [`📢 **Waivers Reminder for ${guildLeague.league_nickname}**`];
    if (data.week > 0) lines.push(`Current NFL week: **${data.week}**`);
    lines.push(`Waiver type: ${data.waiverType}`);
    if (data.faabBudget !== null) lines.push(`FAAB budget: $${data.faabBudget}`);
    lines.push('Remember to submit your waiver claims before they process.');
    if (customMessage) lines.push(`\n${customMessage}`);
    if (members.unlinkedCount > 0) {
      lines.push(
        `\n_${members.unlinkedCount} league member(s) have not linked Discord and were not pinged._`,
      );
    }

    const embed = infoEmbed('Waivers Reminder', lines.join('\n')).setFooter({
      text: 'Sleeper does not expose an exact waiver deadline, so none is promised here.',
    });

    const mentionText = members.linkedDiscordUserIds.map(safeMentionUser).join(' ');
    const chunks = chunkDiscordMessage(mentionText, 1900);
    const allowedMentions = { users: members.linkedDiscordUserIds };

    await interaction.editReply({ content: chunks[0], embeds: [embed], allowedMentions });
    for (const chunk of chunks.slice(1)) {
      await interaction.followUp({ content: chunk, allowedMentions });
    }
  },
};

export default waiversReminder;
