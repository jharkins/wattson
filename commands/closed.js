const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { PermissionLevels, checkPermission } = require('../utils/permissions.js'); // Require the permission checker

// --- Database setup ---
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'stats.db');
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error('[ClosedCmd] Error opening database:', err.message);
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
        // --- Permission Check (Refactored) ---
        if (!checkPermission(interaction.member, PermissionLevels.CanCloseOrInstall)) { // Use the checkPermission function
            console.log(`[Closed] Denied access for user ${interaction.user.tag} (${interaction.user.id}) - Missing required role.`);
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        console.log(`[Closed] Authorized access for user ${interaction.user.tag}`);

        const customerName = interaction.options.getString('customer_name');
        const systemSize = interaction.options.getNumber('system_size');
        const setterUser = interaction.options.getUser('setter');
        const user = interaction.user; // The user who ran the command (the closer)
        const channel = interaction.channel;
        
        let insertedRowId = null;

        try {
            // Step 1: Insert event, get row ID
            const insertResult = await run(
                `INSERT INTO events (type, user, channel_id, customer_name, system_size, setter_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['closed', user.id, channel.id, customerName, systemSize, setterUser.id]
            );
            insertedRowId = insertResult.lastID;
            console.log(`[CMD][Closed] Inserted row ID: ${insertedRowId}`);

            // Step 2: Prepare and send embed
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

            // Send reply and fetch Message object
            const replyMessage = await interaction.reply({ embeds: [embed], fetchReply: true });
            const replyMessageId = replyMessage.id;
            console.log(`[CMD][Closed] Reply message ID: ${replyMessageId}`);

            // Step 3: Update DB with message ID
            await run(
                `UPDATE events SET message_id = ? WHERE id = ?`,
                [replyMessageId, insertedRowId]
            );
            console.log(`[CMD][Closed] Updated row ID ${insertedRowId} with message ID ${replyMessageId}`);

        } catch (error) {
            console.error('Error executing /closed command:', error);
            if (insertedRowId) {
                 console.warn(`[CMD][Closed] Error occurred after inserting row ID ${insertedRowId}.`);
            }
            // Send ephemeral error
            if (interaction.replied || interaction.deferred) {
                 await interaction.followUp({ content: 'There was an error while recording this closed deal.', flags: MessageFlags.Ephemeral });
            } else {
                 await interaction.reply({ content: 'There was an error while recording this closed deal.', flags: MessageFlags.Ephemeral });
            }
        }
    },
}; 