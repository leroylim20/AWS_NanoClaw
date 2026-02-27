---
name: setup
description: Run initial NanoClaw setup. Use when user wants to install dependencies, authenticate WhatsApp/Telegram, register their main channel, or start the background services. Triggers on "setup", "install", "configure nanoclaw", or first-time setup requests.
---

# NanoClaw Setup

Run setup steps automatically. Only pause when user action is required (WhatsApp authentication, configuration choices). Setup uses `bash setup.sh` for bootstrap, then `npx tsx setup/index.ts --step <name>` for all other steps. Steps emit structured status blocks to stdout. Verbose logs go to `logs/setup.log`.

**Principle:** When something is broken or missing, fix it. Don't tell the user to go fix it themselves unless it genuinely requires their manual action (e.g. scanning a QR code, pasting a secret token). If a dependency is missing, install it. If a service won't start, diagnose and repair. Ask the user for permission when needed, then do the work.

**UX Note:** Use `AskUserQuestion` for all user-facing questions.

## 1. Bootstrap (Node.js + Dependencies)

Run `bash setup.sh` and parse the status block.

- If NODE_OK=false → Node.js is missing or too old. Use `AskUserQuestion: Would you like me to install Node.js 22?` If confirmed:
  - macOS: `brew install node@22` (if brew available) or install nvm then `nvm install 22`
  - Linux: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`, or nvm
  - After installing Node, re-run `bash setup.sh`
- If DEPS_OK=false → Read `logs/setup.log`. Try: delete `node_modules` and `package-lock.json`, re-run `bash setup.sh`. If native module build fails, install build tools (`xcode-select --install` on macOS, `build-essential` on Linux), then retry.
- If NATIVE_OK=false → better-sqlite3 failed to load. Install build tools and re-run.
- Record PLATFORM and IS_WSL for later steps.

## 2. Check Environment

Run `npx tsx setup/index.ts --step environment` and parse the status block.

- If HAS_AUTH=true → note that WhatsApp auth exists, offer to skip WhatsApp steps
- If HAS_REGISTERED_GROUPS=true → note existing config, offer to skip or reconfigure
- Record APPLE_CONTAINER and DOCKER values for step 3
- Check `.env` for TELEGRAM_BOT_TOKEN to determine if Telegram is configured

## 2.5. Choose Channel Type

AskUserQuestion: Which messaging platform do you want to use?
- **WhatsApp** (default) - Continue to steps 5-8 (WhatsApp flow)
- **Telegram** - Continue to steps 5T-8T (Telegram flow)
- **Both** - Set up both channels (advanced)

If Telegram is chosen and TELEGRAM_BOT_TOKEN exists in `.env`, offer to skip or reconfigure.

## 3. Container Runtime

### 3a. Choose runtime

Check the preflight results for `APPLE_CONTAINER` and `DOCKER`, and the PLATFORM from step 1.

- PLATFORM=linux → Docker (only option)
- PLATFORM=macos + APPLE_CONTAINER=installed → Use `AskUserQuestion: Docker (default, cross-platform) or Apple Container (native macOS)?` If Apple Container, run `/convert-to-apple-container` now, then skip to 3c.
- PLATFORM=macos + APPLE_CONTAINER=not_found → Docker (default)

### 3a-docker. Install Docker

- DOCKER=running → continue to 3b
- DOCKER=installed_not_running → start Docker: `open -a Docker` (macOS) or `sudo systemctl start docker` (Linux). Wait 15s, re-check with `docker info`.
- DOCKER=not_found → Use `AskUserQuestion: Docker is required for running agents. Would you like me to install it?` If confirmed:
  - macOS: install via `brew install --cask docker`, then `open -a Docker` and wait for it to start. If brew not available, direct to Docker Desktop download at https://docker.com/products/docker-desktop
  - Linux: install with `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER`. Note: user may need to log out/in for group membership.

### 3b. Apple Container conversion gate (if needed)

**If the chosen runtime is Apple Container**, you MUST check whether the source code has already been converted from Docker to Apple Container. Do NOT skip this step. Run:

```bash
grep -q "CONTAINER_RUNTIME_BIN = 'container'" src/container-runtime.ts && echo "ALREADY_CONVERTED" || echo "NEEDS_CONVERSION"
```

**If NEEDS_CONVERSION**, the source code still uses Docker as the runtime. You MUST run the `/convert-to-apple-container` skill NOW, before proceeding to the build step.

**If ALREADY_CONVERTED**, the code already uses Apple Container. Continue to 3c.

**If the chosen runtime is Docker**, no conversion is needed — Docker is the default. Continue to 3c.

### 3c. Build and test

Run `npx tsx setup/index.ts --step container -- --runtime <chosen>` and parse the status block.

**If BUILD_OK=false:** Read `logs/setup.log` tail for the build error.
- Cache issue (stale layers): `docker builder prune -f` (Docker) or `container builder stop && container builder rm && container builder start` (Apple Container). Retry.
- Dockerfile syntax or missing files: diagnose from the log and fix, then retry.

**If TEST_OK=false but BUILD_OK=true:** The image built but won't run. Check logs — common cause is runtime not fully started. Wait a moment and retry the test.

## 4. Claude Authentication (No Script)

If HAS_ENV=true from step 2, read `.env` and check for `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `BEDROCK_MODEL_ID`. If present, confirm with user: keep or reconfigure?

AskUserQuestion: Authentication method?
- **AWS Bedrock** (recommended for this fork) - AWS credentials via IAM role or ~/.aws/credentials
- **Claude subscription** (Pro/Max) - OAuth token
- **Anthropic API key** - Direct API access

**Bedrock:** Ensure `.env` contains:
```
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0
```
AWS credentials will be loaded from environment (EC2 instance role, ~/.aws/credentials, etc.)

**Subscription:** Tell user to run `claude setup-token` in another terminal, copy the token, add `CLAUDE_CODE_OAUTH_TOKEN=<token>` to `.env`. Do NOT collect the token in chat.

**API key:** Tell user to add `ANTHROPIC_API_KEY=<key>` to `.env`.

---

## WhatsApp Flow (Steps 5-8)

Use these steps if WhatsApp was chosen in step 2.5. Skip to Telegram Flow if Telegram was chosen.

## 5. WhatsApp Authentication

If HAS_AUTH=true, confirm: keep or re-authenticate?

**Choose auth method based on environment (from step 2):**

If IS_HEADLESS=true AND IS_WSL=false → AskUserQuestion: Pairing code (recommended) vs QR code in terminal?
Otherwise (macOS, desktop Linux, or WSL) → AskUserQuestion: QR code in browser (recommended) vs pairing code vs QR code in terminal?

- **QR browser:** `npx tsx setup/index.ts --step whatsapp-auth -- --method qr-browser` (Bash timeout: 150000ms)
- **Pairing code:** Ask for phone number first. `npx tsx setup/index.ts --step whatsapp-auth -- --method pairing-code --phone NUMBER` (Bash timeout: 150000ms). Display PAIRING_CODE.
- **QR terminal:** `npx tsx setup/index.ts --step whatsapp-auth -- --method qr-terminal`. Tell user to run `npm run auth` in another terminal.

**If failed:** qr_timeout → re-run. logged_out → delete `store/auth/` and re-run. 515 → re-run. timeout → ask user, offer retry.

## 6. Configure Trigger and Channel Type

Get bot's WhatsApp number: `node -e "const c=require('./store/auth/creds.json');console.log(c.me.id.split(':')[0].split('@')[0])"`

AskUserQuestion: Shared number or dedicated? → AskUserQuestion: Trigger word? → AskUserQuestion: Main channel type?

**Shared number:** Self-chat (recommended) or Solo group
**Dedicated number:** DM with bot (recommended) or Solo group with bot

## 7. Sync and Select Group (If Group Channel)

**Personal chat:** JID = `NUMBER@s.whatsapp.net`
**DM with bot:** Ask for bot's number, JID = `NUMBER@s.whatsapp.net`

**Group:**
1. `npx tsx setup/index.ts --step groups` (Bash timeout: 60000ms)
2. BUILD=failed → fix TypeScript, re-run. GROUPS_IN_DB=0 → check logs.
3. `npx tsx setup/index.ts --step groups -- --list` for pipe-separated JID|name lines.
4. Present candidates as AskUserQuestion (names only, not JIDs).

## 8. Register Channel

Run `npx tsx setup/index.ts --step register -- --jid "JID" --name "main" --trigger "@TriggerWord" --folder "main"` plus `--no-trigger-required` if personal/DM/solo, `--assistant-name "Name"` if not Andy.

---

## Telegram Flow (Steps 5T-8T)

Use these steps if Telegram was chosen in step 2.5. Skip to step 9 after completing.

## 5T. Configure Telegram Bot

If TELEGRAM_BOT_TOKEN exists in `.env`, confirm: keep or reconfigure?

**To create a new bot:**
1. Tell user to message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow prompts to create a bot
3. BotFather will provide a token like `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`
4. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_ONLY=true
   ```

## 6T. Test Bot Connection

Build and start NanoClaw temporarily to test the bot:
```bash
npm run build
./start-nanoclaw.sh
```

Wait 5 seconds, then check logs:
```bash
tail -20 logs/nanoclaw.log
```

Look for:
- `✓ Bedrock authentication validated` (or other auth confirmation)
- `Telegram bot connected` with username
- `Telegram bot: @YourBotName`

If connection fails, check:
- Token is correct in `.env`
- No extra whitespace in token
- Bot hasn't been deleted by BotFather

## 7T. Get Chat ID

Tell user to:
1. Open Telegram and search for their bot (username shown in step 6T)
2. Start a chat with the bot
3. Send the command: `/chatid`
4. Bot will reply with: `Chat ID: tg:1234567890`

**Important:** For group chats, add the bot to the group first, then send `/chatid` in the group to get the group's chat ID.

Ask user for the chat ID (format: `tg:XXXXXXXXX`).

## 8T. Register Telegram Chat

AskUserQuestion: Trigger word for the bot? (e.g., "@Andy", "@Assistant")

AskUserQuestion: Chat name for logs? (e.g., "Main", "Personal")

Run registration:
```bash
npx tsx setup/index.ts --step register --jid "<CHAT_ID>" --name "<NAME>" --folder "main" --trigger "<TRIGGER>"
```

Examples:
- Private chat: `--jid "tg:174264531" --name "Main" --trigger "@Andy"`
- Group chat with trigger required: `--jid "tg:-1001234567890" --name "Family" --trigger "@Andy"`
- Group chat, always respond: add `--no-trigger-required`

**Stop the temporary NanoClaw instance:**
```bash
pkill -f "node.*dist/index.js"
```

## 9. Mount Allowlist

AskUserQuestion: Agent access to external directories?

**No:** `npx tsx setup/index.ts --step mounts -- --empty`
**Yes:** Collect paths/permissions. `npx tsx setup/index.ts --step mounts -- --json '{"allowedRoots":[...],"blockedPatterns":[],"nonMainReadOnly":true}'`

## 10. Start Service

If service already running: unload first.
- macOS: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`
- Linux: `systemctl --user stop nanoclaw` (or `systemctl stop nanoclaw` if root)

Run `npx tsx setup/index.ts --step service` and parse the status block.

**If FALLBACK=wsl_no_systemd:** WSL without systemd detected. Tell user they can either enable systemd in WSL (`echo -e "[boot]\nsystemd=true" | sudo tee /etc/wsl.conf` then restart WSL) or use the generated `start-nanoclaw.sh` wrapper.

**If DOCKER_GROUP_STALE=true:** The user was added to the docker group after their session started — the systemd service can't reach the Docker socket. Ask user to run these two commands:

1. Immediate fix: `sudo setfacl -m u:$(whoami):rw /var/run/docker.sock`
2. Persistent fix (re-applies after every Docker restart):
```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/socket-acl.conf << 'EOF'
[Service]
ExecStartPost=/usr/bin/setfacl -m u:USERNAME:rw /var/run/docker.sock
EOF
sudo systemctl daemon-reload
```
Replace `USERNAME` with the actual username (from `whoami`). Run the two `sudo` commands separately — the `tee` heredoc first, then `daemon-reload`. After user confirms setfacl ran, re-run the service step.

**If SERVICE_LOADED=false:**
- Read `logs/setup.log` for the error.
- macOS: check `launchctl list | grep nanoclaw`. If PID=`-` and status non-zero, read `logs/nanoclaw.error.log`.
- Linux: check `systemctl --user status nanoclaw`.
- Re-run the service step after fixing.

## 11. Verify

Run `npx tsx setup/index.ts --step verify` and parse the status block.

**If STATUS=failed, fix each:**
- SERVICE=stopped → `npm run build`, then restart: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw` (macOS) or `systemctl --user restart nanoclaw` (Linux) or `bash start-nanoclaw.sh` (WSL nohup)
- SERVICE=not_found → re-run step 10
- CREDENTIALS=missing → re-run step 4
- WHATSAPP_AUTH=not_found → re-run WhatsApp step 5 (if using WhatsApp)
- TELEGRAM_TOKEN=missing → check `.env` for TELEGRAM_BOT_TOKEN (if using Telegram)
- REGISTERED_GROUPS=0 → re-run channel registration (step 8 for WhatsApp or 8T for Telegram)
- MOUNT_ALLOWLIST=missing → `npx tsx setup/index.ts --step mounts -- --empty`

**Test the setup:**

For WhatsApp: Send a message in the registered chat with the trigger word.

For Telegram: Send a message to the bot with the trigger word (e.g., `@Andy hello`).

Monitor logs: `tail -f logs/nanoclaw.log`

Look for:
- Telegram: `Telegram message stored` or `Message from unregistered Telegram chat` (if registration failed)
- WhatsApp: Similar message processing logs
- Agent response being sent back

## Troubleshooting

**Service not starting:** Check `logs/nanoclaw.error.log`. Common: wrong Node path (re-run step 10), missing `.env` (step 4), missing auth (step 4 or WhatsApp step 5).

**Container agent fails ("Claude Code process exited with code 1"):** Ensure the container runtime is running — `open -a Docker` (macOS Docker), `container system start` (Apple Container), or `sudo systemctl start docker` (Linux). Check container logs in `groups/main/logs/container-*.log`.

**No response to messages:**
- Check logs for "Message from unregistered [platform] chat" → chat not registered, re-run registration
- Check trigger pattern matches what you're sending
- Verify chat ID is correct (Telegram: send `/chatid` again)
- Check DB: `npx tsx setup/index.ts --step verify`
- Monitor: `tail -f logs/nanoclaw.log`

**Telegram bot not responding:**
- Bot responds to `/chatid` and `/ping` but not other messages → chat not registered
- Bot doesn't respond at all → check token in `.env`, restart service
- "Message from unregistered Telegram chat" in logs → run Telegram step 8T
- Wrong chat ID → group IDs are negative (e.g., `tg:-1001234567890`), private chats are positive

**WhatsApp disconnected:** `npm run auth` then rebuild and restart: `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw` (macOS) or `systemctl --user restart nanoclaw` (Linux).

**Unload service:** macOS: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist` | Linux: `systemctl --user stop nanoclaw`
