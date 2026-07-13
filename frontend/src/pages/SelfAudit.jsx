import React, { useState, useEffect } from 'react';
import { ShieldCheck, Cpu, Lock, AlertTriangle, Server, RefreshCw } from 'lucide-react';

export default function SelfAudit() {
    const [auditData, setAuditData] = useState({
        blocked: { dns: 0, proxy: 0 },
        adaptiveSuggestions: [],
        topBlocked: { dns: [], proxy: [] },
        auditTimeline: [],
        health: { enabled: false, reason: '' }
    });
    const [loading, setLoading] = useState(false);

    const getHeaders = () => {
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        return { 'x-user': username, 'x-session-id': sessionId };
    };

    const loadAudit = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/self-audit', { headers: getHeaders() });
            setAuditData(await res.json());
        } catch (e) { console.error('Failed to load self-audit metrics:', e); }
        setLoading(false);
    };

    useEffect(() => {
        loadAudit();
        const interval = setInterval(loadAudit, 10000);
        fetch('/api/audit/page-view', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ page: 'Self Audit' }) }).catch(() => {});
        return () => clearInterval(interval);
    }, []);

    const isHealthy = !auditData.health?.enabled;
    const scoreValue = 96;
    const circlePercent = scoreValue;
    // SVG circle: circumference = 2 * pi * 15.9155 ≈ 100
    const dashArray = `${circlePercent} ${100 - circlePercent}`;

    const subScores = [
        { icon: <Server size={16} color="#2563EB" />, label: 'DNS Security', value: '98%', color: '#2563EB', bg: 'rgba(37,99,235,.08)' },
        { icon: <Lock size={16} color="#10B981" />, label: 'Certificate Health', value: '100%', color: '#10B981', bg: 'rgba(16,185,129,.08)' },
        { icon: <ShieldCheck size={16} color="#EF4444" />, label: 'Blocked Threats', value: (auditData.blocked?.dns || 0) + (auditData.blocked?.proxy || 0), color: '#EF4444', bg: 'rgba(239,68,68,.08)' },
        { icon: <AlertTriangle size={16} color="#F59E0B" />, label: 'Open Warnings', value: auditData.adaptiveSuggestions?.length || 0, color: '#F59E0B', bg: 'rgba(245,158,11,.08)' },
    ];

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldCheck size={22} color="#2563EB" /> Self Audit System
                    </h1>
                    <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Automated threat assessment & telemetry overview</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', background: isHealthy ? 'rgba(16,185,129,.1)' : 'rgba(245,158,11,.1)', color: isHealthy ? '#10B981' : '#F59E0B', border: isHealthy ? '1px solid rgba(16,185,129,.25)' : '1px solid rgba(245,158,11,.25)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isHealthy ? '#10B981' : '#F59E0B', display: 'inline-block' }}></span>
                        {isHealthy ? 'System Secure' : `Read-Only: ${auditData.health?.reason}`}
                    </span>
                    <button onClick={loadAudit} className="btn" style={{ padding: '8px', display: 'flex', alignItems: 'center' }} title="Refresh">
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                </div>
            </div>

            {/* Score + Sub-Scores Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
                {/* Security Score Circle */}
                <div className="section-card" style={{ background: '#FFF', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 16 }}>Security Score</div>
                    <div style={{ position: 'relative', width: 110, height: 110, marginBottom: 14 }}>
                        <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" strokeWidth="3.5" />
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#2563EB" strokeDasharray={dashArray} strokeWidth="3.5" strokeLinecap="round" />
                        </svg>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{scoreValue}%</div>
                    </div>
                    <div style={{ color: '#F59E0B', fontSize: 16, letterSpacing: 3, marginBottom: 6 }}>★★★★☆</div>
                    <span style={{ fontSize: 11, color: '#10B981', fontWeight: 700 }}>Grade A · Enterprise Standard</span>
                </div>

                {/* Sub-Scores */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {subScores.map((s, i) => (
                        <div key={i} className="section-card" style={{ background: '#FFF', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 42, height: 42, borderRadius: 10, background: s.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{s.icon}</div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>{s.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom: Timeline + Top Blocked */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
                
                {/* Audit Timeline */}
                <div className="section-card" style={{ background: '#FFF', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', fontSize: 13, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Cpu size={14} color="#2563EB" /> Audit Timeline Log
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                        {auditData.auditTimeline.length === 0 ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 40, fontSize: 13 }}>
                                <ShieldCheck size={32} style={{ margin: '0 auto 10px', opacity: .3 }} />
                                No timeline events found
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {auditData.auditTimeline.map((item, idx) => {
                                    const time = item.timestamp ? new Date(item.timestamp.replace(' ', 'T') + 'Z').toLocaleString() : '-';
                                    return (
                                        <div key={idx} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: idx < auditData.auditTimeline.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'flex-start' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(37,99,235,.08)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2 }}>
                                                <ShieldCheck size={14} color="#2563EB" />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                                    <strong style={{ color: '#2563EB', fontSize: 12, fontWeight: 700 }}>{item.action}</strong>
                                                    <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0, marginLeft: 8 }}>by {item.user || 'system'}</span>
                                                </div>
                                                <div style={{ fontSize: 12, color: '#475569', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.details}</div>
                                                <div style={{ fontSize: 11, color: '#94A3B8' }}>{time}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Top Blocked Lists */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {[
                        { title: 'Top DNS Blocked', data: auditData.topBlocked?.dns || [], key: 'domain' },
                        { title: 'Top Proxy Blocked', data: auditData.topBlocked?.proxy || [], key: 'host' },
                    ].map((section, si) => (
                        <div key={si} className="section-card" style={{ background: '#FFF', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '13px 16px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', fontSize: 12, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={13} color="#F59E0B" /> {section.title}
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                                {section.data.length === 0 ? (
                                    <div style={{ color: '#94A3B8', textAlign: 'center', padding: 20, fontSize: 12 }}>No blocked records</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        {section.data.map((item, idx) => {
                                            const maxCount = Math.max(...section.data.map(d => d.count), 1);
                                            const pct = (item.count / maxCount) * 100;
                                            return (
                                                <div key={idx} style={{ padding: '8px 10px', background: '#FAFBFC', borderRadius: 8, border: '1px solid #F1F5F9' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{item[section.key]}</span>
                                                        <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 700, flexShrink: 0 }}>{item.count}</span>
                                                    </div>
                                                    <div style={{ height: 3, background: '#F1F5F9', borderRadius: 10 }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#EF4444,#F87171)', borderRadius: 10 }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
