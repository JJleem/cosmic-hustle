# Cosmic Hustle Agent Slash Commands

Cosmic Hustle can expose each employee as a Slack slash command through Hermes `quick_commands`.

Configured local Hermes commands:

```text
/plan   플랜 차장: planning, task type, scope
/wiki   위키 대리: knowledge notes, Obsidian-ready summaries
/pocke  포케 대리: research and facts
/run    런 사원: development and implementation
/ka     카 과장: analysis and insights
/over   오버 사원: writing and reports
/pixel  픽셀 사원: UX/UI design
/ping   핑 인턴: ideas
/fact   팩트 부장: review and validation
/root   루트 사원: DevOps and operations
/buzz   버즈 대리: marketing
```

Each command is mapped to `/background`, so the gateway starts an independent Hermes task and posts the result back to Slack.

Examples:

```text
/plan Cosmic Hustle 다음 3일 작업 우선순위 정리해줘
/run dashboard에서 Hermes workflow API 붙이는 구현 계획 줘
/wiki 오늘 결정사항을 Obsidian에 넣기 좋은 형태로 정리해줘
/fact 이 리포트에서 논리 허점 찾아줘
/buzz Slack 연결 완료를 어떻게 공유하면 바이럴 각일지 봐줘
```

## Slack Manifest

The local Hermes config is already updated, but Slack only accepts slash commands registered in the app manifest.

If Slack says a command does not exist, reapply:

```text
docs/slack/hermes-slack-app-manifest.json
```

Slack allows no more than 50 slash commands per app. This manifest intentionally keeps only the 11 employee commands and a small set of core Hermes commands. Use `/hermes <subcommand>` for less common Hermes commands that are not registered as top-level Slack slash commands.

Slack app settings:

```text
https://api.slack.com/apps
  -> Cosmic Hustle app
  -> App Manifest
  -> paste manifest
  -> Save
  -> Reinstall app if prompted
```

## Current Limitation

These commands currently produce Slack reports through the single `Cosmic Hustle` Slack bot identity.

To make each employee appear with their own sender name and avatar, the Slack app needs:

```text
chat:write.customize
```

The manifest includes this scope. After saving it, reinstall the Slack app if prompted. Slack requires this scope before an app can send messages with custom `username` and `icon_url`.

Public character image base:

```text
https://cosmic-hustle.ai.kr/characters/{agent}/default.png
```

Example:

```text
https://cosmic-hustle.ai.kr/characters/plan/default.png
```

Obsidian write-back is the next step.

Target next loop:

```text
/plan, /run, /wiki, ...
  -> employee report in Slack
  -> durable note in cosmic-hustle-vault
  -> GitHub sync
```
