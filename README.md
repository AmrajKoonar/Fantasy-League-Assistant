# Fantasy League Assistant

A Discord bot that lets your server view Sleeper fantasy football league information with slash commands. One Discord server can link **multiple Sleeper leagues** (e.g. Division 1–4 and a Money League), and members link their Sleeper account **once** to use commands like `/roster` across every league in the server.

Built on the official, free, read-only [Sleeper API](https://docs.sleeper.com/) — no Sleeper credentials required, ever.

## Features

- **Multi-league servers** — link any number of Sleeper leagues to one Discord server, each with a short nickname (`division1`, `moneyleague`, ...).
- **One-time account linking** — users run `/link_sleeper` once; the bot finds their team in any linked league.
- **Roster auto-detection** — `/roster` with no options figures out which linked league(s) you're in.
- **Standings, matchups, transactions** — live league data with clean Discord embeds.
- **Trending players & player search** — powered by a locally cached copy of Sleeper's player database.
- **Autocomplete** — the `league` option suggests only the leagues linked to *your* server.
- **Built-in caching** — Sleeper responses are cached in memory so the bot stays well under Sleeper's 1000 calls/minute limit.

## Tech stack

- [Node.js](https://nodejs.org/) 18.17+ (uses the built-in `fetch`)
- [TypeScript](https://www.typescriptlang.org/) (strict mode)
- [discord.js v14](https://discordjs.guide/)
- [Supabase Postgres](https://supabase.com/docs) via [`@supabase/supabase-js`](https://supabase.com/docs/reference/javascript/introduction)
- `dotenv`, `tsx` (dev runner), ESLint + Prettier

## Project structure

```
src/
  index.ts              # Bot entrypoint + interaction handler
  deploy-commands.ts    # Slash command registration script
  config/env.ts         # Env loading + validation
  commands/             # One file per slash command + index.ts registry
  services/             # Sleeper API client, caches, league resolver, domain logic
  db/                   # Supabase client + repositories
  utils/                # Embeds, errors, formatting, permissions, logger
  types/                # Sleeper, database, and command types
supabase/schema.sql     # Database schema
```

## Setup

### 1. Prerequisites

- Node.js 18.17 or newer (`node --version`)
- npm
- A [Discord](https://discord.com/developers/applications) account that **owns** the target server
- A free [Supabase](https://supabase.com/) account

### 2. Install

```bash
git clone <this repo>
cd Fantasy-League-Assistant
npm install
```

### 3. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Name it "Fantasy League Assistant".
2. Under **General Information**, copy the **Application ID** — this is `DISCORD_CLIENT_ID`.
3. Go to **Bot**:
   - Click **Reset Token**, copy the token — this is `DISCORD_TOKEN`. Keep it secret.
   - No privileged gateway intents are required (the bot only uses slash commands).
4. Go to **Installation** (or OAuth2 → URL Generator):
   - Scopes: `bot` and `applications.commands`.
   - Bot permissions: **Send Messages** and **Embed Links** are enough.
   - Open the generated invite URL and add the bot to your server.
5. In Discord, enable **Developer Mode** (User Settings → Advanced), then right-click your server icon → **Copy Server ID** — this is `DISCORD_GUILD_ID`.

### 4. Create the Supabase project

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `linked_users` and `guild_leagues` tables.
3. In **Project Settings → API**, copy:
   - **Project URL** — this is `SUPABASE_URL`.
   - **`service_role` secret key** — this is `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses row security; it must only ever live on the server running the bot.

### 5. Configure environment variables

```bash
cp .env.example .env   # or copy manually on Windows
```

Fill in `.env`:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=your-server-id
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=development
```

Never commit `.env`. The bot validates these on startup and exits with a clear message if any are missing.

### 6. Deploy slash commands

```bash
npm run deploy:commands
```

This registers all commands to the guild in `DISCORD_GUILD_ID` (instant). To register globally later (takes up to an hour to propagate):

```bash
npm run deploy:commands -- --global
```

### 7. Run the bot

```bash
npm run dev      # development with auto-reload
```

For production:

```bash
npm run build
npm start
```

## Command list

| Command | Description | Visibility |
| --- | --- | --- |
| `/ping` | Health check with latency | Public |
| `/link_sleeper username:<name>` | Link your Discord account to your Sleeper account | Ephemeral |
| `/me` | Show your linked Sleeper account | Ephemeral |
| `/add_league league_id:<id> nickname:<name>` | Link a Sleeper league to this server (owner only) | Ephemeral |
| `/remove_league nickname:<name>` | Remove a linked league (owner only) | Ephemeral |
| `/set_default_league nickname:<name>` | Set the server's default league (owner only) | Ephemeral |
| `/leagues` | List all leagues linked to this server | Public |
| `/league_info [league]` | League settings, scoring, roster positions | Public |
| `/standings [league]` | Standings sorted by wins, then points for | Public |
| `/matchups [league] [week]` | Weekly matchups and scores | Public |
| `/roster [league] [user]` | A team's starters, bench, IR, and taxi | Public |
| `/transactions [league] [week]` | Latest 10 transactions for a week | Public |
| `/trending type:<add\|drop> [hours] [limit]` | Trending adds/drops across Sleeper | Public |
| `/player name:<name>` | Search the Sleeper player database | Public |

Examples:

```
/link_sleeper username:myUsername
/roster
/roster league:division1
/roster user:@Friend
/standings league:division2
/matchups league:moneyleague week:5
/transactions league:division3
/trending type:add hours:48 limit:15
/player name:jefferson
```

## Multi-league server setup (V1 flow)

**Server owner:**

1. Add the bot to the Discord server (invite link from step 3 above).
2. Find each Sleeper league's ID. Open the league in the Sleeper web app — the ID is the long number in the URL: `https://sleeper.com/leagues/<league_id>/...`
3. Link the leagues:

```
/add_league league_id:<id> nickname:division1
/add_league league_id:<id> nickname:division2
/add_league league_id:<id> nickname:division3
/add_league league_id:<id> nickname:division4
/add_league league_id:<id> nickname:moneyleague
```

4. Optionally set a default (the first league added is the default automatically):

```
/set_default_league nickname:division1
```

**Normal user:**

1. Link once: `/link_sleeper username:<sleeper username>`
2. Use commands: `/roster`, `/standings league:division2`, `/matchups league:moneyleague`, ...

Nicknames are normalized for lookup: "Division 1" → `division1`, "Money League" → `moneyleague`. Users can type either form.

## How roster auto-detection works

When someone runs `/roster` without a league:

1. The bot looks up their linked Sleeper user ID in Supabase.
2. It fetches rosters (cached for 2 minutes) for **every league linked to this Discord server** — never the user's other personal Sleeper leagues.
3. If exactly one linked league contains a roster owned (or co-owned) by that Sleeper ID, the bot shows that roster.
4. If multiple leagues match, the bot asks the user to pick one (e.g. `/roster league:division1` or `/roster league:moneyleague`).
5. If none match, it explains that the linked Sleeper account isn't in any server-linked league.

## League selection for other commands

`/league_info`, `/standings`, `/matchups`, and `/transactions` resolve the league in this order:

1. The `league` option, if provided.
2. The server's default league.
3. The only linked league, if exactly one exists.
4. Otherwise, the bot asks the user to choose.

## Caching

All Sleeper calls go through `src/services/sleeperApi.ts` with in-memory caching:

| Data | TTL |
| --- | --- |
| Players database (~5 MB) | 24 hours |
| League users | 10 minutes |
| League info, trending | 5 minutes |
| Rosters, transactions | 2 minutes |
| NFL state | 1 minute |
| Matchups | 30 seconds |

## Sleeper API references

- Docs: https://docs.sleeper.com/
- Base URL: `https://api.sleeper.app/v1`
- The API is free, read-only, requires no token, and is limited to 1000 calls/minute. This bot never attempts to modify Sleeper data.

## Known limitations

- In-memory cache only: restarting the bot clears caches (the players database is re-downloaded on first use).
- Single-process design; running multiple bot instances would each keep their own cache.
- Standings tiebreakers use wins → points for → losses; Sleeper's own playoff seeding rules may differ.
- Team names come from Sleeper user metadata; teams without a custom name fall back to the owner's display name.
- Only NFL fantasy football is supported.

## Future feature ideas

- Playoff bracket command
- Draft board command
- Traded picks command
- User leagues command
- Scheduled weekly matchup recap
- Automatic weekly scoreboard post
- Trade summary command
- Waiver wire command
- Manager power rankings
- Web dashboard
- Yahoo Fantasy support later
- ESPN support later if safe and reliable

## Security notes

- `.env` is gitignored; only `.env.example` is committed.
- The Supabase **service role key** stays server-side only and is never logged or sent to Discord.
- The bot never asks for Sleeper passwords — the Sleeper API needs no authentication.
- No gambling, betting, or money-handling features.
