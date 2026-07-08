import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getScoring } from '../services/leagueSettingsService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

/** Splits scoring lines into embed field chunks that respect the 1024 limit. */
function chunkLines(lines: string[], maxPerField = 15): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += maxPerField) {
    chunks.push(lines.slice(i, i + maxPerField).join('\n'));
  }
  return chunks;
}

const scoring: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('scoring')
    .setDescription('Show the scoring settings for a linked league.')
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

    const { name, lines } = await getScoring(guildLeague.league_id);
    if (lines.length === 0) {
      throw new UserFacingError(
        'This league has no scoring settings to display.',
        'No scoring settings',
      );
    }

    const formatted = lines.map((l) => `${l.label}: **${l.value}**`);
    const embed = infoEmbed(`Scoring — ${name}`);

    // Discord allows max 25 fields; the first ~24 chunks are more than enough.
    chunkLines(formatted)
      .slice(0, 24)
      .forEach((chunk, index) => {
        embed.addFields({ name: index === 0 ? 'Settings' : '\u200b', value: chunk, inline: true });
      });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default scoring;
