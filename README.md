# Wattson – Zeo Energy Discord Stats Bot

Tracks sets, closes, and scheduled installations for Zeo Energy via slash commands.

---

## Features
* **Slash Commands** for data entry:
    * `/set customer_name: <name> bill: <yes/no> [date: YYYY-MM-DD]`
    * `/closed customer_name: <name> system_size: <kW> setter: @<user>`
    * `/install customer_name: <name> setter: @<user>`
* **Announcements** – Bot posts a confirmation message in the channel for each command.
* **SQLite storage** – self-contained `stats.db` (created on first run).
* **Stats Dashboard** `/stats` – returns daily sets, weekly/monthly closes/installs, and a daily leaderboard.

---

## Quick start

```bash
git clone <repo>
cd wattson
npm install discord.js sqlite3 dotenv
```

Create a `.env` file:

```env
DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
# DB_FILE=stats.db                # optional override
```

Run it:

```bash
node index.js
```

Bot will register commands on startup.

---

## Discord setup

1. **Create an application** in <https://discord.com/developers/applications>.
2. Under **Bot**:
   * Copy the **Token** and put it in your `.env` file as `DISCORD_TOKEN`.
   * *Privileged Gateway Intents* → **MESSAGE CONTENT** intent might still be needed depending on other bot functionalities or future plans, but is not strictly required *for these specific slash commands*. Keep it enabled if unsure or if other message-reading features might be added.
3. Under **OAuth2 → URL Generator**:
   * Scopes: `bot` and `applications.commands`.
   * Bot Permissions:
     * View Channels
     * Send Messages
     * Embed Links
     * Read Message History (Needed for fetching user info like names/avatars potentially, and if message content intent is used)
     * Mention @everyone, @here, and All Roles (if you want the announcements to potentially ping roles, though current implementation only pings users)
4. Copy the generated **Invite URL** and add the bot to your server.
   * Example Invite URL (Adjust permissions as needed):
     <https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025467456&scope=bot%20applications.commands>
     *(Replace YOUR_CLIENT_ID)*

---

## Extending
* **Refine `/stats`** – Add more date ranges, setter-specific stats, conversion rates.
* **Error Handling** – More robust validation and user feedback.
* **Configuration** – Allow server admins to configure target channels, roles, etc.
* **Database Abstraction** – Move DB logic into a separate module.
* **Google Sheets** – Swap the SQLite calls with Sheets API if/when desired.

---

Made with ☀️ by BitStorm Technologies