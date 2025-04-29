const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { PermissionLevels, checkPermission } = require('../utils/permissions.js'); // Require the permission checker

// --- Role IDs for Permissions ---
const ADMIN_ROLE_ID = '1365873523393822811';
const MANAGER_ROLE_ID = '1365387565464555673';
const CLOSER_ROLE_ID = '1365381444511338516';
const ALLOWED_ROLES = [ADMIN_ROLE_ID, MANAGER_ROLE_ID, CLOSER_ROLE_ID];

// Database setup (consider moving to a shared module)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'stats.db');
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error('[InstallCmd] Error opening database:', err.message);
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
        // --- Permission Check (Refactored) ---
        if (!checkPermission(interaction.member, PermissionLevels.CanCloseOrInstall)) { // Use the checkPermission function
            console.log(`[Install] Denied access for user ${interaction.user.tag} (${interaction.user.id}) - Missing required role.`);
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        console.log(`[Install] Authorized access for user ${interaction.user.tag}`);

        const customerName = interaction.options.getString('customer_name');
        const setterUser = interaction.options.getUser('setter');
        const user = interaction.user; // The user who ran the command
        const channel = interaction.channel;

        let insertedRowId = null;

        try {
            // Step 1: Insert event, get row ID
            const insertResult = await run(
                `INSERT INTO events (type, user, channel_id, customer_name, setter_id)
                 VALUES (?, ?, ?, ?, ?)`,
                ['install_sched', user.id, channel.id, customerName, setterUser.id]
            );
            insertedRowId = insertResult.lastID;
            console.log(`[CMD][Install] Inserted row ID: ${insertedRowId}`);

            // Step 2: Prepare and send embed
            const embed = new EmbedBuilder()
                .setColor(0x3498DB) // Blue
                .setTitle('✨ Installation Scheduled!')
                .setDescription(`${user} just scheduled an installation for a deal set by ${setterUser}! 🎉`)
                .addFields(
                    { name: 'Customer', value: customerName, inline: true },
                    { name: 'Original Setter', value: setterUser.toString(), inline: true } // Use toString() to get mention
                )
                .setTimestamp();

            // Send reply first
            await interaction.reply({ embeds: [embed] });
            // Then fetch the Message object
            const replyMessage = await interaction.fetchReply();
            const replyMessageId = replyMessage.id;
            console.log(`[CMD][Install] Reply message ID: ${replyMessageId}`);

            // Step 3: Update DB with message ID
            await run(
                `UPDATE events SET message_id = ? WHERE id = ?`,
                [replyMessageId, insertedRowId]
            );
            console.log(`[CMD][Install] Updated row ID ${insertedRowId} with message ID ${replyMessageId}`);

        } catch (error) {
            console.error('Error executing /install command:', error);
            if (insertedRowId) {
                console.warn(`[CMD][Install] Error occurred after inserting row ID ${insertedRowId}.`);
            }
            // Send ephemeral error
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while recording this installation schedule.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'There was an error while recording this installation schedule.', flags: MessageFlags.Ephemeral });
            }
        }
    },
}; 