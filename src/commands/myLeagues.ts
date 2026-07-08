import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import * as sleeperApi from '../services/sleeperApi';
import * as linkedUsersRepo from '../db/repositories/linkedUsersRepository';
import * as guildLeaguesRepo from '../db/repositories/guildLeaguesRepository';
import { infoEmbed } from '../utils/embeds';
import { Messages, UserFacingError } from '../utils/errors';
import { truncate } from '../utils/formatting';
import { requireGuild } from '../utils/permissions';
import type { BotCommand } from '../types/commands';

const myLeagues: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('my_leagues')
    .setDescription('List your Sleeper leagues this season and which are linked to this server.'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = requireGuild(interaction);

    const linked = await linkedUsersRepo.getLinkedUser(interaction.user.id);
    if (!linked) {
      throw new UserFacingError(Messages.notLinked, 'No linked account');
    }

    const state = await sleeperApi.getNflState();
    if (!state) throw new UserFacingError(Messages.genericFailure);
    const season = state.league_season ?? state.season;

    const [userLeagues, serverLeagues] = await Promise.all([
      sleeperApi.getUserLeagues(linked.sleeper_user_id, season),
      guildLeaguesRepo.getGuildLeagues(guildId),
    ]);

    if (!userLeagues || userLeagues.length === 0) {
      await interaction.editReply({
        embeds: [
          infoEmbed(
            `Your Sleeper leagues (${season})`,
            `No leagues found for **${linked.sleeper_display_name ?? linked.sleeper_username}** in the ${season} season.`,
          ),
        ],
      });
      return;
    }

    const nicknameByLeagueId = new Map(serverLeagues.map((l) => [l.league_id, l.league_nickname]));

    const lines = userLeagues.map((league) => {
      const nickname = nicknameByLeagueId.get(league.league_id);
      const linkedTag = nickname ? ` — linked here as \`${nickname}\`` : '';
      return `• **${league.name}** (${league.total_rosters ?? '?'} teams, ${league.status ?? '—'})${linkedTag}`;
    });

    const linkedCount = userLeagues.filter((l) => nicknameByLeagueId.has(l.league_id)).length;

    const embed = infoEmbed(
      `Your Sleeper leagues (${season})`,
      truncate(
        `${lines.join('\n')}\n\n${linkedCount} of ${userLeagues.length} are linked to this server.`,
        4096,
      ),
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export default myLeagues;
