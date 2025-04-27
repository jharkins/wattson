const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

// Assuming DB_FILE is accessible via process.env or a config file
// If not, this needs adjustment (e.g., pass db instance via interaction.client)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'stats.db');
const db = new sqlite3.Database(DB_FILE);

// Helper to run a SQL query (using Promises for async/await)
// Consider moving this to a shared db utility file later
const query = (sql, params = []) => new Promise((res, rej) =>
    db.all(sql, params, (err, rows) => (err ? rej(err) : res(rows)))
);


module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show daily / weekly / monthly sales stats'),
    async execute(interaction) {
        // Note: We are re-opening the DB connection here.
        // A better approach for larger bots is to establish the DB connection once
        // in index.js and pass the `db` object, perhaps via `interaction.client.db`.
        // For now, this mirrors the original logic's scope.

        try {
            // --- Calculate Summary Stats ---
            // TODO: Parameterize these queries
            const todayStart = "DATE('now','localtime','start of day')";
            const todayEnd = "DATETIME('now','localtime')";

            const dailySets = await query(
                `SELECT COUNT(*) AS n FROM events WHERE type IN ('set_with_bill', 'set_no_bill') AND created_at >= ${todayStart} AND created_at <= ${todayEnd}`
            ).then(rows => rows[0].n);

            const weeklyCloses = await query(
                "SELECT COUNT(*) AS n FROM events WHERE type = 'closed' AND created_at >= DATE('now','-6 days','localtime')"
            ).then(rows => rows[0].n);

            const monthlyCloses = await query(
                "SELECT COUNT(*) AS n FROM events WHERE type = 'closed' AND created_at >= DATE('now','start of month','localtime')"
            ).then(rows => rows[0].n);

            const monthlyInstalls = await query(
                "SELECT COUNT(*) AS n FROM events WHERE type = 'install_sched' AND created_at >= DATE('now','start of month','localtime')"
            ).then(rows => rows[0].n);


            // --- Fetch Leaderboard Data (Daily Sets per User) ---
            const leaderboardData = await query(`
                SELECT user, COUNT(*) as count
                FROM events
                WHERE type IN ('set_with_bill', 'set_no_bill') AND created_at >= ${todayStart} AND created_at <= ${todayEnd}
                GROUP BY user
                ORDER BY count DESC
                LIMIT 10
            `);

            // --- Fetch Usernames and Format Leaderboard ---
            let leaderboardString = '';
            if (leaderboardData.length > 0) {
                const userPromises = leaderboardData.map(row =>
                    interaction.guild.members.fetch(row.user).catch(() => null) // Fetch member, handle errors
                );
                const members = await Promise.all(userPromises);

                leaderboardString = leaderboardData
                    .map((row, index) => {
                        const member = members[index];
                        const userName = member ? member.displayName : `Unknown User (${row.user.substring(0, 4)}...)`;
                        return `${userName}: ${row.count}🔅`;
                    })
                    .join('\n');
            } else {
                leaderboardString = 'No sets recorded yet today!';
            }


            // --- Build the Embed ---
            const embed = new EmbedBuilder()
                .setTitle('📈 Black Diamond Stats 📊')
                .setDescription(`**Daily Leaderboard (Sets)**
⚔️💣💥
${leaderboardString}
---`)
                .setColor(0x00AE86)
                .addFields(
                    { name: 'Daily Sets 📝', value: String(dailySets), inline: true },
                    { name: 'Weekly Closes 💣', value: String(weeklyCloses), inline: true },
                    { name: 'Monthly Closes 🥵', value: String(monthlyCloses), inline: true },
                    { name: 'Monthly Installs ✨', value: String(monthlyInstalls), inline: true }
                )
                .setTimestamp();

            // Respond to the interaction
            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error executing /stats command:', error);
            // Use followUp if already replied/deferred, otherwise reply
            if (interaction.replied || interaction.deferred) {
                // Use flags for ephemeral followUp
                await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
            } else {
                // Use flags for ephemeral reply
                await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
            }
        }
    },
}; 