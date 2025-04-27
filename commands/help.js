const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about the Wattson bot and its commands.'),
    async execute(interaction) {
        // Log who used the command
        console.log(`[Help] Command used by ${interaction.user.tag} (${interaction.user.id}) in channel ${interaction.channel.id}`);

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