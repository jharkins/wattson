const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

// Database setup (consider moving to a shared module)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'stats.db');
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error('Error opening database for closed command:', err.message);
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
        .setName('closed')
        .setDescription('Records a closed deal.')
        .addStringOption(option =>
            option.setName('customer_name')
                .setDescription('The name of the customer.')
                .setRequired(true))
        .addNumberOption(option => // Use Number for system size (allows decimals)
            option.setName('system_size')
                .setDescription('System size in kW (e.g., 8.5).')
                .setRequired(true))
        .addUserOption(option => // Use User option type
            option.setName('setter')
                .setDescription('The user who set the appointment.')
                .setRequired(true)),

    async execute(interaction) {
        const customerName = interaction.options.getString('customer_name');
        const systemSize = interaction.options.getNumber('system_size');
        const setterUser = interaction.options.getUser('setter');
        const user = interaction.user; // The user who ran the command (the closer)
        const channel = interaction.channel;

        try {
            await run(
                `INSERT INTO events (type, user, channel_id, customer_name, system_size, setter_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['closed', user.id, channel.id, customerName, systemSize, setterUser.id]
            );

            console.log(`[CMD][Closed] ${user.tag} recorded close for ${customerName} (Setter: ${setterUser.tag}, Size: ${systemSize}kW)`);

            const embed = new EmbedBuilder()
                .setColor(0xED4245) // Red
                .setTitle('💣 Deal Closed!')
                .setDescription(`${user} just closed a deal set by ${setterUser}! 🥳`)
                .addFields(
                    { name: 'Customer', value: customerName, inline: true },
                    { name: 'System Size', value: `${systemSize} kW`, inline: true },
                    { name: 'Setter', value: setterUser.toString(), inline: true } // Use toString() to get mention
                )
                .setTimestamp();

            // Send confirmation to the channel
            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error executing /closed command:', error);
            // Use flags for ephemeral reply
            await interaction.reply({ content: 'There was an error while recording this closed deal.', flags: MessageFlags.Ephemeral });
        }
    },
}; 