import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
} from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import {
  createDraftGrades as generateDraftGrades,
  getLatestDraftGrades,
  missingDraftGradeConfiguration,
} from '../services/draftGradeService';
import {
  draftGradeEmbeds,
  draftGradesIntroEmbed,
  projectedPowerRankingsEmbed,
} from '../services/draftGradeFormatter';
import { handleLeagueAutocomplete } from './shared';
import { errorEmbed } from '../utils/embeds';
import { isServerAdminOrOwner, requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const COOLDOWN_MS = 10 * 60 * 1000;
const cooldowns = new Map<string, number>();

function embedLength(embed: EmbedBuilder): number {
  const data = embed.toJSON();
  return (
    (data.title?.length ?? 0) +
    (data.description?.length ?? 0) +
    (data.footer?.text.length ?? 0) +
    (data.author?.name.length ?? 0) +
    (data.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0)
  );
}

function embedBatches(embeds: EmbedBuilder[]): EmbedBuilder[][] {
  const batches: EmbedBuilder[][] = [];
  let current: EmbedBuilder[] = [];
  let currentLength = 0;
  for (const embed of embeds) {
    const length = embedLength(embed);
    if (current.length > 0 && (current.length === 10 || currentLength + length > 5_900)) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(embed);
    currentLength += length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const createDraftGrades: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('create_draft_grades')
    .setDescription('Generate draft grades, records, and projected power rankings for a league.')
    .addStringOption((option) =>
      option
        .setName('league')
        .setDescription('League nickname (defaults to the server default league)')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = requireGuild(interaction);
    if (!isServerAdminOrOwner(interaction)) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Permission denied',
            'Only a server admin or the server owner can create draft grades.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const missing = missingDraftGradeConfiguration();
    if (missing.length > 0) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Draft grades not configured',
            `Draft grades are not configured yet. Missing ${missing.join(' or ')}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const guildLeague = await resolveLeagueForCommand({
      guildId,
      providedLeagueNickname: interaction.options.getString('league'),
    });
    const cooldownKey = `${guildId}:${guildLeague.league_id}`;
    const lastStarted = cooldowns.get(cooldownKey) ?? 0;
    if (Date.now() - lastStarted < COOLDOWN_MS) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            'Draft grades generated recently',
            'Draft grades were generated recently. Please wait a few minutes before regenerating.',
          ),
        ],
      });
      return;
    }

    const previous = await getLatestDraftGrades(guildId, guildLeague.league_id);
    cooldowns.set(cooldownKey, Date.now());
    try {
      await interaction.editReply({
        content: `Creating draft grades for **${guildLeague.league_name ?? guildLeague.league_nickname}**. This may take a minute...`,
      });
      const result = await generateDraftGrades({
        guildId,
        guildLeague,
        generatedByDiscordUserId: interaction.user.id,
      });
      const intro = draftGradesIntroEmbed(result);
      if (previous) {
        intro.addFields({
          name: 'Regenerated',
          value: 'Previous grades existed. A new result was saved; older history was preserved.',
        });
      }
      await interaction.editReply({ content: null, embeds: [intro] });
      for (const batch of embedBatches(draftGradeEmbeds(result))) {
        await interaction.followUp({ embeds: batch });
      }
      await interaction.followUp({ embeds: [projectedPowerRankingsEmbed(result)] });
    } catch (error) {
      cooldowns.delete(cooldownKey);
      throw error;
    }
  },
};

export default createDraftGrades;
