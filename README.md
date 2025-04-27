# Wattson – Zeo Energy Discord Stats Bot

Tracks sets, closes, and scheduled installations for Zeo Energy via slash commands with role-based permissions.

---

## Features

*   **Slash Commands** for data entry:
    *   `/set customer_name: <name> [date: MM/DD|MM/DD/YY|YYYY-MM-DD] [bill_image: Attachment]` - Records a set (Setter, Closer, Manager, Admin).
    *   `/closed customer_name: <name> system_size: <kW> setter: @<user>` - Records a closed deal (Closer, Manager, Admin).
    *   `/install customer_name: <name> setter: @<user>` - Records a scheduled installation (Closer, Manager, Admin).
*   **Stats Dashboard** `/stats` – Returns daily/weekly/monthly stats and leaderboards (Setter, Closer, Manager, Admin).
*   **Database Export** `/export_db` - Dumps the database to a CSV file, sent via ephemeral message (Manager, Admin).
*   **Help Command** `/help` - Lists available commands (Setter, Closer, Manager, Admin).
*   **Role-Based Access Control** - Commands are restricted based on user roles defined in `utils/permissions.js`.
*   **Announcements** – Bot posts a confirmation message in the channel for each successful data entry.
*   **SQLite storage** – Self-contained `stats.db` (created on first run, excluded by `.gitignore`).
*   **Image Attachments** - Recognizes image attachments on `/set` to mark `has_bill`.

---

## Quick Start

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd wattson
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # Or: npm install discord.js sqlite3 dotenv luxon
    ```
3.  **Configure Roles:**
    *   Enable Developer Mode in Discord (User Settings > Advanced).
    *   Get the Role IDs for your Admin, Manager, Closer, and Setter roles (Right-click role > Copy Role ID).
    *   Edit `utils/permissions.js` and paste the correct IDs into the `Roles` object.
4.  **Create `.env` file:**
    Create a file named `.env` in the project root with your bot token:
    ```env
    DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
    
    # Optional: Override default DB file path
    # DB_FILE=./data/stats.db 
    ```
    *Note: The `.env` file is ignored by Git.*
5.  **Run the bot:**
    ```bash
    node index.js
    ```
    The bot will register the slash commands on startup.

---

## Discord Setup

1.  **Create a Bot Application:** Go to <https://discord.com/developers/applications>.
2.  **Bot Settings:**
    *   Navigate to the "Bot" page.
    *   Click "Reset Token" to generate a token, copy it, and paste it into your `.env` file as `DISCORD_TOKEN`.
    *   **Intents:** Enable the `SERVER MEMBERS INTENT` and `MESSAGE CONTENT INTENT` under "Privileged Gateway Intents". While not strictly needed for *all* commands, Member intent helps fetch user/role data reliably, and Message Content is often useful for future extensions.
3.  **OAuth2 URL Generator:**
    *   Navigate to "OAuth2" > "URL Generator".
    *   Select scopes: `bot` and `applications.commands`.
    *   Select Bot Permissions:
        *   `View Channels`
        *   `Send Messages`
        *   `Embed Links`
        *   `Attach Files` (Needed for `/export_db`)
        *   `Read Message History`
        *   *(Optional)* `Mention @everyone, @here, and All Roles`
4.  **Invite the Bot:** Copy the generated URL and use it to invite the bot to your server.

---

## Extending

*   **Refine `/stats`**: Add more date ranges, setter-specific stats, conversion rates.
*   **Error Handling**: More robust validation and user feedback.
*   **Configuration**: Allow server admins to configure target channels, roles via commands or a config file.
*   **Database Abstraction**: Move DB logic into a separate module (`utils/database.js`).
*   **Refactor Helpers**: Move shared logic (like DB helpers) into the `utils` directory.
*   **Google Sheets**: Swap the SQLite calls with Sheets API if/when desired.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details (or add the license text here).

---

Made with ☀️ by BitStorm Technologies