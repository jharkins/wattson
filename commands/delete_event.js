const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { PermissionLevels, checkPermission } = require('../utils/permissions.js');
const { DateTime } = require('luxon'); // For formatting dates in confirmation
const { generateExportData } = require('./export_db.js'); // Import the export helper
const { fetchUsernames } = require('../utils/user_utils.js'); // Assuming fetchUsernames is moved

// --- Database setup ---
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'stats.db');
// Use READWRITE mode as we need DELETE permission
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
    if (err) console.error('[DeleteEvent] Error opening database:', err.message);
});
// Use run for DELETE, query for SELECT
const run = (sql, params = []) => new Promise((res, rej) => 
    db.run(sql, params, function (err) { (err ? rej(err) : res(this)); })
);
const queryOne = (sql, params = []) => new Promise((res, rej) => 
    db.get(sql, params, (err, row) => (err ? rej(err) : res(row)))
);
const queryAll = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows)))); // Add queryAll

// Helper to build the confirmation embed for a specific event
function buildConfirmationEmbed(event) {
     return new EmbedBuilder()
        .setColor(0xFF4C4C) // Red
        .setTitle(`Confirm Deletion: Event ID ${event.id}`)
        .setDescription(`**Are you sure you want to permanently delete this event? This cannot be undone.**`)
        .addFields(
            { name: 'Type', value: event.type || 'N/A', inline: true },
            { name: 'User ID', value: event.user || 'N/A', inline: true }, // Keep User ID for reference
            { name: 'Customer', value: event.customer_name || 'N/A', inline: true },
            { name: 'Created At', value: event.created_at ? DateTime.fromISO(event.created_at).toFormat('MM/dd/yy HH:mm:ss') : 'N/A', inline: true },
            { name: 'Set Date/Time', value: event.set_date ? DateTime.fromISO(event.set_date).toFormat('MM/dd/yy hh:mm a') : 'N/A', inline: true },
            { name: 'Setter ID', value: event.setter_id || 'N/A', inline: true }
        )
        .setTimestamp();
}

// Helper to build confirmation buttons
function buildConfirmationButtons(eventId) {
     const confirmButton = new ButtonBuilder()
        .setCustomId(`confirm_delete_${eventId}`)
        .setLabel('Confirm Delete')
        .setStyle(ButtonStyle.Danger);
     const cancelButton = new ButtonBuilder()
        .setCustomId(`cancel_delete_${eventId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);
    return new ActionRowBuilder().addComponents(confirmButton, cancelButton);
}

// Helper to handle the actual deletion confirmation flow
async function handleSpecificDeletion(interaction, eventId) {
     try {
        const event = await queryOne('SELECT * FROM events WHERE id = ?', [eventId]);
        if (!event) {
             console.warn(`[DeleteEvent:Handle] Event ID ${eventId} not found for deletion confirmation.`);
             // Edit the original interaction (which might be the list or a previous confirmation)
            await interaction.editReply({ content: `⚠️ Event ID ${eventId} could not be found anymore.`, embeds: [], components: [] });
            return;
        }

        const confirmEmbed = buildConfirmationEmbed(event);
        const confirmRow = buildConfirmationButtons(eventId);
        
        // Edit the interaction to show the confirmation
        await interaction.editReply({ embeds: [confirmEmbed], components: [confirmRow] });

        // Collector for the confirmation buttons
        const reply = await interaction.fetchReply(); // Get the message we just edited
        const filter = i => i.user.id === interaction.user.id && i.customId.endsWith(`_${eventId}`);
        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, filter, time: 30000 }); 
        let actionTaken = false;

         collector.on('collect', async i => {
            actionTaken = true;
            collector.stop();
            if (i.customId.startsWith('confirm_delete')) {
                 console.log(`[DeleteEvent:Handle] Confirmed deletion for event ID: ${eventId} by ${i.user.tag}`);
                await i.update({ content: 'Deleting record...', embeds: [], components: [] });
                const result = await run('DELETE FROM events WHERE id = ?', [eventId]);
                 if (result.changes > 0) {
                     console.log(`[DeleteEvent:Handle] Successfully deleted event ID: ${eventId}`);
                     await interaction.editReply({ content: `✅ Event ID ${eventId} has been successfully deleted.`, embeds: [], components: [] });
                 } else {
                    console.warn(`[DeleteEvent:Handle] Delete command affected 0 rows for ID: ${eventId}`);
                     await interaction.editReply({ content: `⚠️ Event ID ${eventId} was not found during deletion attempt.`, embeds: [], components: [] });
                 }
            } else if (i.customId.startsWith('cancel_delete')) {
                 console.log(`[DeleteEvent:Handle] Deletion cancelled for event ID: ${eventId} by ${i.user.tag}`);
                 await i.update({ content: 'Deletion cancelled.', embeds: [], components: [] });
            }
         });

         collector.on('end', collected => {
             if (!actionTaken) {
                console.log(`[DeleteEvent:Handle] Deletion confirmation timed out for event ID: ${eventId}`);
                // Disable buttons on timeout
                 const disabledRow = buildConfirmationButtons(eventId);
                 disabledRow.components.forEach(c => c.setDisabled(true));
                 interaction.editReply({ content: 'Confirmation timed out.', components: [disabledRow] }).catch(console.error);
             }
         });

     } catch (error) {
         console.error(`[DeleteEvent:Handle] Error handling specific deletion for ID ${eventId}:`, error);
         await interaction.editReply({ content: `❌ An error occurred processing deletion for Event ID ${eventId}.`, embeds:[], components: [] });
     }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete_event')
        .setDescription('Deletes an event by ID, or lists recent events if no ID is given.') // Updated description
        .addIntegerOption(option =>
            option.setName('event_id')
            .setDescription('The ID of the event to delete. Omit to list recent events.') // Updated description
            .setRequired(false)), // Make optional

    async execute(interaction) {
        // --- Permission Check ---
        if (!checkPermission(interaction.member, PermissionLevels.CanExport)) {
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const eventId = interaction.options.getInteger('event_id'); // Can be null now

        if (eventId !== null) {
            // ---== Start Specific Delete Flow Directly ==---
            console.log(`[DeleteEvent] User ${interaction.user.tag} requested specific delete for ID: ${eventId}`);
            // Use reply then edit to show confirmation immediately
            await interaction.reply({ content: `Fetching details for Event ID ${eventId}...`, flags: MessageFlags.Ephemeral });
            await handleSpecificDeletion(interaction, eventId);

        } else {
            // ---== List Recent + Select/Export Flow ==---
            console.log(`[DeleteEvent] User ${interaction.user.tag} requesting recent events list.`);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Defer as fetching users takes time
            try {
                const recentEvents = await queryAll('SELECT id, type, user, customer_name, set_date FROM events ORDER BY id DESC LIMIT 10');

                if (!recentEvents || recentEvents.length === 0) {
                    return interaction.editReply({ content: 'ℹ️ No recent events found in the database.' });
                }

                // Fetch usernames for the list
                const userIds = recentEvents.map(e => e.user).filter(id => id);
                const usernameMap = await fetchUsernames(interaction, userIds);

                const listEmbed = new EmbedBuilder()
                    .setTitle('📋 Last 10 Events Logged')
                    .setDescription('Select an event ID below to manage it, or export the full DB.')
                    .setColor(0x5865F2)
                    .setTimestamp();

                const selectOptions = [];
                recentEvents.forEach(event => {
                    const userName = usernameMap.get(event.user) || '(Unknown User)';
                    const formattedDate = event.set_date ? DateTime.fromISO(event.set_date).toFormat('MM/dd/yy hh:mm a') : 'N/A';
                    // Add to embed
                    listEmbed.addFields({ 
                        name: `ID: ${event.id} (${event.type || 'N/A'})`, 
                        value: `Cust: ${event.customer_name || 'N/A'} | By: ${userName}\nDate: ${formattedDate}`, 
                        inline: false 
                    });
                    // Add to select menu options
                    selectOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`Delete Event ID: ${event.id} (${event.type})`)
                            .setValue(`delete_specific_${event.id}`)
                    );
                });

                const eventSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_event_to_delete')
                    .setPlaceholder('Select an event ID to delete...')
                    .addOptions(selectOptions);

                const exportButton = new ButtonBuilder()
                    .setCustomId('export_db_from_list')
                    .setLabel('Export Full DB as CSV')
                    .setStyle(ButtonStyle.Primary);
                
                const selectRow = new ActionRowBuilder().addComponents(eventSelectMenu);
                const buttonRow = new ActionRowBuilder().addComponents(exportButton);

                // Edit the deferred reply
                const reply = await interaction.editReply({
                    embeds: [listEmbed],
                    components: [selectRow, buttonRow]
                });

                // Combined collector for Select Menu and Button
                const collectorFilter = i => i.user.id === interaction.user.id;
                const collector = reply.createMessageComponentCollector({ filter: collectorFilter, time: 60000 }); // 60 seconds
                let listActionTaken = false;

                collector.on('collect', async i => {
                     listActionTaken = true; // Mark that some action was taken on the list view
                    
                    if (i.isStringSelectMenu() && i.customId === 'select_event_to_delete') {
                        collector.stop(); // Stop this collector, hand off to specific delete handler
                        const selectedEventId = parseInt(i.values[0].split('_')[2], 10);
                        console.log(`[DeleteEvent] User ${i.user.tag} selected event ID ${selectedEventId} for deletion.`);
                        // Acknowledge the select menu interaction before starting the delete flow
                        await i.deferUpdate(); 
                        await handleSpecificDeletion(interaction, selectedEventId); // Pass the original interaction
                    
                    } else if (i.isButton() && i.customId === 'export_db_from_list') {
                         // Handle Export Button Click
                        collector.stop(); // Stop listening on this list view
                        console.log(`[DeleteEvent] User ${i.user.tag} clicked export button from list.`);
                        await i.deferUpdate();
                        await i.followUp({ content: '⏳ Generating database export...', flags: MessageFlags.Ephemeral });
                        const { attachment, error } = await generateExportData(interaction);
                        if (attachment) {
                            await interaction.followUp({ content: '📊 Export complete:', files: [attachment], flags: MessageFlags.Ephemeral });
                        } else {
                            let errorMessage = '❌ Error generating export.';
                            if (error && error.message === 'Database is empty.') errorMessage = 'ℹ️ DB empty.';
                            await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
                        }
                        // Disable export button after click
                        exportButton.setDisabled(true);
                        await interaction.editReply({ components: [selectRow, new ActionRowBuilder().addComponents(exportButton)] });
                    }
                });

                collector.on('end', collected => {
                    // Disable components if the main list collector times out without action
                    if (!listActionTaken) {
                        console.log(`[DeleteEvent] List view timed out.`);
                        eventSelectMenu.setDisabled(true);
                        exportButton.setDisabled(true);
                        interaction.editReply({ components: [new ActionRowBuilder().addComponents(eventSelectMenu), new ActionRowBuilder().addComponents(exportButton)] }).catch(console.error);
                    }
                });

            } catch (error) {
                console.error(`[DeleteEvent] Error listing recent events:`, error);
                // Ensure we edit the deferred reply on error
                await interaction.editReply({ content: '❌ An error occurred while fetching recent events.', components: [], embeds: [] });
            }
        }
    },
}; 