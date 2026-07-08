/**
 * Error types used across the bot.
 *
 * UserFacingError: safe, friendly message meant to be shown to the Discord user.
 * SleeperApiError: an unexpected Sleeper API failure (logged, shown generically).
 */

export class UserFacingError extends Error {
  public readonly title: string;

  constructor(message: string, title = 'Something went wrong') {
    super(message);
    this.name = 'UserFacingError';
    this.title = title;
  }
}

export class SleeperApiError extends Error {
  public readonly endpoint: string;
  public readonly status: number;

  constructor(endpoint: string, status: number, message?: string) {
    super(message ?? `Sleeper API request failed: ${endpoint} (status ${status})`);
    this.name = 'SleeperApiError';
    this.endpoint = endpoint;
    this.status = status;
  }
}

/** Common friendly messages reused across commands. */
export const Messages = {
  notLinked:
    'You need to link your Sleeper account first. Run `/link_sleeper username:<username>`.',
  targetNotLinked: (username: string) =>
    `**${username}** has not linked a Sleeper account yet. They can run \`/link_sleeper username:<username>\`.`,
  noLeagues:
    'This server does not have any linked Sleeper leagues yet. Ask the server owner to run `/add_league league_id:<league_id> nickname:<nickname>`.',
  leagueNotFound: 'I could not find that league nickname in this server.',
  ownerOnly: 'Only the Discord server owner can manage linked leagues.',
  sleeperUserNotFound: 'Could not find that Sleeper user.',
  guildOnly: 'This command can only be used inside a Discord server.',
  genericFailure: 'Something went wrong while talking to Sleeper. Please try again in a moment.',
} as const;
