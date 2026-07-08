import 'dotenv/config';

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | undefined;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  nodeEnv: string;
}

const REQUIRED_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/**
 * Validates required environment variables and returns a typed config.
 * Exits the process with a helpful message if anything is missing.
 */
export function loadConfig(): AppConfig {
  const missing = REQUIRED_VARS.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    console.error(
      [
        'Missing required environment variables:',
        ...missing.map((name) => `  - ${name}`),
        '',
        'Copy .env.example to .env and fill in the values. See README.md for setup instructions.',
      ].join('\n'),
    );
    process.exit(1);
  }

  return {
    discordToken: process.env.DISCORD_TOKEN as string,
    discordClientId: process.env.DISCORD_CLIENT_ID as string,
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    supabaseUrl: process.env.SUPABASE_URL as string,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}

export const config = loadConfig();
