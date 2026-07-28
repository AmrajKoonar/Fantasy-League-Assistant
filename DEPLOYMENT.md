# Deploying Fantasy League Assistant on Render

Fantasy League Assistant is a long-running Discord gateway client. Deploy it as a **Render Background Worker**, not a Web Service. It does not listen for HTTP traffic and does not need Express or a `PORT`.

Render's current documentation says free instances are not available for Background Workers. The included `render.yaml` uses the `starter` worker plan. Check [Render pricing](https://render.com/pricing) before creating the service because plans and pricing can change.

## Before deployment

1. Apply [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor.
2. Confirm the project builds:

   ```bash
   npm ci
   npm run build
   ```

3. Deploy slash commands if command names or options changed:

   ```bash
   npm run deploy:commands
   ```

   This requires `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID` locally. Command deployment remains separate from bot startup so worker restarts do not repeatedly register commands.

4. Commit the deployment changes, push `FB.render.deploy.v1`, open a pull request into `main`, and merge after the build passes.
5. Do not commit `.env`. Render environment variables replace the local `.env` file in production.

## Option A: Render Blueprint

The repository includes [`render.yaml`](render.yaml), which defines a Node.js Background Worker.

1. Push the repository to GitHub.
2. Open the [Render Dashboard](https://dashboard.render.com/).
3. Choose **New > Blueprint**.
4. Connect the GitHub repository.
5. Select the branch containing `render.yaml`. For production, use `main` after the pull request is merged.
6. Enter every value Render requests for variables marked `sync: false`.
7. Review the `starter` worker plan and create the service.

The Blueprint uses:

- Service type: Background Worker (`worker`)
- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Auto-deploy: on each commit to the connected branch

## Option B: Render Dashboard

1. Push the finished code to GitHub.
2. Go to <https://dashboard.render.com/>.
3. Create a new service.
4. Choose **Background Worker**.
5. Connect the GitHub repository.
6. Configure:
   - Name: `fantasy-league-assistant`
   - Runtime: `Node`
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
7. Choose an available worker plan. Background Workers currently do not support Render's free instance type.
8. Add these environment variables:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NODE_ENV=production`
9. Set `SUPABASE_URL` to the base project URL:

   ```text
   https://your-project-ref.supabase.co
   ```

   Do not append `/rest/v1/`. The Supabase JavaScript client handles API paths.

10. Deploy the worker.
11. Open the Render logs and confirm messages similar to:
    - `Starting Fantasy League Assistant...`
    - `NODE_ENV: production`
    - `Registered command handler.`
    - `Logged in as <bot tag>`
12. Test `/ping` in Discord.
13. Stop any local terminal running `npm run dev`.

## Branches and automatic deploys

Render deploys the connected branch. A production service should normally watch `main`; a temporary test service can watch `FB.render.deploy.v1`.

With auto-deploy enabled, pushing or merging a commit to the connected branch triggers a rebuild and restart. Confirm the selected branch under the service's Render settings before relying on automatic deploys.

Recommended workflow:

1. Work on `FB.render.deploy.v1`.
2. Commit and push the branch.
3. Open a pull request into `main`.
4. Merge after `npm run build` and lint checks pass.
5. Render deploys from `main` if that is the connected branch.

## Do not run two bot copies

Never run the local bot and Render worker simultaneously with the same Discord token. Two gateway clients can produce duplicate replies, expired interactions, and confusing logs.

After production is healthy, stop local development with `Ctrl+C`. Graceful `SIGINT` and `SIGTERM` handlers disconnect the Discord client cleanly during local stops and Render restarts.

## Slash commands

Bot startup does not deploy slash commands. Run:

```bash
npm run deploy:commands
```

Run it when command names, descriptions, or options change. If only command implementation changed, redeployment is usually unnecessary.

Guild commands appear quickly and use `DISCORD_GUILD_ID`. Global commands can take longer to propagate:

```bash
npm run deploy:commands -- --global
```

## Security

- Never paste `.env` into Discord, GitHub, issues, logs, or `render.yaml`.
- Store production secrets in Render environment variables.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- If the Discord token is exposed, reset it under **Discord Developer Portal > Bot** and update Render.
- If the Supabase service role key is exposed, rotate it in Supabase and update Render.

## Troubleshooting

### Bot works locally but not on Render

- Confirm the service type is **Background Worker**.
- Confirm the build command is `npm ci && npm run build`.
- Confirm the start command is `npm start`.
- Confirm all six environment variables are set.
- Confirm `SUPABASE_URL` does not contain `/rest/v1`.
- Run `npm run build` locally.
- Confirm the Discord token is valid and the bot is invited to the server.
- Review the Render **Logs** and **Events** pages for the first startup error.

### Commands do not appear

- Run `npm run deploy:commands`.
- Verify `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID`.
- Prefer guild command registration while developing.
- Global commands can take time to propagate.
- Reinvite the bot only if its `applications.commands` scope is missing.

### Bot replies twice

Two copies are running. Stop local `npm run dev` or stop the duplicate Render worker.

### Supabase errors

- Use the base `SUPABASE_URL`.
- Verify `SUPABASE_SERVICE_ROLE_KEY`.
- Apply `supabase/schema.sql`.
- Confirm all expected tables exist.
- The service role key bypasses RLS; do not replace it with a publishable/anon key.

### Worker stops or is unavailable

- Confirm it was created as a Background Worker, not a Web Service.
- Check the worker's Render plan, billing status, logs, and deploy events.
- Render's free instance type is currently unavailable for Background Workers. If the selected plan does not provide the needed always-on behavior, choose an appropriate paid worker plan or another host.

### Bot crashes during deployment

Render restarts the process according to its service behavior. Fix the first error in the logs, verify environment variables, and redeploy. Use **Clear build cache & deploy** if dependency or build-cache state appears stale.
