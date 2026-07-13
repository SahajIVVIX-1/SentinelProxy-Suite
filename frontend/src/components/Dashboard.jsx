import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Globe, Shield, Users, Server, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const INITIAL_EVENTS = [
    { type: 'success', label: 'User Admin Authenticated', time: '14:45', icon: CheckCircle, iconColor: '#16A34A' },
    { type: 'success', label: 'DNS Resolution Allowed - google.com', time: '14:44', icon: CheckCircle, iconColor: '#16A34A' },
    { type: 'blocked', label: 'Blocked Malware Domain - track.evil.com', time: '14:42', icon: XCircle, iconColor: '#DC2626' },
    { type: 'warning', label: 'SSL Certificate Generated - mail.chakhdi.local', time: '14:40', icon: AlertTriangle, iconColor: '#F59E0B' }
];

export default function Dashboard() {
    const [stats, setStats] = useState({ blockedCount: 0, totalRequests: 0, getRequests: 0, connectRequests: 0 });
    const [dnsStats, setDnsStats] = useState({ totalQueries: 0, blockedQueries: 0 });
    const [currentUser, setCurrentUser] = useState({});
    const [liveTraffic, setLiveTraffic] = useState([]);
    const [events, setEvents] = useState(INITIAL_EVENTS);

    const fetchStats = async () => {
        const username = currentUser.username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        const headers = { 'x-user': username, 'x-session-id': sessionId };
        try {
            const [proxyRes, dnsRes] = await Promise.all([
                fetch('/api/stats', { headers }),
                fetch('/api/dns/stats', { headers })
            ]);
            setStats(await proxyRes.json());
            setDnsStats(await dnsRes.json());
        } catch (e) {}
    };

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
    }, []);

    useEffect(() => {
        if (!currentUser.username) return;
        fetchStats();
        const socket = io();
        socket.on('logs', (entries) => {
            setLiveTraffic(prev => [...entries, ...prev].slice(0, 10));
            entries.forEach(entry => {
                if (entry.method === 'BLOCK') {
                    setEvents(prev => [
                        { type: 'blocked', label: `Blocked Threat: ${entry.url}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), icon: XCircle, iconColor: '#DC2626' },
                        ...prev.slice(0, 5)
                    ]);
                }
            });
            fetchStats();
        });
        const interval = setInterval(fetchStats, 5000);
        return () => { socket.disconnect(); clearInterval(interval); };
    }, [currentUser]);

    const getFlagEmoji = (host) => {
        if (!host) return '🌐';
        const lower = host.toLowerCase();
        if (lower.includes('google') || lower.includes('.in')) return '🇮🇳';
        if (lower.includes('microsoft') || lower.includes('.us')) return '🇺🇸';
        if (lower.includes('cloudflare') || lower.includes('.sg')) return '🇸🇬';
        if (lower.includes('github') || lower.includes('.uk')) return '🇬🇧';
        return '🌐';
    };

    // ── stat cards ───────────────────────────────────────────
    const statCards = [
        {
            icon: <Globe size={22} />,
            iconBg: 'rgba(37,99,235,0.09)', iconColor: '#2563EB',
            label: 'Total Requests',
            value: stats.totalRequests ? stats.totalRequests.toLocaleString() : '1,293',
            sub: '+12% Today', subColor: '#16A34A'
        },
        {
            icon: <Shield size={22} />,
            iconBg: 'rgba(220,38,38,0.09)', iconColor: '#DC2626',
            label: 'Threats Blocked',
            value: stats.blockedCount ? stats.blockedCount.toLocaleString() : '18',
            sub: '+5 Today', subColor: '#DC2626'
        },
        {
            icon: <Users size={22} />,
            iconBg: 'rgba(245,158,11,0.09)', iconColor: '#F59E0B',
            label: 'Active Sessions',
            value: '248',
            sub: '🟢 Active Now', subColor: '#16A34A'
        },
        {
            icon: <Server size={22} />,
            iconBg: 'rgba(139,92,246,0.09)', iconColor: '#8B5CF6',
            label: 'DNS Queries',
            value: dnsStats.totalQueries ? dnsStats.totalQueries.toLocaleString() : '8.2M',
            sub: `${dnsStats.blockedQueries || 0} Blocked`, subColor: '#2563EB'
        }
    ];

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', overflowY: 'auto', flex: 1 }}>

            {/* ── Stat Cards ───────────────────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '18px',
                marginBottom: '24px'
            }}>
                {statCards.map((c, i) => (
                    <div key={i} className="section-card" style={{
                        padding: '22px 24px', background: '#FFF',
                        display: 'flex', alignItems: 'center', gap: '18px'
                    }}>
                        <div style={{
                            width: 50, height: 50, borderRadius: '50%',
                            background: c.iconBg, color: c.iconColor,
                            display: 'grid', placeItems: 'center', flexShrink: 0
                        }}>
                            {c.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>{c.label}</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: '3px 0 2px', lineHeight: 1.1 }}>{c.value}</div>
                            <div style={{ fontSize: 12, color: c.subColor, fontWeight: 700 }}>{c.sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Middle: Traffic Table + Right Widgets ────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 340px',
                gap: '18px',
                marginBottom: '24px',
                alignItems: 'start'
            }}>
                {/* Live Traffic Table */}
                <div className="section-card" style={{ padding: '22px 24px', background: '#FFF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0 }}>Live Traffic Logs</h4>
                        <Link to="/logs-history" style={{ fontSize: 12, color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>View History →</Link>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                    {['Action', 'Destination / IP', 'Source Client', 'Category'].map(h => (
                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {liveTraffic.length > 0 ? (
                                    liveTraffic.map((log, i) => {
                                        const isBlocked = log.method === 'BLOCK';
                                        const isHttps = log.method === 'CONNECT';
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(15,23,42,0.04)' }}>
                                                <td style={{ padding: '11px 12px' }}>
                                                    <span className={`badge badge-${isBlocked ? 'blocked' : isHttps ? 'info' : 'success'}`}>
                                                        {isBlocked ? 'BLOCKED' : isHttps ? 'CONNECT' : log.method}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '11px 12px', fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.url}>
                                                    {getFlagEmoji(log.url)} {log.url}
                                                </td>
                                                <td style={{ padding: '11px 12px', color: '#64748B', fontFamily: 'monospace', fontSize: 12 }}>{log.ip}</td>
                                                <td style={{ padding: '11px 12px' }}>
                                                    <span className={`badge ${isBlocked ? 'badge-blocked' : 'badge-info'}`}>
                                                        {isBlocked ? 'Threat/Malicious' : isHttps ? 'Secure SSL' : 'Allowed'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <>
                                        {[
                                            { badge: 'badge-success', label: 'GET', url: '🇮🇳 google.com', ip: '127.0.0.1', cat: 'badge-info', catLabel: 'Web Search' },
                                            { badge: 'badge-info', label: 'CONNECT', url: '🇺🇸 microsoft.com', ip: '192.168.1.45', cat: 'badge-info', catLabel: 'Secure SSL' },
                                            { badge: 'badge-blocked', label: 'BLOCKED', url: '🇸🇬 track.malicious.net', ip: '192.168.1.92', cat: 'badge-blocked', catLabel: 'Malware Domains' },
                                        ].map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid rgba(15,23,42,0.04)' }}>
                                                <td style={{ padding: '11px 12px' }}><span className={`badge ${r.badge}`}>{r.label}</span></td>
                                                <td style={{ padding: '11px 12px', fontWeight: 600 }}>{r.url}</td>
                                                <td style={{ padding: '11px 12px', color: '#64748B', fontFamily: 'monospace', fontSize: 12 }}>{r.ip}</td>
                                                <td style={{ padding: '11px 12px' }}><span className={`badge ${r.cat}`}>{r.catLabel}</span></td>
                                            </tr>
                                        ))}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Request Rate Chart */}
                    <div className="section-card" style={{ padding: '22px 24px', background: '#FFF' }}>
                        <h4 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 14, marginTop: 0 }}>Request Rate (per min)</h4>
                        <svg viewBox="0 0 300 120" style={{ width: '100%', height: 'auto', display: 'block' }}>
                            <line x1="20" y1="20" x2="290" y2="20" stroke="#F1F5F9" strokeWidth="1" />
                            <line x1="20" y1="50" x2="290" y2="50" stroke="#F1F5F9" strokeWidth="1" />
                            <line x1="20" y1="80" x2="290" y2="80" stroke="#F1F5F9" strokeWidth="1" />
                            <line x1="20" y1="110" x2="290" y2="110" stroke="#E2E8F0" strokeWidth="1" />
                            <text x="290" y="118" fill="#94A3B8" fontSize="8" textAnchor="end">Now</text>
                            <text x="20" y="118" fill="#94A3B8" fontSize="8">5m ago</text>
                            <path d="M 20 80 Q 70 30 110 60 T 200 20 T 290 50 L 290 110 L 20 110 Z" fill="rgba(37,99,235,0.06)" />
                            <path d="M 20 80 Q 70 30 110 60 T 200 20 T 290 50" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
                            <circle cx="200" cy="20" r="4" fill="#2563EB" stroke="#FFF" strokeWidth="1.5" />
                        </svg>
                    </div>

                    {/* System Info */}
                    <div className="section-card" style={{ padding: '22px 24px', background: '#FFF' }}>
                        <h4 style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 14, marginTop: 0 }}>System Information</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13 }}>
                            {[
                                { label: 'Firmware Status', value: '🟢 Active / Healthy', valueColor: '#16A34A' },
                                { label: 'Uptime', value: '18 Days, 4 Hours', valueColor: '#111827' },
                                { label: 'Memory / Storage', value: '34% / 58%', valueColor: '#111827' },
                                { label: 'Throughput', value: '1.8 Gbps', valueColor: '#111827' },
                                { label: 'License Type', value: 'Enterprise NGFW', valueColor: '#2563EB' },
                                { label: 'Product Version', value: 'v1.0.2', valueColor: '#111827' },
                            ].map((row, i, arr) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    borderBottom: i < arr.length - 1 ? '1px solid rgba(15,23,42,0.05)' : 'none',
                                    paddingBottom: i < arr.length - 1 ? 8 : 0
                                }}>
                                    <span style={{ color: '#64748B' }}>{row.label}</span>
                                    <span style={{ color: row.valueColor, fontWeight: 700 }}>{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Bottom: Recent Security Events ──────────── */}
            <div className="section-card" style={{ padding: '22px 24px', background: '#FFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0 }}>Recent Security Events</h4>
                    <Link to="/audit-history" style={{ fontSize: 12, color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>View All →</Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {events.map((evt, idx) => {
                        const IconComp = evt.icon;
                        const isBlocked = evt.type === 'blocked';
                        const isWarning = evt.type === 'warning';
                        return (
                            <div key={idx} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: '#F8FAFC', padding: '11px 16px', borderRadius: 8, fontSize: 13,
                                border: '1px solid rgba(15,23,42,0.04)',
                                borderLeft: `3px solid ${isBlocked ? '#DC2626' : isWarning ? '#F59E0B' : '#16A34A'}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <IconComp size={15} style={{ color: evt.iconColor, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 600, color: '#111827' }}>{evt.label}</span>
                                </div>
                                <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: 11, flexShrink: 0 }}>{evt.time}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}
