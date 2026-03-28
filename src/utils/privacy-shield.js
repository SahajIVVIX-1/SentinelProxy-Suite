const security = require('../security');
const policyManager = require('./policy-manager');

function isShieldedByIp(clientIp) {
    const entry = security.getAllowlistEntry(clientIp);
    if (!entry || !entry.mac) return false;
    return policyManager.isPrivacyShielded(entry.mac);
}

module.exports = {
    isShieldedByIp
};
