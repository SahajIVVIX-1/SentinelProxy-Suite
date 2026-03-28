const fs = require('fs');
const path = require('path');
const { PATHS } = require('../config');
const healthMonitor = require('./health-monitor');

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readJson(filePath, fallback = null) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        return fallback;
    }
}

function writeJsonWithRollback(filePath, data) {
    const tmpPath = `${filePath}.tmp`;
    const backupPath = `${filePath}.bak`;
    try {
        ensureDir(filePath);

        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, backupPath);
        }

        const payload = JSON.stringify(data, null, 2);
        fs.writeFileSync(tmpPath, payload, 'utf8');
        fs.renameSync(tmpPath, filePath);
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        return { ok: true };
    } catch (err) {
        try {
            if (fs.existsSync(backupPath)) {
                fs.copyFileSync(backupPath, filePath);
                fs.unlinkSync(backupPath);
            }
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (restoreErr) {
            void restoreErr;
        }
        healthMonitor.setReadOnly(`config_write_failed:${path.basename(filePath)}`);
        return { ok: false, error: err.message };
    }
}

function updateHealthState(state) {
    try {
        const payload = {
            updatedAt: new Date().toISOString(),
            ...state
        };
        ensureDir(PATHS.HEALTH_STATE);
        fs.writeFileSync(PATHS.HEALTH_STATE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
        void err;
    }
}

module.exports = {
    readJson,
    writeJsonWithRollback,
    updateHealthState
};
