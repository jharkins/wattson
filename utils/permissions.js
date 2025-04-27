// utils/permissions.js

// Define Role IDs using descriptive constant names
const Roles = {
    ADMIN: '1365873523393822811',
    MANAGER: '1365387565464555673',
    CLOSER: '1365381444511338516',
    SETTER: '1365387228007763988',
};

// Define permission levels using the role constants
const PermissionLevels = {
    // Only Admin and Manager can export
    CanExport: [Roles.ADMIN, Roles.MANAGER],
    // Admin, Manager, Closer can use /closed and /install
    CanCloseOrInstall: [Roles.ADMIN, Roles.MANAGER, Roles.CLOSER],
    // Admin, Manager, Closer, Setter can use /set, /stats, /help
    CanSetStatsHelp: [Roles.ADMIN, Roles.MANAGER, Roles.CLOSER, Roles.SETTER],
};

/**
 * Checks if a member has at least one of the required roles.
 * @param {import('discord.js').GuildMember} member - The interaction.member object.
 * @param {string[]} requiredRoles - An array of role IDs (e.g., PermissionLevels.CanExport).
 * @returns {boolean} - True if the member has permission, false otherwise.
 */
function checkPermission(member, requiredRoles) {
    if (!member || !requiredRoles || !Array.isArray(requiredRoles)) {
        console.error('[PermCheck] Invalid arguments provided to checkPermission.');
        return false;
    }
    // Ensure member.roles exists and has the cache property
    if (!member.roles?.cache) {
        console.error('[PermCheck] member.roles.cache is not accessible.');
        return false;
    }
    const memberRoles = member.roles.cache;
    return requiredRoles.some(roleId => memberRoles.has(roleId));
}

// Export the function and the permission levels/roles
module.exports = {
    Roles,
    PermissionLevels,
    checkPermission,
}; 