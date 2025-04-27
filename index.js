// Wattson — Zeo Energy stats-tracker bot
// Refactored with command handler (Node 18+, discord.js v14)

require('dotenv').config();                     // read .env
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, MessageFlags, Collection, Events } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// ---------- config ----------------------------------------------------------
const TOKEN          = process.env.DISCORD_TOKEN;                 // Discord bot token
// REMOVE: const CHANNEL_NAME   = process.env.SETS_CHANNEL || 'sets-and-closes'; // Keep for messageCreate for now
const DB_FILE        = process.env.DB_FILE || path.join(__dirname, 'data', 'stats.db'); // Default to data/stats.db

// ---------- database  -------------------------------------------------------
// TODO: Consider moving DB setup to its own module and potentially passing the
//       `db` instance to commands via interaction.client.db
const db = new sqlite3.Database(DB_FILE, (err) => { // Add error handling for initial connection
    if (err) {
        console.error('[DB Init] Error opening database:', DB_FILE, err.message);
        process.exit(1); // Exit if DB can't be opened
    } else {
        console.log('[DB Init] Successfully connected to database:', DB_FILE);
    }
});
db.serialize(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,                      -- 'set', 'closed', 'install_sched'
      user TEXT NOT NULL,                      -- User ID of the person who ran the command
      message_id TEXT,                         -- Message ID of the announcement message (optional)
      channel_id TEXT,                         -- Channel ID where command was run
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Timestamp of the event logging
      customer_name TEXT,
      set_date DATE,                           -- Date the 'set' occurred (YYYY-MM-DD)
      has_bill BOOLEAN,
      system_size REAL,                        -- System size in kW for 'closed'
      setter_id TEXT                           -- User ID of the setter for 'closed' and 'install_sched'
    );
  `);
  // Indices
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type_created ON events (type, created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type_set_date ON events (type, set_date);`); // Index for set date
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_setter_id ON events (setter_id);`);         // Index for setter

  // Add columns if they don't exist (for existing databases)
  // Note: ALTER TABLE ADD COLUMN might fail silently if column exists in some sqlite versions,
  // or throw an error in others. Wrapping in exec with empty callback handles common cases.
  db.exec(`ALTER TABLE events ADD COLUMN customer_name TEXT`, () => {});
  db.exec(`ALTER TABLE events ADD COLUMN set_date DATE`, () => {});
  db.exec(`ALTER TABLE events ADD COLUMN has_bill BOOLEAN`, () => {});
  db.exec(`ALTER TABLE events ADD COLUMN system_size REAL`, () => {});
  db.exec(`ALTER TABLE events ADD COLUMN setter_id TEXT`, () => {});
  // REMOVE: db.exec(`ALTER TABLE events ADD COLUMN message_id TEXT`, () => {}); // Keep message_id if needed? Let's keep it.
  // REMOVE: db.exec(`ALTER TABLE events ADD COLUMN channel_id TEXT`, () => {}); // Keep channel_id
});

// ---------- discord client --------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent  // must be enabled in Dev Portal
  ],
  partials: [Partials.Channel]
});

// --- Command Loading --- (from discord.js guide)
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

// Check if commands directory exists
if (!fs.existsSync(commandsPath)) {
    console.error(`Error: 'commands' directory not found at ${commandsPath}`);
    console.error('Please create the \'commands\' directory and place command files inside.');
    process.exit(1); // Exit if commands dir is missing
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[LOADED] Command: /${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}


// --- Ready Event (registers commands) ---
client.once(Events.ClientReady, async () => { // Use Events enum
  console.log(`🤖  Logged in as ${client.user.tag}`);
  console.log(` guilds: ${client.guilds.cache.size}`);

  // --- Gather command data for registration ---
  const commandsToRegister = client.commands.map(cmd => cmd.data.toJSON());

  // --- Register commands in each guild ---
  const registrationPromises = client.guilds.cache.map(async (guild) => {
    try {
      // Use set method with the array of command data
      await guild.commands.set(commandsToRegister);
      console.log(`✅ Commands registered/updated in guild: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error(`❌ Failed to register commands in guild: ${guild.name} (${guild.id})`, error);
    }
  });

  try {
    await Promise.all(registrationPromises);
    console.log('✅ Finished registering/updating guild commands.');
  } catch (error) {
      console.error('❌ Error during bulk command registration:', error);
  }
});

// ---------- Interaction Handler (Command Execution) -----------
client.on(Events.InteractionCreate, async interaction => { // Use Events enum
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        // Send ephemeral error to user
        try {
            // Use flags for ephemeral reply
            await interaction.reply({ content: `Error: Command \"/${interaction.commandName}\" not found!`, flags: MessageFlags.Ephemeral });
        } catch (replyError) {
            console.error('Error sending command-not-found reply:', replyError);
        }
        return;
    }

    console.log(`[CMD][${interaction.guild?.name || 'DM'}] ${interaction.user.tag}: /${interaction.commandName}`);

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing /${interaction.commandName}:`, error);
        // Inform user of error (using followUp if needed)
        if (interaction.replied || interaction.deferred) {
            // Use flags for ephemeral followUp
            await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        } else {
            // Use flags for ephemeral reply
            await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        }
    }
});

// ---------- fire it up ------------------------------------------------------
client.login(TOKEN);
