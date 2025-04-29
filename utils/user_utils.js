/**
 * Fetches usernames for a list of user IDs from Discord.
 * @param {import('discord.js').Interaction} interaction - The interaction object (used to access guild/client).
 * @param {string[]} userIds - An array of user IDs to fetch usernames for.
 * @returns {Promise<Map<string, string>>} - A Map where keys are user IDs and values are usernames (displayName or tag).
 */
async function fetchUsernames(interaction, userIds) {
    const usernameMap = new Map();
    // Filter out null/empty IDs and ensure uniqueness
    const uniqueIds = [...new Set(userIds.filter(id => id))];

    if (uniqueIds.length === 0) {
        return usernameMap; // Return empty map if no valid IDs
    }

    console.log(`[UserUtils] Attempting to fetch usernames for ${uniqueIds.length} unique IDs.`);

    const fetchPromises = uniqueIds.map(async (id) => {
        try {
            let userName = '(Unknown User)'; // Default
            // Prefer fetching guild member for display name
            if (interaction.guild) { // Check if interaction occurred in a guild
                const member = await interaction.guild.members.fetch(id).catch(() => null);
                if (member) {
                    userName = member.displayName;
                }
            }
            // Fallback to client user for tag if member not found or not in guild
            if (userName === '(Unknown User)') {
                 const user = await interaction.client.users.fetch(id).catch(() => null);
                 if (user) {
                    userName = user.tag;
                 }
            }
            
            usernameMap.set(id, userName);
            if (userName === '(Unknown User)') {
                 console.warn(`[UserUtils] Could not fetch user/member for ID: ${id}`);
            }

        } catch (error) {
            console.error(`[UserUtils] Error fetching user ${id}:`, error.message);
            usernameMap.set(id, '(Error Fetching)');
        }
    });

    await Promise.all(fetchPromises);
    console.log(`[UserUtils] Finished fetching usernames. Found ${usernameMap.size} mappings.`);
    return usernameMap;
}

module.exports = {
    fetchUsernames,
}; 