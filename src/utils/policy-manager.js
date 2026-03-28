const { PATHS } = require('../config');
const configStore = require('./config-store');

const DEFAULT_POLICY_CONFIG = {
    enforcement: {
        outOfSchedule: 'block'
    },
    defaults: {
        kids: {
            safeSearch: true,
            blockTrackers: true,
            blockSuspiciousTlds: true
        },
        guest: {
            safeSearch: false,
            blockTrackers: true,
            blockSuspiciousTlds: true
        },
        work: {
            safeSearch: false,
            blockTrackers: false,
            blockSuspiciousTlds: false
        }
    },
    assignments: []
};

let policyConfig = configStore.readJson(PATHS.DNS_POLICIES, DEFAULT_POLICY_CONFIG) || DEFAULT_POLICY_CONFIG;
const recentPolicyBlocks = new Map();

function normalizeMac(mac) {
    return (mac || '').toLowerCase().trim();
}

function parseTimeToMinutes(value) {
    if (!value || typeof value !== 'string') return null;
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return (hours * 60) + minutes;
}

function isScheduleActive(schedule, now = new Date()) {
    if (!Array.isArray(schedule) || schedule.length === 0) return true;
    const day = now.getDay();
    const minutes = (now.getHours() * 60) + now.getMinutes();

    return schedule.some((slot) => {
        const days = Array.isArray(slot.days) ? slot.days : [];
        if (days.length > 0 && !days.includes(day)) return false;
        const start = parseTimeToMinutes(slot.start);
        const end = parseTimeToMinutes(slot.end);
        if (start === null || end === null) return false;

        if (start === end) return true;
        if (start < end) return minutes >= start && minutes <= end;
        return minutes >= start || minutes <= end;
    });
}

function getAssignmentForMac(mac) {
    const normalized = normalizeMac(mac);
    if (!normalized) return null;
    return policyConfig.assignments.find((assignment) => normalizeMac(assignment.mac) === normalized) || null;
}

function getPolicyForMac(mac, now = new Date()) {
    const assignment = getAssignmentForMac(mac);
    if (!assignment) return null;
    const mode = assignment.mode || 'guest';
    const defaults = policyConfig.defaults[mode] || {};
    const scheduleActive = isScheduleActive(assignment.schedule, now);

    return {
        mac: normalizeMac(mac),
        mode,
        scheduleActive,
        privacyShield: !!assignment.privacyShield,
        settings: {
            ...defaults,
            ...(assignment.settings || {})
        },
        schedule: assignment.schedule || []
    };
}

function isPrivacyShielded(mac) {
    const assignment = getAssignmentForMac(mac);
    return !!assignment?.privacyShield;
}

function setPolicies(nextConfig) {
    policyConfig = {
        ...DEFAULT_POLICY_CONFIG,
        ...(nextConfig || {}),
        defaults: {
            ...DEFAULT_POLICY_CONFIG.defaults,
            ...(nextConfig?.defaults || {})
        },
        assignments: Array.isArray(nextConfig?.assignments) ? nextConfig.assignments : []
    };
    return configStore.writeJsonWithRollback(PATHS.DNS_POLICIES, policyConfig);
}

function getPolicies() {
    return policyConfig;
}

function recordPolicyBlock(clientIp, domain, details) {
    const key = `${clientIp || 'unknown'}::${domain}`;
    recentPolicyBlocks.set(key, {
        domain,
        clientIp,
        details,
        lastSeen: Date.now()
    });
}

function getPolicyBlock(clientIp, domain) {
    const key = `${clientIp || 'unknown'}::${domain}`;
    const entry = recentPolicyBlocks.get(key);
    if (!entry) return null;
    if (Date.now() - entry.lastSeen > 5 * 60 * 1000) {
        recentPolicyBlocks.delete(key);
        return null;
    }
    return entry.details || null;
}

module.exports = {
    getPolicies,
    setPolicies,
    getPolicyForMac,
    isPrivacyShielded,
    recordPolicyBlock,
    getPolicyBlock
};
