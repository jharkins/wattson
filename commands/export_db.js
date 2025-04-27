const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { DateTime } = require('luxon'); // For timestamp in filename

// --- Config --- 
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'stats.db');
// Read allowed user IDs from .env, split by comma, trim whitespace
const ALLOWED_USER_IDS = (process.env.ALLOWED_DUMP_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id); // Remove empty strings

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

// --- Command --- 
module.exports = {
    data: new SlashCommandBuilder()
        .setName('export_db')
        .setDescription('Exports the events database to a CSV file (Restricted Access).'),

    async execute(interaction) {
        // --- Permission Check ---
        if (!ALLOWED_USER_IDS.includes(interaction.user.id)) {
            console.log(`[ExportDB] Denied access for user ${interaction.user.tag} (${interaction.user.id})`);
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        console.log(`[ExportDB] Authorized access for user ${interaction.user.tag}`);
        await interaction.deferReply({ ephemeral: true }); // Defer for potentially longer processing

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

            // --- Convert to CSV --- 
            const headerRow = columns.map(escapeCsvValue).join(',');
            
            const dataRows = rows.map(row => {
                return columns.map(col => {
                    let value = row[col];
                    // Convert boolean to 1/0 for CSV
                    if (typeof value === 'boolean') {
                        value = value ? 1 : 0;
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
                content: '📊 Here is the database export:',
                files: [attachment],
                flags: MessageFlags.Ephemeral
            });
            console.log(`[ExportDB] Sent CSV export to ${interaction.user.tag}`);

        } catch (error) {
            console.error('[ExportDB] Error executing command:', error);
            await interaction.followUp({ 
                content: '❌ An error occurred while generating the database export.',
                flags: MessageFlags.Ephemeral 
            });
        }
    },
};  