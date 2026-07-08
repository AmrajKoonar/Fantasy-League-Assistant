import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import { successEmbed } from '../utils/embeds';
import { UserFacingError } from '../utils/errors';
import { normalizeNickname } from '../utils/formatting';
import { requireGuild, requireServerOwner } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const addLeague: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('add_league')
    .setDescription('Link a Sleeper league to this server (server owner only).')
    .addStringOption((option) =>
      option.setName('league_id').setDescription('The Sleeper league ID').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('A short nickname for the league (e.g. "Division 1", "Money League")')
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    requireServerOwner(interaction);
    const guildId = requireGuild(interaction);

    const leagueId = interaction.options.getString('league_id', true).trim();
    const rawNickname = interaction.options.getString('nickname', true).trim();
    const nickname = normalizeNickname(rawNickname);

    if (!nickname) {
      throw new UserFacingError(
        'That nickname has no letters or numbers in it. Try something like `division1` or `moneyleague`.',
        'Invalid nickname',
      );
    }

    const league = await sleeperApi.getLeague(leagueId);
    if (!league) {
      throw new UserFacingError(
        `I could not find a Sleeper league with ID \`${leagueId}\`. Double-check the ID and try again.`,
        'League not found',
      );
    }

    // Reject the nickname if it already points at a *different* league.
    const nicknameClash = await guildLeaguesRepo.getGuildLeagueByNickname(guildId, nickname);
    if (nicknameClash && nicknameClash.league_id !== leagueId) {
      throw new UserFacingError(
        `The nickname \`${nickname}\` is already used for **${nicknameClash.league_name ?? nicknameClash.league_id}**. Pick a different nickname or remove that league first.`,
        'Nickname already in use',
      );
    }

    const existingLeagues = await guildLeaguesRepo.getGuildLeagues(guildId);
    const existingRow = existingLeagues.find((l) => l.league_id === leagueId);

    const leagueFields = {
      guild_name: interaction.guild?.name ?? null,
      league_nickname: nickname,
      league_name: league.name ?? null,
      season: league.season ?? null,
      total_rosters: league.total_rosters ?? null,
      status: league.status ?? null,
    };

    let isDefault: boolean;
    if (existingRow) {
      // Same league re-added: update its info and (possibly new) nickname.
      isDefault = existingRow.is_default;
      await guildLeaguesRepo.updateGuildLeague(existingRow.id, leagueFields);
    } else {
      // First league added to a server becomes the default automatically.
      isDefault = existingLeagues.length === 0;
      await guildLeaguesRepo.insertGuildLeague({
        guild_id: guildId,
        league_id: leagueId,
        is_default: isDefault,
        created_by_discord_user_id: interaction.user.id,
        ...leagueFields,
      });
    }

    const embed = successEmbed(
      existingRow ? 'League updated' : 'League added',
      existingRow
        ? 'This league was already linked, so its info was refreshed.'
        : 'Members can now use this league in commands like `/standings` and `/roster`.',
    ).addFields(
      { name: 'Nickname', value: nickname, inline: true },
      { name: 'League name', value: league.name ?? '—', inline: true },
      { name: 'Season', value: league.season ?? '—', inline: true },
      { name: 'League ID', value: leagueId, inline: true },
      { name: 'Total rosters', value: String(league.total_rosters ?? '—'), inline: true },
      { name: 'Status', value: league.status ?? '—', inline: true },
      { name: 'Default league', value: isDefault ? 'Yes' : 'No', inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default addLeague;
