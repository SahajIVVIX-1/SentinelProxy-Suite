const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const RULE_NAME = 'ChakhdiKillSwitch';

async function enableKillSwitch() {
    try {
        await execAsync(`netsh advfirewall firewall delete rule name="${RULE_NAME}"`);
    } catch (err) {
        // Ignore delete errors (rule may not exist).
    }

    try {
        await execAsync(`netsh advfirewall firewall add rule name="${RULE_NAME}" dir=out action=block profile=any`);
    } catch (err) {
        console.error('Kill switch enable failed:', err.message);
    }
}

async function disableKillSwitch() {
    try {
        await execAsync(`netsh advfirewall firewall delete rule name="${RULE_NAME}"`);
    } catch (err) {
        console.error('Kill switch disable failed:', err.message);
    }
}

module.exports = {
    enableKillSwitch,
    disableKillSwitch
};
