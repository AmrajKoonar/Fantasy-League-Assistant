import 'dotenv/config';

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  nodeEnv: string;
}

const REQUIRED_VARS = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NODE_ENV',
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

  const supabaseUrl = (process.env.SUPABASE_URL as string).replace(/\/+$/, '');
  if (supabaseUrl.endsWith('/rest/v1')) {
    console.error(
      'SUPABASE_URL must be the base project URL (for example, https://your-project-ref.supabase.co), without /rest/v1.',
    );
    process.exit(1);
  }

  return {
    discordToken: process.env.DISCORD_TOKEN as string,
    discordClientId: process.env.DISCORD_CLIENT_ID as string,
    discordGuildId: process.env.DISCORD_GUILD_ID as string,
    supabaseUrl,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    nodeEnv: process.env.NODE_ENV as string,
  };
}

export const config = loadConfig();
