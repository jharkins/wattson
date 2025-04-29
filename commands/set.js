const { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { DateTime } = require('luxon'); // Require luxon
const { PermissionLevels, checkPermission } = require('../utils/permissions.js'); // Require the permission checker

// --- Role IDs for Permissions ---
const ADMIN_ROLE_ID = '1365873523393822811';
const MANAGER_ROLE_ID = '1365387565464555673';
const CLOSER_ROLE_ID = '1365381444511338516';
const SETTER_ROLE_ID = '1365387228007763988';
const ALLOWED_ROLES = [ADMIN_ROLE_ID, MANAGER_ROLE_ID, CLOSER_ROLE_ID, SETTER_ROLE_ID];

// --- Database setup ---
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'stats.db'); // Point to ../data/
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    // Optional: Add error logging specific to this command if needed, 
    // but primary connection handled in index.js
    if (err) console.error('[SetCmd] Error opening database:', err.message);
});

// Helper to run DB queries with promises
const run = (sql, params = []) => new Promise((res, rej) =>
    db.run(sql, params, function (err) { // Use function() to access this.lastID if needed
        if (err) rej(err);
        else res(this); // Resolve with the statement object
    })
);

// --- Date/Time Parsing Logic using Luxon --- 

/**
 * Parses date and optional time inputs into an ISO8601 DateTime string.
 * Accepted date formats: MM/DD, MM/DD/YY, YYYY-MM-DD
 * Accepted time formats: HH:MM (24hr), H:MM AM/PM, HH:MM AM/PM
 * Assumes current year for MM/DD date.
 * Defaults time to 00:00:00 if not provided or invalid.
 * Returns YYYY-MM-DDTHH:mm:ss.SSSZ string or null if date is invalid.
 */
const parseDateTimeInput = (dateString, timeString) => {
    if (!dateString) return null;

    let datePart;
    // Try parsing the date part first
    datePart = DateTime.fromFormat(dateString, 'M/d/yy');
    if (!datePart.isValid) {
        datePart = DateTime.fromFormat(dateString, 'M/d');
        if (datePart.isValid) {
            datePart = datePart.set({ year: DateTime.now().year });
        } else {
            datePart = DateTime.fromFormat(dateString, 'yyyy-MM-dd');
        }
    }

    // If date part is still invalid, return null
    if (!datePart.isValid) {
        return null;
    }

    // Default time part (start of the day)
    let timePart = { hour: 0, minute: 0, second: 0, millisecond: 0 }; 
    let timeParsedSuccessfully = false;

    // If time string is provided, try parsing it
    if (timeString) {
        let parsedTime;
        // Try formats like 1:30 PM, 14:30
        parsedTime = DateTime.fromFormat(timeString, 'h:mm a');
        if (!parsedTime.isValid) {
             parsedTime = DateTime.fromFormat(timeString, 'hh:mm a'); // e.g. 02:30 PM
        }
        if (!parsedTime.isValid) {
             parsedTime = DateTime.fromFormat(timeString, 'HH:mm'); // e.g. 14:30
        }
        // Add more formats if needed (e.g., 'H:mm')

        if (parsedTime.isValid) {
            timePart = { 
                hour: parsedTime.hour,
                minute: parsedTime.minute,
                second: 0, // Default seconds to 0
                millisecond: 0
            };
            timeParsedSuccessfully = true;
        }
    }

    // Combine date and time parts
    const finalDateTime = datePart.set(timePart);

    // Return the combined DateTime as an ISO string (includes timezone offset)
    // Using .toISO() is generally better for storing specific moments.
    return {
        isoString: finalDateTime.toISO(), // e.g., 2024-07-05T14:30:00.000-04:00
        timeParsed: timeParsedSuccessfully
    };
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set')
        .setDescription('Records a new customer set appointment.')
        .addStringOption(option =>
            option.setName('customer_name')
                .setDescription('The name of the customer.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('Date of appointment (MM/DD, MM/DD/YY, YYYY-MM-DD).')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time of appointment (e.g., 2:30 PM, 14:30). Defaults to start of day.')
                .setRequired(false))
        .addAttachmentOption(option =>
            option.setName('bill_image')
                .setDescription('Attach the customer\'s bill image (optional)')
                .setRequired(false)),

    async execute(interaction) {
        // --- Permission Check (Refactored) ---
        if (!checkPermission(interaction.member, PermissionLevels.CanSetStatsHelp)) { // Use the checkPermission function
            console.log(`[Set] Denied access for user ${interaction.user.tag} (${interaction.user.id}) - Missing required role.`);
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        console.log(`[Set] Authorized access for user ${interaction.user.tag}`);

        const customerName = interaction.options.getString('customer_name');
        const dateInputString = interaction.options.getString('date');
        const timeInputString = interaction.options.getString('time');
        const billAttachment = interaction.options.getAttachment('bill_image');
        const user = interaction.user;
        const channel = interaction.channel;

        let setDateTimeISO = null;
        let displayDateTime = 'Date/Time TBD';
        let dateTimeWarning = '';
        let attachmentWarning = '';
        let hasBill = false;

        const parsedResult = parseDateTimeInput(dateInputString, timeInputString);

        if (parsedResult) {
            setDateTimeISO = parsedResult.isoString;
            displayDateTime = DateTime.fromISO(setDateTimeISO).toFormat('MM/dd/yy hh:mm a'); 
            if (timeInputString && !parsedResult.timeParsed) {
                dateTimeWarning = `\n⚠️ Invalid time format: '${timeInputString}'. Used default time (00:00).`;
            }
        } else {
            dateTimeWarning = `\n⚠️ Invalid date format: '${dateInputString}'. Could not record set.`;
            console.error(`[Set] Invalid date format provided: ${dateInputString}`);
            return interaction.reply({ content: `Invalid date format provided: '${dateInputString}'. Please use MM/DD, MM/DD/YY, or YYYY-MM-DD.`, flags: MessageFlags.Ephemeral });
        }

        if (billAttachment) {
            if (billAttachment.contentType?.startsWith('image/')) {
                hasBill = true;
                console.log(`[CMD][Set] Bill image attached: ${billAttachment.url}`);
            } else {
                attachmentWarning = `\n⚠️ Attached file '${billAttachment.name}' is not an image. Recording as 'No Bill'.`;
                console.log(`[CMD][Set] Non-image file attached, treating as no bill: ${billAttachment.name}`);
            }
        }

        let insertedRowId = null;

        try {
            // Step 1: Insert the event record, get the row ID
            const insertResult = await run(
                `INSERT INTO events (type, user, channel_id, customer_name, set_date, has_bill)
                 VALUES (?, ?, ?, ?, ?, ?)`, 
                ['set', user.id, channel.id, customerName, setDateTimeISO, hasBill] 
            );
            insertedRowId = insertResult.lastID;
            console.log(`[CMD][Set] Inserted row ID: ${insertedRowId}`);

            // Step 2: Prepare and send the confirmation embed
            const finalDescription = `${user} just recorded a new set!${dateTimeWarning}${attachmentWarning}`;
            const embed = new EmbedBuilder()
                .setColor(hasBill ? 0x57F287 : 0xFAA61A) 
                .setTitle('✅ New Set Recorded!')
                .setDescription(finalDescription.trim())
                .addFields(
                    { name: 'Customer', value: customerName, inline: true },
                    { name: 'Appt Time', value: displayDateTime, inline: true },
                    { name: 'Bill Included', value: hasBill ? 'Yes (Image Attached)' : 'No', inline: true }
                )
                .setTimestamp();
                
            if (hasBill && billAttachment) {
                 embed.setImage(billAttachment.url);
            }

            // Step 3: Reply and Update DB
            // Send reply first
            await interaction.reply({ embeds: [embed] }); 
            // Then fetch the Message object
            const replyMessage = await interaction.fetchReply(); 
            const replyMessageId = replyMessage.id;
            // Update DB with message ID
            await run(
                `UPDATE events SET message_id = ? WHERE id = ?`,
                [replyMessageId, insertedRowId]
            );
            console.log(`[CMD][Set] Updated row ID ${insertedRowId} with message ID ${replyMessageId}`);

        } catch (error) {
            console.error('Error executing /set command:', error);
            // Attempt to clean up DB row if insert succeeded but reply/update failed?
            if (insertedRowId) {
                console.warn(`[CMD][Set] Error occurred after inserting row ID ${insertedRowId}. Attempting cleanup...`);
                // Could potentially delete the row here if desired: await run(`DELETE FROM events WHERE id = ?`, [insertedRowId]);
            }
            // Send ephemeral error
            // Check if already replied/deferred (shouldn't be possible here, but good practice)
            if (interaction.replied || interaction.deferred) {
                 await interaction.followUp({ content: 'There was an error while recording this set.', flags: MessageFlags.Ephemeral });
            } else {
                 await interaction.reply({ content: 'There was an error while recording this set.', flags: MessageFlags.Ephemeral });
            }
        }
    },
}; 