import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Server, Cpu, Globe, Search, ChevronLeft, ChevronRight, Plus, Shield, Zap, Activity } from 'lucide-react';

export default function Dns() {
    const [stats, setStats] = useState({ totalQueries: 0, blockedQueries: 0, enabled: true });
    const [queries, setQueries] = useState([]);
    const [selectedTab, setSelectedTab] = useState('upstreams');
    const [currentUser, setCurrentUser] = useState({});

    const [dnsConfig, setDnsConfig] = useState({ selectedUpstreams: [], customUpstreams: [] });
    const [upstreamSearch, setUpstreamSearch] = useState('');
    const [upstreamCountry, setUpstreamCountry] = useState('');
    const [upstreamPage, setUpstreamPage] = useState(1);
    const [upstreamData, setUpstreamData] = useState({ items: [], totalPages: 1, countries: [] });
    const [customIp, setCustomIp] = useState('');
    const [policyConfig, setPolicyConfig] = useState({ assignments: [] });
    const [adaptiveList, setAdaptiveList] = useState([]);

    const getHeaders = () => {
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        return { 'x-user': username, 'x-session-id': sessionId };
    };

    const loadStats = async () => {
        try { const res = await fetch('/api/dns/stats', { headers: getHeaders() }); setStats(await res.json()); } catch (e) {}
    };
    const loadDnsConfig = async () => {
        try { const res = await fetch('/api/dns/config', { headers: getHeaders() }); setDnsConfig(await res.json()); } catch (e) {}
    };
    const loadUpstreams = async () => {
        try {
            const res = await fetch(`/api/dns/upstreams?search=${encodeURIComponent(upstreamSearch)}&country=${encodeURIComponent(upstreamCountry)}&page=${upstreamPage}&limit=12`, { headers: getHeaders() });
            setUpstreamData(await res.json());
        } catch (e) {}
    };
    const loadPolicies = async () => {
        if (currentUser.role !== 'admin') return;
        try { const res = await fetch('/api/dns/policies', { headers: getHeaders() }); setPolicyConfig(await res.json()); } catch (e) {}
    };
    const loadAdaptive = async () => {
        if (currentUser.role !== 'admin') return;
        try { const res = await fetch('/api/dns/adaptive/suggestions', { headers: getHeaders() }); const d = await res.json(); setAdaptiveList(d.suggestions || []); } catch (e) {}
    };

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
        fetch('/api/audit/page-view', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ page: 'DNS Dashboard' }) }).catch(() => {});
        const socket = io();
        socket.on('dns_query', (query) => {
            setQueries(prev => {
                const isDup = prev.some(q => q.timestamp === query.timestamp && q.domain === query.domain);
                if (isDup) return prev;
                return [query, ...prev].slice(0, 100);
            });
            loadStats();
        });
        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        if (currentUser.username) { loadStats(); loadDnsConfig(); loadUpstreams(); loadPolicies(); loadAdaptive(); }
    }, [currentUser, upstreamSearch, upstreamCountry, upstreamPage]);

    const handleToggleUpstream = async (ip, selected) => {
        await fetch('/api/dns/upstreams/select', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ ip, selected }) });
        loadDnsConfig(); loadUpstreams();
    };
    const handleAddCustomIp = async (e) => {
        e.preventDefault();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(customIp)) { alert('Invalid IP format (e.g. 1.1.1.1)'); return; }
        const res = await fetch('/api/dns/upstreams/add', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ ip: customIp }) });
        if (res.ok) { setCustomIp(''); loadDnsConfig(); loadUpstreams(); }
    };
    const handleRemoveCustomIp = async (ip) => {
        await fetch('/api/dns/upstreams/remove', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ ip }) });
        loadDnsConfig(); loadUpstreams();
    };
    const handleAddPolicy = async () => {
        const mac = prompt('Client MAC Address (e.g. aa:bb:cc:dd:ee:ff)'); if (!mac) return;
        const mode = prompt('Mode (kids/guest/work)', 'guest') || 'guest';
        const privacy = confirm('Enable privacy shield for this client?');
        const newAssignments = [...(policyConfig.assignments || [])];
        newAssignments.push({ mac: mac.trim().toLowerCase(), mode, schedule: [], privacyShield: privacy });
        const updated = { ...policyConfig, assignments: newAssignments };
        const res = await fetch('/api/dns/policies', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify(updated) });
        if (res.ok) loadPolicies();
    };
    const handleEditPolicy = async (mac) => {
        const assignment = (policyConfig.assignments || []).find(p => p.mac === mac); if (!assignment) return;
        const mode = prompt('Mode (kids/guest/work)', assignment.mode) || assignment.mode;
        const privacy = confirm('Enable privacy shield for this client?');
        const newAssignments = (policyConfig.assignments || []).map(p => p.mac === mac ? { ...p, mode, privacyShield: privacy } : p);
        const updated = { ...policyConfig, assignments: newAssignments };
        const res = await fetch('/api/dns/policies', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify(updated) });
        if (res.ok) loadPolicies();
    };
    const handleAcceptAdaptive = async (domain) => {
        await fetch('/api/dns/adaptive/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ domain }) });
        loadAdaptive();
    };
    const handleDismissAdaptive = async (domain) => {
        await fetch('/api/dns/adaptive/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ domain }) });
        loadAdaptive();
    };

    const allowedQs = stats.totalQueries ? Math.max(stats.totalQueries - (stats.blockedQueries || 0), 0) : 0;
    const blockedPct = stats.totalQueries ? Math.max(((stats.blockedQueries || 0) / stats.totalQueries) * 100, 2) : 2;
    const allowedPct = stats.totalQueries ? Math.max((allowedQs / stats.totalQueries) * 100, 10) : 98;

    const tabStyle = (t) => ({
        flex: 1, padding: '11px 8px', background: 'transparent', border: 'none',
        borderBottom: selectedTab === t ? '2px solid #2563EB' : '2px solid transparent',
        color: selectedTab === t ? '#2563EB' : '#64748B',
        fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', borderRadius: 0,
        transition: 'color .15s'
    });

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Globe size={22} color="#2563EB" />
                        DNS Resolver
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '13px', marginTop: '4px' }}>Query monitoring & content filtering engine</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                        padding: '6px 14px', borderRadius: '50px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
                        background: stats.enabled ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
                        color: stats.enabled ? '#10B981' : '#EF4444',
                        border: stats.enabled ? '1px solid rgba(16,185,129,.25)' : '1px solid rgba(239,68,68,.25)',
                        display: 'flex', alignItems: 'center', gap: '6px'
                    }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: stats.enabled ? '#10B981' : '#EF4444', display: 'inline-block', animation: stats.enabled ? 'pulse 2s infinite' : 'none' }}></span>
                        {stats.enabled ? 'Resolver Active' : 'Offline'}
                    </span>
                    <Link to="/blocklist" className="btn" style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={14} /> Edit Blocklist
                    </Link>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
                {[
                    { icon: <Activity size={18} color="#2563EB"/>, label: 'Total Queries', value: (stats.totalQueries || 0).toLocaleString(), color: '#2563EB', bg: 'rgba(37,99,235,.08)' },
                    { icon: <Shield size={18} color="#10B981"/>, label: 'Resolved', value: allowedQs.toLocaleString(), color: '#10B981', bg: 'rgba(16,185,129,.08)' },
                    { icon: <Zap size={18} color="#EF4444"/>, label: 'Blocked', value: (stats.blockedQueries || 0).toLocaleString(), color: '#EF4444', bg: 'rgba(239,68,68,.08)' },
                ].map((s, i) => (
                    <div key={i} className="section-card" style={{ background: '#FFF', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{s.icon}</div>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '20px', alignItems: 'start' }}>
                
                {/* LEFT: Config Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Active Servers Card */}
                    <div className="section-card" style={{ background: '#FFF', padding: '20px' }}>
                        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Server size={14} color="#2563EB" /> Active DNS Servers
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                            {([...new Set([...(dnsConfig.activeUpstreams || []), ...(dnsConfig.selectedUpstreams || []), '8.8.8.8', '1.1.1.1', '9.9.9.9'])]).slice(0, 3).map((ip, idx) => (
                                <div key={idx} style={{ background: '#F8FAFC', padding: '12px', borderRadius: 8, border: '1px solid #E2E8F0', textAlign: 'center' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', fontFamily: 'monospace' }}>{ip}</div>
                                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>Active</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Query Distribution</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>
                                        <span>Resolved</span><span style={{ color: '#10B981' }}>{allowedQs.toLocaleString()}</span>
                                    </div>
                                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${allowedPct}%`, background: 'linear-gradient(90deg,#10B981,#34D399)', borderRadius: 10 }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 5 }}>
                                        <span>Blocked</span><span style={{ color: '#EF4444' }}>{(stats.blockedQueries || 0).toLocaleString()}</span>
                                    </div>
                                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${blockedPct}%`, background: 'linear-gradient(90deg,#EF4444,#F87171)', borderRadius: 10 }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabbed Settings */}
                    <div className="section-card" style={{ background: '#FFF', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
                            <button onClick={() => setSelectedTab('upstreams')} style={tabStyle('upstreams')}>Upstream Servers</button>
                            {currentUser.role === 'admin' && (
                                <>
                                    <button onClick={() => setSelectedTab('policies')} style={tabStyle('policies')}>Client Policies</button>
                                    <button onClick={() => setSelectedTab('adaptive')} style={tabStyle('adaptive')}>Heuristics</button>
                                </>
                            )}
                        </div>

                        <div style={{ padding: '18px', flex: 1, overflowY: 'auto' }}>
                            {selectedTab === 'upstreams' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {currentUser.role === 'admin' && (
                                        <form onSubmit={handleAddCustomIp} style={{ display: 'flex', gap: 8 }}>
                                            <input type="text" placeholder="Add custom DNS IP (e.g. 8.8.4.4)" value={customIp} onChange={(e) => setCustomIp(e.target.value)} style={{ flex: 1, padding: '8px 12px', fontSize: 13 }} />
                                            <button type="submit" className="btn-accent" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> Add</button>
                                        </form>
                                    )}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                            <input type="text" placeholder="Search nameservers..." value={upstreamSearch} onChange={(e) => setUpstreamSearch(e.target.value)} style={{ width: '100%', padding: '8px 12px 8px 30px', fontSize: 13, boxSizing: 'border-box' }} />
                                        </div>
                                        <select value={upstreamCountry} onChange={(e) => setUpstreamCountry(e.target.value)} style={{ width: '110px', padding: '8px 10px', fontSize: 13 }}>
                                            <option value="">Country</option>
                                            {(upstreamData.countries || []).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {(upstreamData.items || []).map((n, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                                                <input type="checkbox" checked={(dnsConfig.selectedUpstreams || []).includes(n.ip)} onChange={(e) => handleToggleUpstream(n.ip, e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2563EB' }} disabled={currentUser.role !== 'admin'} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', fontFamily: 'monospace' }}>{n.ip}</div>
                                                    <div style={{ fontSize: 11, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.org || 'Provider'}</div>
                                                </div>
                                                {n.dnssec && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#D97706', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>DNSSEC</span>}
                                                <span style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>{(n.reliability * 100).toFixed(0)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <button onClick={() => setUpstreamPage(p => Math.max(p - 1, 1))} disabled={upstreamPage <= 1} className="btn" style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={14} /> Prev</button>
                                        <span style={{ fontSize: 12, color: '#64748B' }}>Page {upstreamPage} / {upstreamData.totalPages || 1}</span>
                                        <button onClick={() => setUpstreamPage(p => Math.min(p + 1, upstreamData.totalPages))} disabled={upstreamPage >= upstreamData.totalPages} className="btn" style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>Next <ChevronRight size={14} /></button>
                                    </div>
                                </div>
                            )}

                            {selectedTab === 'policies' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <h5 style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Client Policy Rules</h5>
                                        <button onClick={handleAddPolicy} className="btn-accent" style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Add Policy</button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {(policyConfig.assignments || []).map((p, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', fontFamily: 'monospace' }}>{p.mac}</div>
                                                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                                        Mode: <span style={{ color: '#2563EB', fontWeight: 700 }}>{p.mode}</span> · {p.privacyShield ? '🔒 Privacy Shield' : 'Standard'}
                                                    </div>
                                                </div>
                                                <button onClick={() => handleEditPolicy(p.mac)} className="btn" style={{ padding: '5px 10px', fontSize: 12 }}>Edit</button>
                                            </div>
                                        ))}
                                        {(policyConfig.assignments || []).length === 0 && (
                                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 30, fontSize: 13 }}>No client policies configured</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {selectedTab === 'adaptive' && (
                                <div>
                                    <h5 style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Heuristic Anomaly Detections</h5>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {adaptiveList.length === 0 ? (
                                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 30, fontSize: 13 }}>No anomaly suggestions detected</div>
                                        ) : adaptiveList.slice(0, 6).map((item, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,.15)', background: 'rgba(239,68,68,.04)' }}>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{item.domain}</div>
                                                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                                                        Pattern: <span style={{ color: '#EF4444' }}>{item.reasons.join(', ')}</span> · Score {item.score}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button onClick={() => handleAcceptAdaptive(item.domain)} className="btn-accent" style={{ padding: '4px 10px', fontSize: 12 }}>Block</button>
                                                    <button onClick={() => handleDismissAdaptive(item.domain)} className="btn" style={{ padding: '4px 10px', fontSize: 12 }}>Dismiss</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT: Live DNS Queries */}
                <div className="section-card" style={{ display: 'flex', flexDirection: 'column', background: '#FFF', minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFBFC' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Cpu size={15} color="#2563EB" />
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Live DNS Queries</span>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
                        </div>
                        <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>{queries.length} entries</span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                        {queries.length === 0 ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: '50px 20px', fontSize: 13 }}>
                                <Activity size={32} style={{ margin: '0 auto 10px', opacity: .4 }} />
                                Waiting for DNS query stream...
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {queries.map((q, idx) => {
                                    const isBlocked = q.status === 'BLOCKED' || q.status === 'POLICY_BLOCKED';
                                    return (
                                        <div key={idx} style={{
                                            display: 'grid', gridTemplateColumns: '70px 44px 1fr 76px',
                                            alignItems: 'center', padding: '8px 10px', borderRadius: 7, fontSize: 12, fontFamily: 'monospace',
                                            background: isBlocked ? 'rgba(239,68,68,.05)' : '#FAFBFC',
                                            border: `1px solid ${isBlocked ? 'rgba(239,68,68,.12)' : '#EFF3F7'}`,
                                            transition: 'background .15s'
                                        }}>
                                            <span style={{ color: '#94A3B8', fontSize: 11 }}>
                                                {q.timestamp ? new Date(q.timestamp).toLocaleTimeString('en-US', { hour12: false }) : new Date().toLocaleTimeString('en-US', { hour12: false })}
                                            </span>
                                            <span style={{ fontWeight: 700, color: q.recordType === 'A' ? '#2563EB' : '#8B5CF6', fontSize: 11 }}>{q.recordType}</span>
                                            <span style={{ color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }} title={q.domain}>{q.domain}</span>
                                            <span style={{ textAlign: 'right', fontWeight: 700, fontSize: 11, color: isBlocked ? '#EF4444' : '#10B981' }}>
                                                {isBlocked ? 'BLOCKED' : 'OK'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Timeline Chart */}
            <div className="section-card" style={{ background: '#FFF', padding: '18px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={14} color="#2563EB" /> DNS Queries Timeline
                </div>
                <svg viewBox="0 0 800 100" style={{ width: '100%', height: 'auto', display: 'block' }}>
                    <line x1="0" y1="20" x2="800" y2="20" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="55" x2="800" y2="55" stroke="#F1F5F9" strokeWidth="1" />
                    <line x1="0" y1="90" x2="800" y2="90" stroke="#E2E8F0" strokeWidth="1" />
                    <text x="796" y="100" fill="#94A3B8" fontSize="9" textAnchor="end">Now</text>
                    <text x="4" y="100" fill="#94A3B8" fontSize="9">10m ago</text>
                    <defs>
                        <linearGradient id="dnsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.15" />
                            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path d="M 0 85 Q 100 35 200 75 T 400 25 T 600 80 T 800 35 L 800 90 L 0 90 Z" fill="url(#dnsGrad)" />
                    <path d="M 0 85 Q 100 35 200 75 T 400 25 T 600 80 T 800 35" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="400" cy="25" r="4" fill="#2563EB" stroke="#FFF" strokeWidth="2" />
                </svg>
            </div>
        </div>
    );
}
