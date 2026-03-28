const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * Proxy Manager - Automated system proxy configuration for Windows
 * Handles setting and reverting registry keys for proxy settings
 */

async function setSystemProxy(port, host = '127.0.0.1') {
    console.log(`🌐 Automating Proxy: Pointing system to ${host}:${port}...`);
    try {
        // Set ProxyEnable to 1
        const enableCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`;
        await execAsync(enableCmd);

        // Set ProxyServer
        const serverCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "${host}:${port}" /f`;
        await execAsync(serverCmd);

        // Set ProxyOverride (Bypass list)
        // Note: Empty bypass list to ensure everything goes through the proxy, 
        // but we'll include common locals to avoid issues if needed.
        // The user specifically asked to NOT have to add these manually.
        const bypassList = "localhost;127.0.0.1;<local>";
        const overrideCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "${bypassList}" /f`;
        await execAsync(overrideCmd);

        console.log('✅ System Proxy updated successfully');

        // Force settings refresh (InternetSetOption is better but this works sometimes)
        // For Windows, browsers usually pick it up immediately or after a new tab
    } catch (err) {
        console.error('❌ Failed to update system Proxy:', err.message);
    }
}

async function restoreSystemProxy() {
    console.log('🔄 Reverting Proxy: Disabling system proxy settings...');
    try {
        // Set ProxyEnable to 0
        const disableCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`;
        await execAsync(disableCmd);
        console.log('✅ System Proxy disabled successfully');
    } catch (err) {
        console.error('❌ Failed to revert system Proxy:', err.message);
    }
}

module.exports = {
    setSystemProxy,
    restoreSystemProxy
};
