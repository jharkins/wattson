const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about the Wattson bot and its commands.'),
    async execute(interaction) {
        const commandList = interaction.client.commands;

        // Format commands
        let commandString = 'No commands found.';
        if (commandList && commandList.size > 0) {
             commandString = commandList.map(cmd => `**/${cmd.data.name}**: ${cmd.data.description}`).join('\n');
        }

        // Hardcoded examples
        const examplesString = `
- "Just got a **set with bill** from Jane D."
- "Woohoo! Another **closed** deal!"
- "Just finished scheduling, **installation scheduled** for next Tuesday."
- "Got a **set no bill** lead, following up."
        `.trim();

        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 Wattson Help')
            .setDescription('I track stats posted in specific channels for Zeo Energy.')
            .setColor(0x5865F2) // Discord blurple
            .addFields(
                { name: 'Commands', value: commandString },
                { name: 'Tracking Keywords', value: `I listen for keywords in messages in the configured channel. Examples include:` },
                { name: 'Examples', value: examplesString }
                // TODO: Add guild-specific channel info here if GUILD_CONFIGS is implemented
            )
            .setTimestamp();

        // Use flags for ephemeral reply
        await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
    },
}; 