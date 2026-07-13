import React, { useState, useEffect } from 'react';
import { Lock, Search, Trash2, AlertTriangle, CheckCircle, CalendarDays } from 'lucide-react';

export default function CertLogs() {
    const [allLogs, setAllLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [dayTabs, setDayTabs] = useState([]);
    const [selectedDay, setSelectedDay] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [currentUser, setCurrentUser] = useState({});
    const [loading, setLoading] = useState(false);

    const getHeaders = () => {
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        return { 'x-user': username, 'x-session-id': sessionId };
    };

    const loadCertLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/cert/logs?limit=10000', { headers: getHeaders() });
            const data = await res.json();
            const logs = data.logs || [];
            setAllLogs(logs);
            const dayMap = new Map();
            logs.forEach(log => {
                const timestampStr = log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T') + 'Z';
                const dateStr = new Date(timestampStr).toLocaleDateString();
                if (!dayMap.has(dateStr)) dayMap.set(dateStr, []);
                dayMap.get(dateStr).push(log);
            });
            const sortedDays = Array.from(dayMap.entries()).map(([date, items]) => ({ date, count: items.length })).sort((a, b) => new Date(b.date) - new Date(a.date));
            setDayTabs(sortedDays);
        } catch (e) { console.error('Failed to load cert logs:', e); }
        setLoading(false);
    };

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
        fetch('/api/audit/page-view', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ page: 'Certificate Logs' }) }).catch(() => {});
    }, []);

    useEffect(() => { if (currentUser.username) loadCertLogs(); }, [currentUser]);

    useEffect(() => {
        let temp = [...allLogs];
        if (selectedDay !== 'all') {
            temp = temp.filter(log => { const ts = log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T') + 'Z'; return new Date(ts).toLocaleDateString() === selectedDay; });
        }
        if (searchTerm.trim()) {
            const query = searchTerm.toLowerCase();
            temp = temp.filter(log => (log.hostname || '').toLowerCase().includes(query) || (log.issuer || '').toLowerCase().includes(query) || (log.client_ip || '').toLowerCase().includes(query));
        }
        setFilteredLogs(temp);
    }, [allLogs, selectedDay, searchTerm]);

    const handleDeleteLog = async (logId) => {
        if (!confirm('Delete this certificate log?')) return;
        try { await fetch('/api/cert/logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ logId }) }); loadCertLogs(); } catch (e) {}
    };
    const handleClearAll = async () => {
        if (!confirm('Clear all certificate logs?')) return;
        try { await fetch('/api/cert/logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ logType: 'all' }) }); loadCertLogs(); } catch (e) {}
    };

    const itemsPerPage = 50;
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
    const paginatedLogs = filteredLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const todayStr = new Date().toLocaleDateString();

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Lock size={20} color="#2563EB" /> Certificate History
                    </h1>
                    <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Dynamically generated SSL/TLS certificate log inventory</p>
                </div>
                {currentUser.role === 'admin' && (
                    <button onClick={handleClearAll} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13, color: '#EF4444', border: '1px solid rgba(239,68,68,.25)' }}>
                        <Trash2 size={14} /> Wipe Cert Logs
                    </button>
                )}
            </div>

            {/* Day Filter Pills */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                <button onClick={() => { setSelectedDay('all'); setPage(1); }} style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 10, border: `1px solid ${selectedDay === 'all' ? '#2563EB' : '#E2E8F0'}`, background: selectedDay === 'all' ? '#2563EB' : '#FFF', color: selectedDay === 'all' ? '#FFF' : '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalendarDays size={13} /> All Days <span style={{ opacity: .75 }}>({allLogs.length})</span>
                </button>
                {dayTabs.map((day, idx) => {
                    const isToday = day.date === todayStr;
                    const isActive = selectedDay === day.date;
                    return (
                        <button key={idx} onClick={() => { setSelectedDay(day.date); setPage(1); }} style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 10, border: `1px solid ${isActive ? '#2563EB' : isToday ? 'rgba(16,185,129,.3)' : '#E2E8F0'}`, background: isActive ? '#2563EB' : '#FFF', color: isActive ? '#FFF' : '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                            {isToday ? '🟢 Today' : day.date} <span style={{ opacity: .7, marginLeft: 4 }}>({day.count})</span>
                        </button>
                    );
                })}
            </div>

            {/* Cert Table */}
            <div className="section-card" style={{ background: '#FFF', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                        Certificate Inventory
                        <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 8, fontWeight: 500 }}>({filteredLogs.length} entries)</span>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                        <input type="text" placeholder="Search hostname, issuer, IP..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} style={{ padding: '7px 12px 7px 30px', fontSize: 12, width: 240, boxSizing: 'border-box' }} />
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ color: '#94A3B8', textAlign: 'center', padding: 60, fontSize: 13 }}>Loading certificate inventory...</div>
                    ) : paginatedLogs.length === 0 ? (
                        <div style={{ color: '#94A3B8', textAlign: 'center', padding: 60, fontSize: 13 }}>
                            <Lock size={32} style={{ margin: '0 auto 10px', opacity: .3 }} />
                            No certificate logs found
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
                                    {['Hostname', 'Client IP', 'Issuer Certificate', 'Status', 'Expiry', ...(currentUser.role === 'admin' ? [''] : [])].map((h, i) => (
                                        <th key={i} style={{ padding: '11px 18px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedLogs.map((log, idx) => {
                                    const timeStr = log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T') + 'Z';
                                    const createdDate = new Date(timeStr);
                                    const expiryDate = new Date(createdDate.getTime() + 90 * 24 * 60 * 60 * 1000);
                                    const isWarning = expiryDate - new Date() < 10 * 24 * 60 * 60 * 1000;
                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid #F8FAFC', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background='#FAFBFC'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                            <td style={{ padding: '12px 18px', fontWeight: 700, color: '#1E293B' }}>{log.hostname}</td>
                                            <td style={{ padding: '12px 18px', color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>{log.client_ip}</td>
                                            <td style={{ padding: '12px 18px', color: '#64748B', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.issuer || 'SentinelProxy Local CA'}>{log.issuer || 'SentinelProxy Local CA'}</td>
                                            <td style={{ padding: '12px 18px' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700, background: isWarning ? '#FEF9C3' : '#DCFCE7', color: isWarning ? '#CA8A04' : '#16A34A' }}>
                                                    {isWarning ? <AlertTriangle size={11} /> : <CheckCircle size={11} />}
                                                    {isWarning ? 'Expiring' : 'Valid'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 18px', color: '#475569', fontSize: 12, fontFamily: 'monospace' }}>{expiryDate.toLocaleDateString()}</td>
                                            {currentUser.role === 'admin' && (
                                                <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                                                    <button onClick={() => handleDeleteLog(log.id)} className="btn" style={{ padding: '5px', border: 'none', background: 'transparent', color: '#EF4444' }} title="Revoke">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid #F1F5F9', background: '#FAFBFC' }}>
                    <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page <= 1} className="btn" style={{ padding: '6px 12px', fontSize: 12 }}>Prev</button>
                    <span style={{ fontSize: 12, color: '#64748B' }}>Page {page} of {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page >= totalPages} className="btn" style={{ padding: '6px 12px', fontSize: 12 }}>Next</button>
                </div>
            </div>
        </div>
    );
}
