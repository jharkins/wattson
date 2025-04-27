const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

// Database setup (consider moving to a shared module)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'stats.db');
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error('Error opening database for install command:', err.message);
});

// Helper to run DB queries with promises
const run = (sql, params = []) => new Promise((res, rej) =>
    db.run(sql, params, function (err) {
        if (err) rej(err);
        else res(this);
    })
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('install')
        .setDescription('Records a scheduled installation.')
        .addStringOption(option =>
            option.setName('customer_name')
                .setDescription('The name of the customer.')
                .setRequired(true))
        .addUserOption(option => // Use User option type
            option.setName('setter')
                .setDescription('The user who set the original appointment.')
                .setRequired(true)),

    async execute(interaction) {
        const customerName = interaction.options.getString('customer_name');
        const setterUser = interaction.options.getUser('setter');
        const user = interaction.user; // The user who ran the command
        const channel = interaction.channel;

        try {
            await run(
                `INSERT INTO events (type, user, channel_id, customer_name, setter_id)
                 VALUES (?, ?, ?, ?, ?)`,
                ['install_sched', user.id, channel.id, customerName, setterUser.id]
            );

            console.log(`[CMD][Install] ${user.tag} scheduled install for ${customerName} (Setter: ${setterUser.tag})`);

            const embed = new EmbedBuilder()
                .setColor(0x3498DB) // Blue
                .setTitle('✨ Installation Scheduled!')
                .setDescription(`${user} just scheduled an installation for a deal set by ${setterUser}! 🎉`)
                .addFields(
                    { name: 'Customer', value: customerName, inline: true },
                    { name: 'Original Setter', value: setterUser.toString(), inline: true } // Use toString() to get mention
                )
                .setTimestamp();

            // Send confirmation to the channel
            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error executing /install command:', error);
            // Use flags for ephemeral reply
            await interaction.reply({ content: 'There was an error while recording this installation schedule.', flags: MessageFlags.Ephemeral });
        }
    },
}; 