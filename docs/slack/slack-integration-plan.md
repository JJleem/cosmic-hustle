# Slack Integration Plan

Slack should be the command and report surface for Cosmic Hustle, not the durable memory layer.

## Target Shape

```text
Slack
  -> Hermes gateway
  -> Cosmic Hustle plan/run/wiki workflow
  -> Obsidian Vault update
  -> Slack report
```

Obsidian remains the shared memory source. GitHub syncs the Vault across computers.

## Channels

Recommended channels:

```text
#ai-command   CEO commands to agents
#ai-report    completed work summaries
#ai-log       verbose/debug gateway logs
```

## Current Local State

Hermes is installed here:

```text
/Users/carima_mac/.local/bin/hermes
```

Hermes status:

```text
OpenAI Codex OAuth: logged in
Slack: not configured yet
Gateway: stopped
```

Slack manifest:

```text
docs/slack/hermes-slack-app-manifest.json
```

## Setup Steps

1. Open Slack app management:

```text
https://api.slack.com/apps
```

2. Create a new app from manifest.

Use:

```text
docs/slack/hermes-slack-app-manifest.json
```

3. Enable Socket Mode.

Create an app-level token with `connections:write`.

Expected token shape:

```text
xapp-...
```

4. Install the app to the workspace.

Copy the bot token.

Expected token shape:

```text
xoxb-...
```

5. Configure Hermes:

```bash
/Users/carima_mac/.local/bin/hermes gateway setup
```

Enter the Slack app token and bot token when prompted.

6. Start the gateway:

```bash
/Users/carima_mac/.local/bin/hermes gateway run
```

After it works in foreground, install it as a launchd service:

```bash
/Users/carima_mac/.local/bin/hermes gateway install
/Users/carima_mac/.local/bin/hermes gateway start
```

## Smoke Tests

List Slack send targets:

```bash
/Users/carima_mac/.local/bin/hermes send --list slack
```

Send a test report:

```bash
/Users/carima_mac/.local/bin/hermes send --to slack:#ai-report "Cosmic Hustle Slack 연결 OK"
```

Check gateway status:

```bash
/Users/carima_mac/.local/bin/hermes gateway status
```

## Cosmic Hustle Workflow To Add After Tokens

Add a workflow endpoint:

```text
POST /api/ops/hermes/workflow
```

Internal sequence:

```text
plan
  -> run
  -> wiki
  -> append Vault note
  -> hermes send --to slack:#ai-report
```

Do not connect Slack directly to blog publishing yet.

## Secrets

Do not commit Slack secrets.

Expected secret values:

```text
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
```

Hermes should store these in its local config or `.env`, not in this repository.
