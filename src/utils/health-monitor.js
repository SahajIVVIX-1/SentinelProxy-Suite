const fs = require('fs');
const { PATHS } = require('../config');
const { updateHealthState } = require('./config-store');

let readOnlyState = {
    enabled: false,
    reason: null,
    lastCheckedAt: null
};

function isReadOnly() {
    return readOnlyState.enabled;
}

function getState() {
    return { ...readOnlyState };
}

function setReadOnly(reason) {
    readOnlyState.enabled = true;
    readOnlyState.reason = reason || 'unknown';
    readOnlyState.lastCheckedAt = new Date().toISOString();
    updateHealthState({ readOnly: readOnlyState.enabled, reason: readOnlyState.reason });
}

function clearReadOnly() {
    readOnlyState.enabled = false;
    readOnlyState.reason = null;
    readOnlyState.lastCheckedAt = new Date().toISOString();
    updateHealthState({ readOnly: readOnlyState.enabled, reason: null });
}

function checkWritable(paths = []) {
    let writable = true;
    let reason = null;

    for (const checkPath of paths) {
        try {
            fs.accessSync(checkPath, fs.constants.W_OK);
        } catch (err) {
            writable = false;
            reason = `fs_readonly:${checkPath}`;
            break;
        }
    }

    if (!writable) {
        setReadOnly(reason);
    } else if (readOnlyState.enabled) {
        clearReadOnly();
    }
}

function startHealthMonitor(intervalMs = 10000) {
    const pathsToCheck = [PATHS.DATA, PATHS.DNS_DIR];
    checkWritable(pathsToCheck);
    setInterval(() => checkWritable(pathsToCheck), intervalMs);
}

module.exports = {
    isReadOnly,
    getState,
    setReadOnly,
    clearReadOnly,
    startHealthMonitor
};
