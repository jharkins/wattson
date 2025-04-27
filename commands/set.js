const { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { DateTime } = require('luxon'); // Require luxon

// Database setup (consider moving to a shared module)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'stats.db');
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error('Error opening database for set command:', err.message);
});

// Helper to run DB queries with promises
const run = (sql, params = []) => new Promise((res, rej) =>
    db.run(sql, params, function (err) { // Use function() to access this.lastID if needed
        if (err) rej(err);
        else res(this); // Resolve with the statement object
    })
);

// --- Date Parsing Logic using Luxon --- 

/**
 * Parses MM/DD or MM/DD/YY (and variations like M/D or M/D/YY) into YYYY-MM-DD.
 * Assumes current year for MM/DD.
 * Returns YYYY-MM-DD string or null if invalid.
 */
const parseDateInputLuxon = (dateString) => {
    if (!dateString) return null;

    let dt;

    // Try MM/DD/YY (or M/D/YY etc.) first
    dt = DateTime.fromFormat(dateString, 'M/d/yy');

    if (!dt.isValid) {
        // Try MM/DD (or M/D etc.), assuming current year
        dt = DateTime.fromFormat(dateString, 'M/d');
        if (dt.isValid) {
            // Set the year to the current year explicitly
            dt = dt.set({ year: DateTime.now().year });
            // Check if the resulting date is in the future compared to *today* (Luxon defaults to earliest possible time)
            // If a user types 1/1 and it's currently 12/31, it should likely be *next* year's 1/1.
            // However, for simplicity, we'll stick to current year or the specified YY.
            // A more complex logic could check if the M/D date is significantly *before* today and assume next year.
        } else {
          // Try YYYY-MM-DD as a fallback
          dt = DateTime.fromFormat(dateString, 'yyyy-MM-dd');
        }
    }

    if (!dt.isValid) {
        return null; // Invalid format
    }

    // Format to YYYY-MM-DD
    return dt.toISODate(); // Returns 'YYYY-MM-DD'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set')
        .setDescription('Records a new customer set.')
        .addStringOption(option =>
            option.setName('customer_name')
                .setDescription('The name of the customer.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Date of set (MM/DD, MM/DD/YY, YYYY-MM-DD). Defaults to today.')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('bill_image')
                .setDescription('Attach the customer\'s bill image (optional)')
                .setRequired(false)),

    async execute(interaction) {
        const customerName = interaction.options.getString('customer_name');
        const dateInputString = interaction.options.getString('date');
        const billAttachment = interaction.options.getAttachment('bill_image');
        const user = interaction.user;
        const channel = interaction.channel;

        let setDate = DateTime.now().toISODate();
        let displayDate = DateTime.now().toFormat('MM/dd/yy');
        let dateWarning = '';
        let attachmentWarning = '';
        let hasBill = false;

        if (dateInputString) {
            const parsedDate = parseDateInputLuxon(dateInputString);
            if (parsedDate) {
                setDate = parsedDate;
                displayDate = DateTime.fromISO(parsedDate).toFormat('MM/dd/yy'); 
            } else {
                dateWarning = `\n⚠️ Invalid date format: \'${dateInputString}\'. Using today (${displayDate}). Please use MM/DD, MM/DD/YY, or YYYY-MM-DD.`;
            }
        }

        if (billAttachment) {
            if (billAttachment.contentType?.startsWith('image/')) {
                hasBill = true;
                console.log(`[CMD][Set] Bill image attached: ${billAttachment.url}`);
            } else {
                attachmentWarning = `\n⚠️ Attached file \'${billAttachment.name}\' is not an image. Recording as 'No Bill'.`;
                console.log(`[CMD][Set] Non-image file attached, treating as no bill: ${billAttachment.name}`);
            }
        }

        try {
            await run(
                `INSERT INTO events (type, user, channel_id, customer_name, set_date, has_bill)
                 VALUES (?, ?, ?, ?, ?, ?)`, 
                ['set', user.id, channel.id, customerName, setDate, hasBill]
            );

            console.log(`[CMD][Set] ${user.tag} recorded set for ${customerName} on ${setDate}. Bill: ${hasBill}`);

            const finalDescription = `${user} just recorded a new set!${dateWarning}${attachmentWarning}`;

            const embed = new EmbedBuilder()
                .setColor(hasBill ? 0x57F287 : 0xFAA61A)
                .setTitle('✅ New Set Recorded!')
                .setDescription(finalDescription.trim())
                .addFields(
                    { name: 'Customer', value: customerName, inline: true },
                    { name: 'Date', value: displayDate, inline: true },
                    { name: 'Bill Included', value: hasBill ? 'Yes (Image Attached)' : 'No', inline: true }
                )
                .setTimestamp();

            if (hasBill && billAttachment) {
                embed.setImage(billAttachment.url);
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error executing /set command:', error);
            await interaction.reply({ content: 'There was an error while recording this set.', flags: MessageFlags.Ephemeral });
        }
    },
}; 