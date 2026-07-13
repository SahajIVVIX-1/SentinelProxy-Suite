import React, { useState, useEffect } from 'react';
import { History, Search, Trash2, Filter, Clock, Calendar, CalendarDays } from 'lucide-react';

export default function LogsHistory() {
    const [service, setService] = useState('all');
    const [timeframe, setTimeframe] = useState('today');
    const [logs, setLogs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentUser, setCurrentUser] = useState({});
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);

    const getHeaders = () => {
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        return { 'x-user': username, 'x-session-id': sessionId };
    };

    const loadAllHistoryLogs = async () => {
        setLoading(true);
        try {
            const logType = service === 'all' ? '' : service;
            const res = await fetch(`/api/traffic/logs?page=1&limit=3000&type=${logType}`, { headers: getHeaders() });
            const data = await res.json();
            setLogs(data.logs || []);
        } catch (e) { console.error('Failed to load history logs:', e); }
        setLoading(false);
    };

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
        fetch('/api/audit/page-view', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ page: 'Traffic History' }) }).catch(() => {});
    }, []);

    useEffect(() => { if (currentUser.username) { loadAllHistoryLogs(); setPage(1); } }, [currentUser, service]);

    const handleClearAll = async () => {
        if (!confirm(`Clear all ${service === 'all' ? 'traffic' : service.toUpperCase()} logs permanently?`)) return;
        try {
            const logType = service === 'all' ? '' : service;
            await fetch('/api/traffic/logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ logType }) });
            setLogs([]); setPage(1);
        } catch (e) { console.error('Failed to clear logs:', e); }
    };

    const getFilteredLogs = () => {
        let temp = [...logs];
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - 86400000;
        const startOf7Days = startOfToday - 7 * 86400000;
        const startOf30Days = startOfToday - 30 * 86400000;

        temp = temp.filter(log => {
            const timeStr = log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T') + 'Z';
            const logTime = new Date(timeStr).getTime();
            if (timeframe === 'today') return logTime >= startOfToday;
            if (timeframe === 'yesterday') return logTime >= startOfYesterday && logTime < startOfToday;
            if (timeframe === '7days') return logTime >= startOf7Days;
            if (timeframe === '30days') return logTime >= startOf30Days;
            return true;
        });

        const query = searchTerm.trim().toLowerCase();
        if (query) {
            temp = temp.filter(log => {
                const target = `${log.url || ''} ${log.host || ''} ${log.domain || ''} ${log.client_ip || ''} ${log.method || ''}`.toLowerCase();
                return target.includes(query);
            });
        }
        return temp;
    };

    const filteredLogs = getFilteredLogs();
    const itemsPerPage = 50;
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
    const paginatedLogs = filteredLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const timeframes = [
        { key: 'today', label: 'Today', icon: <Clock size={13} /> },
        { key: 'yesterday', label: 'Yesterday', icon: <History size={13} /> },
        { key: '7days', label: 'Last 7 Days', icon: <Calendar size={13} /> },
        { key: '30days', label: 'Last Month', icon: <CalendarDays size={13} /> },
    ];

    const getBadge = (log) => {
        const isBlocked = log.method === 'BLOCK';
        const isDns = !log.method;
        if (isBlocked) return { bg: '#FEE2E2', color: '#EF4444', label: 'BLOCKED' };
        if (isDns) return { bg: '#EDE9FE', color: '#7C3AED', label: 'DNS' };
        return { bg: '#D1FAE5', color: '#059669', label: log.method };
    };

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <History size={20} color="#2563EB" /> Traffic History
                    </h1>
                    <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Search and filter historical network traffic records</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {['all', 'proxy', 'dns'].map(s => (
                        <button key={s} onClick={() => setService(s)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${service === s ? '#2563EB' : '#E2E8F0'}`, background: service === s ? '#2563EB' : '#FFF', color: service === s ? '#FFF' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {s === 'all' ? 'All Traffic' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                    {currentUser.role === 'admin' && (
                        <button onClick={handleClearAll} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: '#FFF', color: '#EF4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Trash2 size={14} /> Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Main Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
                
                {/* Left: Timeframe Panel */}
                <div className="section-card" style={{ background: '#FFF', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8, paddingLeft: 6 }}>
                        <Filter size={11} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                        Timeframe
                    </div>
                    {timeframes.map(tf => (
                        <button key={tf.key} onClick={() => { setTimeframe(tf.key); setPage(1); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: timeframe === tf.key ? '#EFF6FF' : 'transparent', color: timeframe === tf.key ? '#2563EB' : '#475569', fontWeight: timeframe === tf.key ? 700 : 500, fontSize: 13, textAlign: 'left', transition: 'all .15s', borderLeft: timeframe === tf.key ? '3px solid #2563EB' : '3px solid transparent' }}>
                            {tf.icon}
                            {tf.label}
                        </button>
                    ))}

                    <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 12, paddingTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8, paddingLeft: 6 }}>Summary</div>
                        <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAFC' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{filteredLogs.length.toLocaleString()}</div>
                            <div style={{ fontSize: 12, color: '#64748B' }}>matching entries</div>
                        </div>
                    </div>
                </div>

                {/* Right: Log Table */}
                <div className="section-card" style={{ background: '#FFF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Log Entries</span>
                        <div style={{ position: 'relative' }}>
                            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                            <input type="text" placeholder="Filter by URL, IP, method..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} style={{ padding: '7px 12px 7px 30px', fontSize: 12, width: 260, boxSizing: 'border-box' }} />
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 60, fontSize: 13 }}>Loading historical logs...</div>
                        ) : paginatedLogs.length === 0 ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 60, fontSize: 13 }}>
                                <History size={32} style={{ margin: '0 auto 10px', opacity: .3 }} />
                                No logs found for this selection
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
                                        {['Time', 'Type', 'Destination', 'Client IP'].map((h, i) => (
                                            <th key={i} style={{ padding: '11px 18px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedLogs.map((log, idx) => {
                                        const timeStr = log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T') + 'Z';
                                        const time = new Date(timeStr).toLocaleString();
                                        const badge = getBadge(log);
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F8FAFC', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background='#FAFBFC'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                <td style={{ padding: '11px 18px', color: '#64748B', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{time}</td>
                                                <td style={{ padding: '11px 18px' }}>
                                                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color }}>{badge.label}</span>
                                                </td>
                                                <td style={{ padding: '11px 18px', fontWeight: 600, color: '#1E293B', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.url || log.domain}>{log.url || log.domain}</td>
                                                <td style={{ padding: '11px 18px', color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>{log.client_ip || log.ip}</td>
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
        </div>
    );
}
