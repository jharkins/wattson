# Wattson – Zeo Energy Discord Stats Bot

Tracks “Set with bill / Set no bill / Closed / Installation scheduled” messages in the **#sets-and-closes** channel and serves instant stats via `/stats`.

---

## Features
* **Keyword capture** – case-insensitive match on the four phrases.
* **SQLite storage** – self-contained `stats.db` (created on first run).
* **Reaction feedback** – bot drops a ✅ when it logs an event.
* **Slash command** `/stats` – returns daily, weekly, monthly tallies in an embed.

---

## Quick start

```bash
git clone <repo>
cd wattson
npm install discord.js sqlite3 dotenv
```

Create a `.env` file:

```env
BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN
SETS_CHANNEL=sets-and-closes    # optional override
DB_FILE=stats.db                # optional override
```

Run it:

```bash
node index.js
```

---

## Discord setup

1. **Create an application** in <https://discord.com/developers/applications>.  
2. Under **Bot**  
   * *Privileged Gateway Intents* → enable **MESSAGE CONTENT**.  
3. Under **OAuth2 → URL Generator**  
   * Scopes: `bot` and `applications.commands`  
   * Permissions:  
     * View Channels  
     * Send Messages  
     * Embed Links  
     * Read Message History  
4. Copy the invite URL, add the bot to your **Black Diamond** server.
5. Invite URL: <https://discord.com/oauth2/authorize?client_id=1365812557721374730&permissions=380104854528&integration_type=0&scope=bot+applications.commands>

---

## Extending
* **Persist more data** – add columns (e.g., system size).  
* **Cron summaries** – integrate `node-cron` to auto-post hourly summaries.  
* **Google Sheets** – swap the SQLite calls with Sheets API if/when desired.

---

Made with ☀️ by BitStorm Technologies