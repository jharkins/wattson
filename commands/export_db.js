const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { DateTime } = require('luxon'); // For timestamp in filename
const { PermissionLevels, checkPermission } = require('../utils/permissions.js'); // Require the permission checker
const { fetchUsernames } = require('../utils/user_utils.js'); // Import from new location

// --- Config --- 
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'stats.db');
// REMOVE: const ALLOWED_USER_IDS = ...

// --- Role IDs for Permissions ---
const ADMIN_ROLE_ID = '1365873523393822811';
const MANAGER_ROLE_ID = '1365387565464555673';
const ALLOWED_ROLES = [ADMIN_ROLE_ID, MANAGER_ROLE_ID];

// --- Database Helper --- (Consider moving to shared module)
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY, (err) => {
    if (err) console.error('[ExportDB] Error opening database:', err.message);
});
const query = (sql, params = []) => new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows)))
);

// --- CSV Helper --- 
// Basic CSV value escaping (handles commas and quotes)
const escapeCsvValue = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    const stringValue = String(value);
    // If value contains comma, newline, or double quote, enclose in double quotes
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        // Escape existing double quotes by doubling them
        return `\"${stringValue.replace(/"/g, '\"\"')}\"`;
    }
    return stringValue;
};

/**
 * Generates the database export data as a CSV AttachmentBuilder object.
 * @param {import('discord.js').CommandInteraction | import('discord.js').ButtonInteraction} interaction - The interaction object (used for fetching usernames).
 * @returns {Promise<{attachment: import('discord.js').AttachmentBuilder | null, error: Error | null}>} - An object containing the attachment or an error.
 */
async function generateExportData(interaction) {
    try {
        // --- Fetch Data ---
        const dbColumns = [
            'id', 'type', 'user', 'message_id', 'channel_id', 'created_at',
            'customer_name', 'set_date', 'has_bill', 'system_size', 'setter_id'
        ];
        const rows = await query(`SELECT ${dbColumns.join(', ')} FROM events ORDER BY id ASC`); // Order by ID asc

        if (!rows || rows.length === 0) {
             console.log('[ExportDB:Generate] Database is empty.');
            // Return a specific indicator or error maybe?
            return { attachment: null, error: new Error('Database is empty.') }; 
        }

        // --- Fetch Usernames ---
        const userIdsToFetch = rows.flatMap(row => [row.user, row.setter_id]);
        const usernameMap = await fetchUsernames(interaction, userIdsToFetch);

        // --- Convert to CSV ---
        const csvColumns = [
            'id', 'type', 'user', 'user_name', 'message_id', 'channel_id', 'created_at',
            'customer_name', 'set_date', 'has_bill', 'system_size', 'setter_id', 'setter_name'
        ];
        const headerRow = csvColumns.map(escapeCsvValue).join(',');
        const dataRows = rows.map(row => {
            return csvColumns.map(col => {
                let value;
                switch (col) {
                    case 'user_name': value = usernameMap.get(row.user) || ''; break;
                    case 'setter_name': value = usernameMap.get(row.setter_id) || ''; break;
                    case 'has_bill': value = row[col] ? 1 : 0; break;
                    default: value = row[col]; break;
                }
                return escapeCsvValue(value);
            }).join(',');
        });
        const csvString = [headerRow, ...dataRows].join('\n');

        // --- Create Attachment ---
        const timestamp = DateTime.now().toFormat('yyyyMMdd_HHmmss');
        const filename = `wattson_export_${timestamp}.csv`;
        const attachment = new AttachmentBuilder(Buffer.from(csvString), { name: filename });

        console.log(`[ExportDB:Generate] Successfully generated CSV data.`);
        return { attachment, error: null };

    } catch (error) {
        console.error('[ExportDB:Generate] Error generating export data:', error);
        return { attachment: null, error };
    }
}

// --- Command --- 
module.exports = {
    data: new SlashCommandBuilder()
        .setName('export_db')
        .setDescription('Exports the events database to a CSV file (Restricted Access).'),

    async execute(interaction) {
        // --- Permission Check (Refactored) ---
        if (!checkPermission(interaction.member, PermissionLevels.CanExport)) { // Use the checkPermission function
            console.log(`[ExportDB] Denied access for user ${interaction.user.tag} (${interaction.user.id}) - Missing required role.`);
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        // REMOVE: Old User ID permission check logic

        console.log(`[ExportDB] Authorized access for user ${interaction.user.tag} via role.`);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const { attachment, error } = await generateExportData(interaction);

        if (attachment) {
            await interaction.followUp({
                content: '📊 Here is the database export (with usernames):',
                files: [attachment],
                flags: MessageFlags.Ephemeral
            });
            console.log(`[ExportDB] Sent CSV export to ${interaction.user.tag}`);
        } else {
            let errorMessage = '❌ An error occurred while generating the database export.';
            if (error && error.message === 'Database is empty.') {
                 errorMessage = 'ℹ️ The database is currently empty. Nothing to export.';
            }
            await interaction.followUp({
                content: errorMessage,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    // Export the helper function for use in other commands
    generateExportData 
};  