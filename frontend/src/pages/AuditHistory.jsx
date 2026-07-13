import React, { useState, useEffect } from 'react';
import { ClipboardList, RefreshCw, Trash2, Filter, Search } from 'lucide-react';

export default function AuditHistory() {
    const [tab, setTab] = useState('live');
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [logs, setLogs] = useState([]);
    const [actions, setActions] = useState([]);
    const [users, setUsers] = useState([]);

    const [actionFilter, setActionFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [searchDetail, setSearchDetail] = useState('');
    const [sessionSearch, setSessionSearch] = useState('');

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [currentUser, setCurrentUser] = useState({});
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const getHeaders = () => {
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        return { 'x-user': username, 'x-session-id': sessionId };
    };

    const loadSessions = async () => {
        setLoadingSessions(true);
        try {
            const res = await fetch('/api/audit/sessions', { headers: getHeaders() });
            const data = await res.json();
            setSessions(data.sessions || []);
            const currentSessId = sessionStorage.getItem('sessionId');
            if (currentSessId && !selectedSessionId) setSelectedSessionId(currentSessId);
        } catch (e) { console.error('Failed to load sessions:', e); }
        setLoadingSessions(false);
    };

    const loadFilters = async () => {
        try {
            const res = await fetch('/api/audit/logs?limit=1000', { headers: getHeaders() });
            const data = await res.json();
            const logList = data.logs || [];
            setActions([...new Set(logList.map(log => log.action))].sort());
            setUsers([...new Set(logList.map(log => log.user).filter(Boolean))].sort());
        } catch (e) {}
    };

    const loadLogs = async () => {
        if (!selectedSessionId) return;
        setLoadingLogs(true);
        let url = `/api/audit/logs?page=${page}&limit=50&session_id=${selectedSessionId}`;
        if (userFilter) url += `&user=${encodeURIComponent(userFilter)}`;
        if (actionFilter) url += `&action=${encodeURIComponent(actionFilter)}`;
        try {
            const res = await fetch(url, { headers: getHeaders() });
            const data = await res.json();
            setLogs(data.logs || []);
            setTotalPages(data.totalPages || 1);
        } catch (e) { console.error('Failed to load audit logs:', e); }
        setLoadingLogs(false);
    };

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
        fetch('/api/audit/page-view', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ page: 'Audit Dashboard' }) }).catch(() => {});
    }, []);

    useEffect(() => { if (currentUser.username) { loadSessions(); loadFilters(); } }, [currentUser]);
    useEffect(() => { if (selectedSessionId) loadLogs(); }, [selectedSessionId, page, actionFilter, userFilter]);

    useEffect(() => {
        const currentSessId = sessionStorage.getItem('sessionId');
        const isLive = selectedSessionId === currentSessId;
        if (!isLive) return;
        const interval = setInterval(loadLogs, 3000);
        return () => clearInterval(interval);
    }, [selectedSessionId]);

    const handleDeleteLog = async (logId) => {
        if (!confirm('Delete this audit log entry?')) return;
        try { await fetch('/api/audit/logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ logId }) }); loadLogs(); } catch (e) {}
    };
    const handleDeleteSession = async (sessId) => {
        if (!confirm('Delete this entire session and all associated logs?')) return;
        try {
            await fetch('/api/audit/logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ sessionId: sessId }) });
            if (selectedSessionId === sessId) setSelectedSessionId(sessionStorage.getItem('sessionId'));
            loadSessions();
        } catch (e) {}
    };
    const handleClearAll = async () => {
        if (!confirm('Permanently clear ALL audit logs? This cannot be undone.')) return;
        try { await fetch('/api/audit/logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ logType: 'all' }) }); setLogs([]); loadSessions(); } catch (e) {}
    };

    const now = new Date();
    const recentActivityThreshold = new Date(now - 30 * 1000);
    const currentSessId = sessionStorage.getItem('sessionId') || 'unknown';
    const liveSessions = sessions.filter(s => { const e = s.end_time.includes('T') ? s.end_time : s.end_time.replace(' ', 'T') + 'Z'; return new Date(e) >= recentActivityThreshold; });
    const historicalSessions = sessions.filter(s => { const e = s.end_time.includes('T') ? s.end_time : s.end_time.replace(' ', 'T') + 'Z'; return new Date(e) < recentActivityThreshold; });
    const activeSessions = tab === 'live' ? liveSessions : historicalSessions;
    const filteredSessions = activeSessions.filter(s => `${s.user || ''} ${s.session_id || ''}`.toLowerCase().includes(sessionSearch.trim().toLowerCase()));
    const filteredLogs = logs.filter(log => { const q = searchDetail.trim().toLowerCase(); if (!q) return true; return (log.details || '').toLowerCase().includes(q); });

    const getActionBadge = (action) => {
        if (action.includes('LOGIN') && !action.includes('FAIL')) return { bg: '#DCFCE7', color: '#16A34A' };
        if (action.includes('FAIL')) return { bg: '#FEE2E2', color: '#DC2626' };
        if (action.includes('LOGOUT') || action.includes('SESSION')) return { bg: '#F1F5F9', color: '#64748B' };
        if (action.includes('ADD') || action.includes('CREATE')) return { bg: '#DBEAFE', color: '#2563EB' };
        if (action.includes('DELETE') || action.includes('REMOVE')) return { bg: '#FEE2E2', color: '#DC2626' };
        if (action.includes('EDIT') || action.includes('UPDATE')) return { bg: '#FEF9C3', color: '#CA8A04' };
        return { bg: '#F1F5F9', color: '#64748B' };
    };

    const tabStyle = (t) => ({
        flex: 1, padding: '11px', background: 'transparent', border: 'none', borderBottom: tab === t ? '2px solid #2563EB' : '2px solid transparent',
        color: tab === t ? '#2563EB' : '#64748B', fontWeight: 700, fontSize: 12, cursor: 'pointer', borderRadius: 0, transition: 'color .15s'
    });

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ClipboardList size={20} color="#2563EB" /> Administrative Audit
                    </h1>
                    <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Administrator activity tracking & session histories</p>
                </div>
                {currentUser.role === 'admin' && (
                    <button onClick={handleClearAll} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13, color: '#EF4444', border: '1px solid rgba(239,68,68,.25)' }}>
                        <Trash2 size={14} /> Wipe Audit Log
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
                
                {/* Sessions Panel */}
                <div className="section-card" style={{ background: '#FFF', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '13px 16px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Sessions</span>
                        <button onClick={loadSessions} className="btn" style={{ padding: '5px', border: 'none', background: 'transparent', color: '#64748B' }} title="Refresh">
                            <RefreshCw size={14} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9' }}>
                        <button onClick={() => setTab('live')} style={tabStyle('live')}>Active Sessions</button>
                        <button onClick={() => setTab('history')} style={tabStyle('history')}>History Logs</button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                        {tab === 'history' && (
                            <div style={{ position: 'relative', marginBottom: 10 }}>
                                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                                <input type="text" placeholder="Search sessions..." value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} style={{ width: '100%', padding: '7px 12px 7px 28px', fontSize: 12, boxSizing: 'border-box' }} />
                            </div>
                        )}
                        {loadingSessions ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 30, fontSize: 13 }}>Loading sessions...</div>
                        ) : filteredSessions.length === 0 ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 30, fontSize: 13 }}>No sessions found</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                {filteredSessions.map((s, idx) => {
                                    const isCurrent = s.session_id === currentSessId;
                                    const isSelected = selectedSessionId === s.session_id;
                                    const startLocal = new Date(s.start_time.includes('T') ? s.start_time : s.start_time.replace(' ', 'T') + 'Z').toLocaleTimeString();
                                    return (
                                        <div key={idx} onClick={() => setSelectedSessionId(s.session_id)} style={{ padding: '11px 13px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${isSelected ? '#2563EB' : '#E9EFF6'}`, background: isSelected ? 'rgba(37,99,235,.04)' : '#FAFBFC', transition: 'all .15s' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 50, fontWeight: 700, background: tab === 'live' ? '#DCFCE7' : '#F1F5F9', color: tab === 'live' ? '#16A34A' : '#64748B' }}>
                                                    {isCurrent ? '● CURRENT' : tab === 'live' ? '● LIVE' : 'HISTORY'}
                                                </span>
                                                <strong style={{ fontSize: 12, color: '#1E293B' }}>{s.user}</strong>
                                            </div>
                                            <div style={{ fontSize: 11, color: '#94A3B8' }}>Started: {startLocal}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8', marginTop: 5 }}>
                                                <span>{s.log_count} logs</span>
                                                {currentUser.role === 'admin' && tab === 'history' && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.session_id); }} style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 600 }}>Delete</button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Audit Log Detail Panel */}
                <div className="section-card" style={{ background: '#FFF', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '13px 18px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, flex: 1, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Filter size={13} color="#64748B" /> Audit Log Entries
                        </span>
                        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} style={{ padding: '6px 10px', fontSize: 12 }}>
                            <option value="">All Actions</option>
                            {actions.map(act => <option key={act} value={act}>{act}</option>)}
                        </select>
                        {currentUser.role === 'admin' && (
                            <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }} style={{ padding: '6px 10px', fontSize: 12 }}>
                                <option value="">All Users</option>
                                {users.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        )}
                    </div>
                    <div style={{ padding: '10px 18px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                            <input type="text" placeholder="Filter by details..." value={searchDetail} onChange={(e) => setSearchDetail(e.target.value)} style={{ width: '100%', padding: '7px 12px 7px 30px', fontSize: 12, boxSizing: 'border-box' }} />
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                        {loadingLogs ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 50, fontSize: 13 }}>Loading logs...</div>
                        ) : filteredLogs.length === 0 ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 50, fontSize: 13 }}>
                                <ClipboardList size={32} style={{ margin: '0 auto 10px', opacity: .3 }} />
                                {selectedSessionId ? 'No entries match filters' : 'Select a session to view logs'}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {filteredLogs.map((log, idx) => {
                                    const timeStr = log.timestamp.includes('T') ? log.timestamp : log.timestamp.replace(' ', 'T') + 'Z';
                                    const logTime = new Date(timeStr).toLocaleTimeString();
                                    const badge = getActionBadge(log.action);
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 8, background: '#FAFBFC', border: '1px solid #F1F5F9', fontFamily: 'monospace', fontSize: 12 }}>
                                            <span style={{ color: '#94A3B8', minWidth: 72, flexShrink: 0 }}>{logTime}</span>
                                            <strong style={{ color: '#2563EB', minWidth: 75, flexShrink: 0, fontFamily: 'sans-serif', fontWeight: 700 }}>{log.user}</strong>
                                            <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, minWidth: 120, textAlign: 'center', flexShrink: 0, fontFamily: 'sans-serif' }}>{log.action}</span>
                                            <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: '#475569' }} title={log.details}>{log.details}</span>
                                            {currentUser.role === 'admin' && (
                                                <button onClick={() => handleDeleteLog(log.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#CBD5E1', flexShrink: 0 }} title="Delete" onMouseEnter={e => e.currentTarget.style.color='#EF4444'} onMouseLeave={e => e.currentTarget.style.color='#CBD5E1'}>
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
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
