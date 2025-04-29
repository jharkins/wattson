# Wattson – Zeo Energy Discord Stats Bot

Tracks sets, closes, and scheduled installations for Zeo Energy via slash commands with role-based permissions. Designed to be run in a Docker container.

---

## Features

*   **Slash Commands** for data entry:
    *   `/set customer_name: <name> [date: MM/DD|MM/DD/YY|YYYY-MM-DD] [bill_image: Attachment]` - Records a set (Setter, Closer, Manager, Admin).
    *   `/closed customer_name: <name> system_size: <kW> setter: @<user>` - Records a closed deal (Closer, Manager, Admin).
    *   `/install customer_name: <name> setter: @<user>` - Records a scheduled installation (Closer, Manager, Admin).
*   **Stats Dashboard** `/stats` – Returns daily/weekly/monthly stats and leaderboards (Setter, Closer, Manager, Admin).
*   **Database Export** `/export_db` - Exports the database (with usernames) to a CSV file, sent via ephemeral message (Manager, Admin).
*   **Help Command** `/help` - Lists available commands (Setter, Closer, Manager, Admin).
*   **Role-Based Access Control** - Commands are restricted based on user roles defined in `utils/permissions.js`.
*   **Announcements** – Bot posts a confirmation message in the channel for each successful data entry.
*   **SQLite storage** – Self-contained `stats.db` stored in the `data/` directory (created on first run, excluded by `.gitignore`).
*   **Image Attachments** - Recognizes image attachments on `/set` to mark `has_bill`.
*   **Dockerized** - Includes `Dockerfile` and `.dockerignore` for containerized deployment.

---

## Quick Start (Manual Node.js)

This method is suitable for local development or testing.

1.  **Clone:** `git clone <repository-url> && cd wattson`
2.  **Install:** `npm install` (Installs `discord.js`, `sqlite3`, `dotenv`, `luxon`)
3.  **Configure Roles:** Edit `utils/permissions.js` with your server's Role IDs (Get IDs via Discord Developer Mode).
4.  **Create `data` Directory:** `mkdir data`
5.  **(Optional) Move Existing DB:** If you have an existing `stats.db`, move it: `mv stats.db data/`
6.  **Create `.env` file:**
    ```env
    DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
    # Specify the database path (recommended)
    DB_FILE=./data/stats.db
    ```
7.  **Run:** `node index.js`

---

## Deployment (Docker - Recommended)

1.  **Prerequisites:** Docker installed on your server.
2.  **Clone:** `git clone <repository-url> && cd wattson`
3.  **Configure Roles:** Edit `utils/permissions.js` with your server's Role IDs.
4.  **Create `data` Directory:** `mkdir data` (The database file `stats.db` will be created here by the bot if it doesn't exist).
5.  **Create `.env` file:** (Same as Quick Start step 6)
    ```env
    DISCORD_TOKEN=YOUR_DISCORD_BOT_TOKEN
    DB_FILE=./data/stats.db
    ```
6.  **Build Docker Image:**
    ```bash
    docker build -t wattson-bot .
    ```
7.  **Run Docker Container:**
    ```bash
    docker run -d \
      --name wattson \
      --restart=unless-stopped \
      --env-file ./.env \
      -v $(pwd)/data:/usr/src/app/data \
      wattson-bot
    ```
    *   `-d`: Detached mode (runs in background).
    *   `--name wattson`: Assigns a name to the container.
    *   `--restart=unless-stopped`: Ensures the bot restarts automatically.
    *   `--env-file ./.env`: Securely passes your token to the container.
    *   `-v $(pwd)/data:/usr/src/app/data`: **Crucial:** Mounts the `data` directory (containing `stats.db`) from your host into the container, ensuring data persistence.

### Docker Management

*   View logs: `docker logs wattson` (Use `-f` to follow)
*   Stop: `docker stop wattson`
*   Start: `docker start wattson`
*   Remove container (after stopping): `docker rm wattson`
*   Update: Pull changes, rebuild image (`docker build ...`), stop/remove old container, run new container.

---

## Developer Notes

### Project Structure

*   **`index.js`**: Main entry point. Initializes the Discord client, loads commands, sets up the database connection, registers commands, and starts the bot.
*   **`commands/`**: Contains individual JavaScript files for each slash command (`set.js`, `stats.js`, etc.). Each file exports a `data` object (command definition) and an `execute` function (command logic).
*   **`utils/`**: Contains shared utility modules.
    *   `permissions.js`: Defines role IDs, permission levels, and the `checkPermission` function used by commands.
*   **`data/`**: Stores persistent data. By default, contains `stats.db`. This directory **must exist** and is mounted into the Docker container.
*   **`.env`**: Stores environment variables, primarily `DISCORD_TOKEN` and optionally `DB_FILE`. **Crucially important, must not be committed to Git.**
*   **`Dockerfile`**: Defines the Docker image build process.
*   **`.dockerignore`**: Specifies files/directories to exclude from the Docker image.
*   **`.gitignore`**: Specifies files/directories to exclude from Git tracking.
*   **`package.json` / `package-lock.json`**: Node.js project and dependency management.

### Key Concepts & Notes

*   **Permissions:** Command access is controlled by checking user roles against predefined levels in `utils/permissions.js`. Ensure the Role IDs in this file are correct for your target server.
*   **Environment Variables:** The bot relies heavily on the `DISCORD_TOKEN` environment variable set in the `.env` file. When running via Docker, this file is passed using the `--env-file` flag.
*   **Database:** An SQLite database (`stats.db` located in the `data/` directory) is used for persistence. This file is created automatically if it doesn't exist. For Docker deployments, the `data/` directory is mounted as a volume (`-v`) to ensure data isn't lost when the container is replaced.
*   **Dependencies:** Key dependencies include `discord.js` (v14+), `sqlite3`, `dotenv`, and `luxon`.
*   **Command Loading:** Commands are loaded dynamically from the `commands/` directory in `index.js`.
*   **Error Handling:** Basic error handling is implemented (logging to console, sending ephemeral replies), but could be enhanced.
*   **Async/Await:** The codebase uses `async/await` extensively due to the asynchronous nature of Discord interactions and database queries.

---

## Discord Setup

1.  **Create a Bot Application:** Go to <https://discord.com/developers/applications>.
2.  **Bot Settings:**
    *   Navigate to the "Bot" page.
    *   Click "Reset Token" to generate a token, copy it, and paste it into your `.env` file as `DISCORD_TOKEN`.
    *   **Intents:** Enable the `SERVER MEMBERS INTENT` and `MESSAGE CONTENT INTENT` under "Privileged Gateway Intents".
3.  **OAuth2 URL Generator:**
    *   Navigate to "OAuth2" > "URL Generator".
    *   Select scopes: `bot` and `applications.commands`.
    *   Select Bot Permissions:
        *   `View Channels`, `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`
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