const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * DNS Manager - Automated system DNS configuration
 * Handles switching primary DNS to 127.0.0.1 and reverting to DHCP
 */

async function setSelfAsDns() {
    console.log('🌐 Automating DNS: Pointing system to 127.0.0.1...');
    try {
        // PowerShell command to set DNS to 127.0.0.1 for all active (Up) network adapters
        const cmd = `powershell -Command "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses ('127.0.0.1') }"`;
        await execAsync(cmd);
        console.log('✅ System DNS updated successfully');
    } catch (err) {
        console.error('❌ Failed to update system DNS:', err.message);
        // Note: This requires Administrative privileges
    }
}

async function restoreOriginalDns() {
    console.log('🔄 Reverting DNS: Restoring automatic (DHCP) settings...');
    try {
        // PowerShell command to reset DNS to automatic for all active (Up) network adapters
        const cmd = `powershell -Command "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses }"`;
        await execAsync(cmd);
        console.log('✅ System DNS reverted to automatic successfully');
    } catch (err) {
        console.error('❌ Failed to revert system DNS:', err.message);
    }
}

module.exports = {
    setSelfAsDns,
    restoreOriginalDns
};
