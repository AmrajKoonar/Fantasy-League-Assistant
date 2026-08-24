import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getRelevantDraft } from '../services/draftService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const draft: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('draft')
    .setDescription('Show the draft overview for a linked league.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });

    const leagueDraft = await getRelevantDraft(guildLeague.league_id);
    if (!leagueDraft) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            `Draft — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
            'No draft found for this league yet.',
          ),
        ],
      });
      return;
    }

    const embed = infoEmbed(
      `Draft — ${guildLeague.league_name ?? guildLeague.league_nickname}`,
    ).addFields(
      { name: 'Status', value: leagueDraft.status ?? '—', inline: true },
      { name: 'Type', value: leagueDraft.type ?? '—', inline: true },
      { name: 'Season', value: leagueDraft.season ?? '—', inline: true },
      { name: 'Rounds', value: String(leagueDraft.settings?.rounds ?? '—'), inline: true },
      { name: 'Teams', value: String(leagueDraft.settings?.teams ?? '—'), inline: true },
      {
        name: 'Start',
        value: leagueDraft.start_time ? `<t:${Math.floor(leagueDraft.start_time / 1000)}:f>` : '—',
        inline: true,
      },
      {
        name: 'Draft picks',
        value: 'Use `/draft_results league:<nickname> round:<number or all>` to view picks.',
        inline: false,
      },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default draft;
