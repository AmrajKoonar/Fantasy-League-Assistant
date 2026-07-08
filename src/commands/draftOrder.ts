import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { resolveLeagueForCommand } from '../services/leagueResolver';
import { getDraftOrder } from '../services/draftService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const draftOrder: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('draft_order')
    .setDescription('Show the draft order for a linked league.')
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

    const view = await getDraftOrder(guildLeague.league_id);
    const title = `Draft order — ${guildLeague.league_name ?? guildLeague.league_nickname}`;

    if (!view) {
      await interaction.editReply({
        embeds: [infoEmbed(title, 'No draft found for this league yet.')],
      });
      return;
    }

    if (view.isAuction) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            title,
            `This is an **auction draft** (status: ${view.draft.status}), so there is no traditional pick order. Nominations rotate instead.`,
          ),
        ],
      });
      return;
    }

    if (view.order.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            title,
            `The draft order has not been set yet (draft status: ${view.draft.status}).`,
          ),
        ],
      });
      return;
    }

    const lines = view.order.map(
      (entry) => `**${entry.slot}.** ${entry.teamName} — ${entry.managerName}`,
    );
    const embed = infoEmbed(title, truncate(lines.join('\n'), 4096)).setFooter({
      text: `Draft status: ${view.draft.status}`,
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default draftOrder;
