import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as linkedUsersRepo from '../db/repositories/linkedUsersRepository';
import {
  findLeaguesContainingSleeperUser,
  resolveLeagueForCommand,
} from '../services/leagueResolver';
import { buildRosterView, findRosterForSleeperUser } from '../services/rosterService';
import { handleLeagueAutocomplete } from './shared';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { formatRecord, truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { GuildLeagueRow } from '../types/database';
import type { SleeperRoster } from '../types/sleeper';
import type { BotCommand } from '../types/commands';

const MAX_BENCH_SHOWN = 12;

function playerListField(ids: string[], maxShown = 25): string {
  if (ids.length === 0) return '—';
  const shown = ids.slice(0, maxShown);
  const extra = ids.length - shown.length;
  const text = shown.map((line) => `• ${line}`).join('\n');
  return truncate(extra > 0 ? `${text}\n…and ${extra} more` : text, 1024);
}

const roster: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription('Show a fantasy team roster.')
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
        .setDescription('Show another member\'s roster (defaults to you)')
        .setRequired(false),
    ),

  autocomplete: handleLeagueAutocomplete,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const guildId = requireGuild(interaction);
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const isSelf = targetUser.id === interaction.user.id;

    const linked = await linkedUsersRepo.getLinkedUser(targetUser.id);
    if (!linked) {
      throw new UserFacingError(
        isSelf ? Messages.notLinked : Messages.targetNotLinked(targetUser.username),
        'No linked account',
      );
    }

    const providedNickname = interaction.options.getString('league');
    let guildLeague: GuildLeagueRow;
    let sleeperRoster: SleeperRoster;

    if (providedNickname) {
      // Explicit league: look the user up in that league only.
      guildLeague = await resolveLeagueForCommand({
        guildId,
        providedLeagueNickname: providedNickname,
        allowDefault: false,
      });
      const found = await findRosterForSleeperUser(guildLeague.league_id, linked.sleeper_user_id);
      if (!found) {
        throw new UserFacingError(
          `I could not find this linked Sleeper account in the **${guildLeague.league_nickname}** league.`,
          'Not in this league',
        );
      }
      sleeperRoster = found;
    } else {
      // Auto-detect: search every league linked to this server.
      const matches = await findLeaguesContainingSleeperUser({
        guildId,
        sleeperUserId: linked.sleeper_user_id,
      });

      if (matches.length === 0) {
        throw new UserFacingError(
          isSelf
            ? 'I could not find your linked Sleeper account in any league connected to this Discord server. Make sure you linked the correct Sleeper account with `/link_sleeper`.'
            : `I could not find **${targetUser.username}**'s linked Sleeper account in any league connected to this Discord server.`,
          'No roster found',
        );
      }

      if (matches.length > 1) {
        const suggestions = matches
          .map((m) => `\`/roster league:${m.league.league_nickname}\``)
          .join('\n');
        throw new UserFacingError(
          `I found ${isSelf ? 'you' : `**${targetUser.username}**`} in multiple linked leagues. Please choose one:\n${suggestions}`,
          'Multiple leagues found',
        );
      }

      guildLeague = matches[0].league;
      sleeperRoster = matches[0].roster;
    }

    const view = await buildRosterView(guildLeague.league_id, sleeperRoster);
    const record = formatRecord(view.record.wins, view.record.losses, view.record.ties);

    const embed = infoEmbed(
      `${view.teamName} — ${guildLeague.league_nickname}`,
      `Manager: ${linked.sleeper_display_name ?? linked.sleeper_username ?? '—'} | Record: **${record}**`,
    );

    embed.addFields({ name: 'Starters', value: playerListField(view.starters), inline: false });
    embed.addFields({
      name: 'Bench',
      value: playerListField(view.bench, MAX_BENCH_SHOWN),
      inline: false,
    });
    if (view.reserve.length > 0) {
      embed.addFields({ name: 'IR', value: playerListField(view.reserve), inline: false });
    }
    if (view.taxi.length > 0) {
      embed.addFields({ name: 'Taxi', value: playerListField(view.taxi), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default roster;
