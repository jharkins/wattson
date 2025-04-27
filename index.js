// Wattson — Zeo Energy stats-tracker bot
// Refactored with command handler (Node 18+, discord.js v14)

require('dotenv').config();                     // read .env
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, MessageFlags, Collection, Events } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// ---------- config ----------------------------------------------------------
const TOKEN          = process.env.DISCORD_TOKEN;                 // Discord bot token
const CHANNEL_NAME   = process.env.SETS_CHANNEL || 'sets-and-closes'; // Keep for messageCreate for now
const DB_FILE        = process.env.DB_FILE || path.join(__dirname, 'stats.db');

const KEYWORDS = [
  { re: /set with bill/i,          type: 'set_with_bill' },
  { re: /set no bill/i,            type: 'set_no_bill'  },
  { re: /closed/i,                 type: 'closed'       },
  { re: /installation scheduled/i, type: 'install_sched'}
];

// ---------- database  -------------------------------------------------------
// TODO: Consider moving DB setup to its own module and potentially passing the
//       `db` instance to commands via interaction.client.db
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      user TEXT NOT NULL,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type_created ON events (type, created_at);`); // Add index
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);`);       // Add index

  // Add columns if they don't exist (for existing databases)
  db.exec(`ALTER TABLE events ADD COLUMN message_id TEXT`, () => {});
  db.exec(`ALTER TABLE events ADD COLUMN channel_id TEXT`, () => {});
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

// ---------- message listener (remains largely the same for now) -----------
client.on(Events.MessageCreate, async (msg) => { // Use Events enum
  if (msg.author.bot) return;                            // ignore bots

  // TODO: Implement GUILD_CONFIGS for channel names
  if (msg.channel.name?.toLowerCase() !== CHANNEL_NAME.toLowerCase()) return;

  console.log(`[MSG][${msg.guild?.name || 'DM'}] ${msg.author.tag}: ${msg.content}`);

  // keyword detection
  const hit = KEYWORDS.find(k => k.re.test(msg.content));
  if (!hit) return;

  // log + DB insert
  console.log(`→ matched keyword: ${hit.type}`);
  try {
    // Using a Promise wrapper for db.run to handle async/await and errors
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO events(type, user, message_id, channel_id) VALUES (?, ?, ?, ?)',
        [hit.type, msg.author.id, msg.id, msg.channel.id],
        function(err) { // Use function() to access `this` if needed, though not used here
          if (err) {
            console.error('DB Insert Error:', err.message);
            reject(err);
          } else {
            resolve();
          }
        });
    });
    // react ✅ only if DB insert succeeds
    await msg.react('✅');
  } catch (dbError) {
      // DB error already logged, maybe notify channel/user?
      try { await msg.react('❌'); } catch (_) { /* Ignore reaction error */ }
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
