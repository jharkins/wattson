const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { DateTime } = require('luxon'); // For timestamp in filename
const { PermissionLevels, checkPermission } = require('../utils/permissions.js'); // Require the permission checker

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

// --- User Fetching Helper ---
async function fetchUsernames(interaction, userIds) {
    const usernameMap = new Map();
    const uniqueIds = [...new Set(userIds.filter(id => id))]; // Filter out null/empty IDs

    console.log(`[ExportDB] Attempting to fetch usernames for ${uniqueIds.length} unique IDs.`);

    const fetchPromises = uniqueIds.map(async (id) => {
        try {
            // Prefer fetching guild member for display name, fallback to client user for tag
            const member = await interaction.guild?.members.fetch(id).catch(() => null);
            if (member) {
                usernameMap.set(id, member.displayName); 
            } else {
                const user = await interaction.client.users.fetch(id).catch(() => null);
                if (user) {
                    usernameMap.set(id, user.tag);
                } else {
                    usernameMap.set(id, '(Unknown User)');
                    console.warn(`[ExportDB] Could not fetch user/member for ID: ${id}`);
                }
            }
        } catch (error) {
            // Log specific errors if needed, but generally catch and mark as unknown
            console.error(`[ExportDB] Error fetching user ${id}:`, error.message);
            usernameMap.set(id, '(Error Fetching)');
        }
    });

    await Promise.all(fetchPromises);
    console.log(`[ExportDB] Finished fetching usernames. Found ${usernameMap.size} mappings.`);
    return usernameMap;
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

        try {
            // --- Fetch Data ---
            // Define explicit column order for CSV consistency
            const columns = [
                'id', 'type', 'user', 'message_id', 'channel_id', 'created_at', 
                'customer_name', 'set_date', 'has_bill', 'system_size', 'setter_id'
            ];
            const rows = await query(`SELECT ${columns.join(', ')} FROM events ORDER BY created_at ASC`);

            if (!rows || rows.length === 0) {
                return interaction.followUp({ content: 'Database is empty.', flags: MessageFlags.Ephemeral });
            }

            // --- Fetch Usernames ---
            const userIdsToFetch = rows.flatMap(row => [row.user, row.setter_id]);
            const usernameMap = await fetchUsernames(interaction, userIdsToFetch);

            // --- Convert to CSV --- 
            // Define CSV columns, including new username columns
            const csvColumns = [
                'id', 'type', 'user', 'user_name', 'message_id', 'channel_id', 'created_at',
                'customer_name', 'set_date', 'has_bill', 'system_size', 'setter_id', 'setter_name'
            ];
            const headerRow = csvColumns.map(escapeCsvValue).join(',');

            const dataRows = rows.map(row => {
                return csvColumns.map(col => {
                    let value;
                    switch (col) {
                        case 'user_name':
                            value = usernameMap.get(row.user) || ''; // Get username from map
                            break;
                        case 'setter_name':
                            value = usernameMap.get(row.setter_id) || ''; // Get setter name from map
                            break;
                        case 'has_bill':
                            value = row[col] ? 1 : 0; // Convert boolean
                            break;
                        default:
                            value = row[col]; // Get value from DB row
                            break;
                    }
                    return escapeCsvValue(value);
                }).join(',');
            });

            const csvString = [headerRow, ...dataRows].join('\n');

            // --- Create Attachment ---
            const timestamp = DateTime.now().toFormat('yyyyMMdd_HHmmss');
            const filename = `wattson_export_${timestamp}.csv`;
            const attachment = new AttachmentBuilder(Buffer.from(csvString), { name: filename });

            // --- Send Ephemeral Reply ---
            await interaction.followUp({
                content: '📊 Here is the database export (with usernames):',
                files: [attachment],
                flags: MessageFlags.Ephemeral
            });
            console.log(`[ExportDB] Sent CSV export with usernames to ${interaction.user.tag}`);

        } catch (error) {
            console.error('[ExportDB] Error executing command:', error);
            await interaction.followUp({
                content: '❌ An error occurred while generating the database export.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};  