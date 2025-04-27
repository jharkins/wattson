const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { PermissionLevels, checkPermission } = require('../utils/permissions.js'); // Require the permission checker

// --- Role IDs for Permissions ---
const ADMIN_ROLE_ID = '1365873523393822811';
const MANAGER_ROLE_ID = '1365387565464555673';
const CLOSER_ROLE_ID = '1365381444511338516';
const SETTER_ROLE_ID = '1365387228007763988';
const ALLOWED_ROLES = [ADMIN_ROLE_ID, MANAGER_ROLE_ID, CLOSER_ROLE_ID, SETTER_ROLE_ID];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about the Wattson bot and its commands.'),
    async execute(interaction) {
        // --- Permission Check (Refactored) ---
        if (!checkPermission(interaction.member, PermissionLevels.CanSetStatsHelp)) { // Use the checkPermission function
            console.log(`[Help] Denied access for user ${interaction.user.tag} (${interaction.user.id}) - Missing required role.`);
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        // Log who used the command
        console.log(`[Help] Authorized command used by ${interaction.user.tag} (${interaction.user.id}) in channel ${interaction.channel.id}`);

        const commandList = interaction.client.commands;

        // Format commands
        let commandString = 'No commands found.';
        if (commandList && commandList.size > 0) {
             commandString = commandList
                .map(cmd => `**/${cmd.data.name}**: ${cmd.data.description}`)
                .join('\n');
        }

        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 Wattson Help')
            .setDescription('I track sets, closes, and installations for Zeo Energy via slash commands.')
            .setColor(0x5865F2) // Discord blurple
            .addFields(
                { name: 'Available Commands', value: commandString }
                // TODO: Add guild-specific channel info here if GUILD_CONFIGS is implemented
            )
            .setTimestamp();

        // Use flags for ephemeral reply
        await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
    },
}; 