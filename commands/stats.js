const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const { PermissionLevels, checkPermission } = require('../utils/permissions.js'); // Require the permission checker

// --- Database setup ---
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'stats.db');
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY, (err) => { // Open read-only is sufficient here
    if (err) console.error('[StatsCmd] Error opening database:', err.message);
});

// Helper to run a SQL query (using Promises for async/await)
const query = (sql, params = []) => new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows)))
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show daily / weekly / monthly sales stats'),
    async execute(interaction) {
        // --- Permission Check (Refactored) ---
        if (!checkPermission(interaction.member, PermissionLevels.CanSetStatsHelp)) { // Use the checkPermission function
            console.log(`[Stats] Denied access for user ${interaction.user.tag} (${interaction.user.id}) - Missing required role.`);
            return interaction.reply({ 
                content: '⛔ You do not have permission to use this command.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        console.log(`[Stats] Authorized access for user ${interaction.user.tag}`);

        try {
            const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

            // --- Calculate Summary Stats ---
            // Update query to use DATE() function on set_date column
            const dailySets = await query(
                `SELECT COUNT(*) AS n FROM events WHERE type = 'set' AND DATE(set_date) = ?`,
                [todayDate]
            ).then(rows => rows[0]?.n || 0);

            // Weekly/Monthly Closes/Installs still use created_at (when they were logged)
            const weeklyCloses = await query(
                "SELECT COUNT(*) AS n FROM events WHERE type = 'closed' AND created_at >= DATE('now','-6 days','localtime')"
            ).then(rows => rows[0]?.n || 0);

            const monthlyCloses = await query(
                "SELECT COUNT(*) AS n FROM events WHERE type = 'closed' AND created_at >= DATE('now','start of month','localtime')"
            ).then(rows => rows[0]?.n || 0);

            const monthlyInstalls = await query(
                "SELECT COUNT(*) AS n FROM events WHERE type = 'install_sched' AND created_at >= DATE('now','start of month','localtime')"
            ).then(rows => rows[0]?.n || 0);

            // --- Fetch Leaderboard Data (Daily Sets Logged by User/Setter) ---
            // Changed leaderboard to show users who RAN /set commands today
            const leaderboardData = await query(`
                SELECT user, COUNT(*) as count
                FROM events
                WHERE type = 'set'
                  AND created_at >= DATE('now','localtime','start of day')
                  AND created_at <= DATETIME('now','localtime')
                GROUP BY user
                ORDER BY count DESC
                LIMIT 10
            `);

            // --- Fetch Usernames and Format Leaderboard ---
            let leaderboardString = '';
            if (leaderboardData.length > 0) {
                const userPromises = leaderboardData.map(row =>
                    interaction.guild.members.fetch(row.user).catch(() => null) // Fetch user member (the setter)
                );
                const members = await Promise.all(userPromises);

                leaderboardString = leaderboardData
                    .map((row, index) => {
                        const member = members[index];
                        const userName = member ? member.displayName : `Unknown User (${row.user.substring(0, 6)}...)`;
                        // Use 🔅 emoji for leaderboard entries
                        return `${userName}: ${row.count} 🔅`; 
                    })
                    .join('\n');
            } else {
                leaderboardString = 'No sets logged yet today!';
            }

            // --- Build the Embed --- Add Emojis!
            const embed = new EmbedBuilder()
                .setTitle('📈 Wattson Stats 📊')
                .setDescription(`**Daily Leaderboard (Sets Logged Today)**
⚔️💣💥
${leaderboardString}
---`) // Add emojis to leaderboard header
                .setColor(0x00AE86)
                .addFields(
                    // Add emojis to field names
                    { name: 'Sets Sched. Today 📝', value: String(dailySets), inline: true }, 
                    { name: 'Closes (7d) 💣', value: String(weeklyCloses), inline: true },
                    { name: 'Closes (MTD) 🥵', value: String(monthlyCloses), inline: true }, 
                    { name: 'Installs (MTD) ✨', value: String(monthlyInstalls), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error executing /stats command:', error);
            // Use flags for ephemeral reply
            const replyOptions = { content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        }
    },
}; 