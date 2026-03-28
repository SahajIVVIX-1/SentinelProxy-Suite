const { PATHS } = require('../config');
const configStore = require('./config-store');

const DEFAULT_CONFIG = {
    settings: {
        nxdomainWindowMinutes: 10,
        nxdomainThreshold: 5,
        suspiciousTlds: ['.zip', '.mov', '.top', '.xyz', '.link', '.click', '.quest', '.gq', '.tk'],
        trackerPatterns: ['ads', 'track', 'pixel', 'analytics', 'telemetry']
    },
    suggestions: {},
    ignored: {}
};

let store = configStore.readJson(PATHS.DNS_ADAPTIVE, DEFAULT_CONFIG) || DEFAULT_CONFIG;
const nxdomainBuckets = new Map();

function normalizeDomain(domain) {
    return (domain || '').toLowerCase().trim();
}

function getIndicators(domain) {
    const normalized = normalizeDomain(domain);
    const settings = store.settings || DEFAULT_CONFIG.settings;
    const suspiciousTlds = settings.suspiciousTlds || [];
    const trackerPatterns = settings.trackerPatterns || [];

    const suspiciousTld = suspiciousTlds.find((tld) => normalized.endsWith(tld)) || null;
    const trackerPattern = trackerPatterns.find((pattern) => normalized.includes(pattern)) || null;

    return {
        suspiciousTld,
        trackerPattern
    };
}

function recordSuggestion(domain, reason, details = {}) {
    const normalized = normalizeDomain(domain);
    if (!normalized) return;
    if (store.ignored[normalized]) return;

    const existing = store.suggestions[normalized] || {
        domain: normalized,
        score: 0,
        reasons: [],
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        occurrences: 0
    };

    existing.score += 1;
    existing.occurrences += 1;
    existing.lastSeen = new Date().toISOString();

    if (reason && !existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
    }

    if (details && Object.keys(details).length > 0) {
        existing.details = { ...(existing.details || {}), ...details };
    }

    store.suggestions[normalized] = existing;
    configStore.writeJsonWithRollback(PATHS.DNS_ADAPTIVE, store);
}

function recordNxDomain(domain) {
    const normalized = normalizeDomain(domain);
    if (!normalized) return;
    const now = Date.now();
    const windowMs = (store.settings?.nxdomainWindowMinutes || 10) * 60 * 1000;

    const bucket = nxdomainBuckets.get(normalized) || [];
    bucket.push(now);

    const cutoff = now - windowMs;
    const filtered = bucket.filter((ts) => ts >= cutoff);
    nxdomainBuckets.set(normalized, filtered);

    if (filtered.length >= (store.settings?.nxdomainThreshold || 5)) {
        recordSuggestion(normalized, 'nxdomainSpike', { count: filtered.length });
    }
}

function recordIndicators(domain) {
    const indicators = getIndicators(domain);
    if (indicators.suspiciousTld) {
        recordSuggestion(domain, 'suspiciousTld', { tld: indicators.suspiciousTld });
    }
    if (indicators.trackerPattern) {
        recordSuggestion(domain, 'trackerPattern', { pattern: indicators.trackerPattern });
    }
    return indicators;
}

function getSuggestions() {
    return Object.values(store.suggestions || {}).sort((a, b) => b.score - a.score);
}

function acceptSuggestion(domain) {
    const normalized = normalizeDomain(domain);
    if (!normalized) return;
    delete store.suggestions[normalized];
    configStore.writeJsonWithRollback(PATHS.DNS_ADAPTIVE, store);
}

function dismissSuggestion(domain, reason = 'ignored') {
    const normalized = normalizeDomain(domain);
    if (!normalized) return;
    delete store.suggestions[normalized];
    store.ignored[normalized] = { ignoredAt: new Date().toISOString(), reason };
    configStore.writeJsonWithRollback(PATHS.DNS_ADAPTIVE, store);
}

function getSettings() {
    return store.settings || DEFAULT_CONFIG.settings;
}

module.exports = {
    getSettings,
    getIndicators,
    recordNxDomain,
    recordIndicators,
    getSuggestions,
    acceptSuggestion,
    dismissSuggestion
};
