import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { 
    Shield, 
    ShieldAlert, 
    Layers, 
    Activity, 
    Network, 
    X, 
    Copy, 
    ArrowRight, 
    Clock, 
    Globe,
    Cpu,
    ExternalLink
} from 'lucide-react';

export default function Proxy() {
    const [stats, setStats] = useState({ total: 0, blocked: 0, get: 0, connect: 0 });
    const [logs, setLogs] = useState([]);
    
    // Details Drawer State
    const [selectedLog, setSelectedLog] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    useEffect(() => {
        // Fetch Initial Stats
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        const headers = { 'x-user': username, 'x-session-id': sessionId };

        fetch('/api/stats', { headers })
            .then(res => res.json())
            .then(data => {
                setStats({
                    total: data.totalRequests || 0,
                    get: data.getRequests || 0,
                    connect: data.connectRequests || 0,
                    blocked: data.blockedRequests || 0
                });
            })
            .catch(err => console.error('Failed to load proxy stats:', err));

        // Audit page view
        fetch('/api/audit/page-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ page: 'Proxy Dashboard' })
        }).catch(() => {});

        // Connect WebSocket
        const socket = io();
        socket.on('logs', (entries) => {
            setLogs(prev => {
                const updated = [...entries, ...prev];
                return updated.slice(0, 100); // limit to 100 logs
            });

            // Update stats counter dynamically
            setStats(prev => {
                let total = prev.total;
                let blocked = prev.blocked;
                let get = prev.get;
                let connect = prev.connect;

                entries.forEach(log => {
                    total++;
                    if (log.method === 'BLOCK') blocked++;
                    else if (log.method === 'GET') get++;
                    else if (log.method === 'CONNECT') connect++;
                });

                return { total, blocked, get, connect };
            });
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const clearLogs = () => {
        setLogs([]);
    };

    const handleRowClick = (log) => {
        setSelectedLog(log);
        setIsDrawerOpen(true);
    };

    const handleCopyUrl = (url) => {
        navigator.clipboard.writeText(url);
        alert('URL copied to clipboard');
    };

    // Helper functions for mock data rendering inside detail drawer
    const getLogProtocol = (log) => {
        if (log.method === 'CONNECT' || log.url.startsWith('https:')) return 'HTTPS';
        return 'HTTP';
    };

    const getLogSize = (log, idx) => {
        if (log.method === 'BLOCK') return '0 B';
        const sizes = ['4.2 KB', '12.8 KB', '245 B', '1.1 MB', '64.3 KB'];
        return sizes[(idx || 0) % sizes.length];
    };

    const getLogLatency = (log, idx) => {
        if (log.method === 'BLOCK') return '1ms';
        const latencies = ['4ms', '18ms', '24ms', '2ms', '42ms', '11ms'];
        return latencies[(idx || 0) % latencies.length];
    };

    const getLogTls = (log) => {
        if (log.method === 'CONNECT' || log.url.includes(':443') || log.url.startsWith('https:')) {
            return 'TLSv1.3 (ChaCha20-Poly1305)';
        }
        return 'Unencrypted (Clear Text)';
    };

    return (
        <div style={{ padding: '30px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#F4F7FB' }}>
            
            {/* Quick Metrics Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px',
                marginBottom: '25px'
            }}>
                {/* Total Requests */}
                <div className="section-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(37, 99, 235, 0.08)', color: '#2563EB', display: 'grid', placeItems: 'center' }}>
                        <Globe size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>TOTAL REQUESTS</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '2px' }}>{stats.total.toLocaleString()}</div>
                    </div>
                </div>

                {/* Blocked Requests */}
                <div className="section-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(220, 38, 38, 0.08)', color: '#DC2626', display: 'grid', placeItems: 'center' }}>
                        <ShieldAlert size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>BLOCKED</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '2px' }}>{stats.blocked.toLocaleString()}</div>
                    </div>
                </div>

                {/* HTTPS CONNECT */}
                <div className="section-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.08)', color: '#8B5CF6', display: 'grid', placeItems: 'center' }}>
                        <Layers size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>HTTPS TUNNELS</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '2px' }}>{stats.connect.toLocaleString()}</div>
                    </div>
                </div>

                {/* Simulated Bandwidth */}
                <div className="section-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(16, 163, 74, 0.08)', color: '#16A34A', display: 'grid', placeItems: 'center' }}>
                        <Activity size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>EST. BANDWIDTH</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '2px' }}>{(stats.total * 0.12).toFixed(1)} GB</div>
                    </div>
                </div>

                {/* Simulated Live Connections */}
                <div className="section-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.08)', color: '#F59E0B', display: 'grid', placeItems: 'center' }}>
                        <Network size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>LIVE SESSIONS</div>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '2px' }}>{stats.total > 0 ? '42' : '0'}</div>
                    </div>
                </div>
            </div>

            {/* Sub-header Toolbar Controls */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px',
                background: '#FFFFFF',
                padding: '12px 20px',
                borderRadius: '12px',
                border: '1px solid rgba(15, 23, 42, 0.06)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 700, color: '#111827' }}>
                    <Activity size={16} className="text-blue-500" style={{ color: '#2563EB' }} />
                    <span>Live Traffic Stream</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <a href="/blocklist?type=proxy" className="btn" style={{ height: '36px', padding: '0 14px', textDecoration: 'none' }}>
                        <span>Edit Blocklist</span>
                    </a>
                    <button onClick={clearLogs} className="btn" style={{ height: '36px', padding: '0 14px' }}>
                        <span>Clear View</span>
                    </button>
                </div>
            </div>

            {/* Realtime logs panel */}
            <div className="section-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {logs.length === 0 ? (
                        <div style={{ color: '#64748B', textAlign: 'center', padding: '60px', fontSize: '0.9rem' }}>
                            Waiting for traffic stream...
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Method</th>
                                    <th>Destination</th>
                                    <th>Protocol</th>
                                    <th>Size</th>
                                    <th>Latency</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log, idx) => {
                                    const isBlocked = log.method === 'BLOCK';
                                    const timeStr = log.timestamp 
                                        ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false }) 
                                        : new Date().toLocaleTimeString('en-US', { hour12: false });
                                    
                                    return (
                                        <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => handleRowClick(log)}>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#64748B' }}>{timeStr}</td>
                                            <td>
                                                <span className={`badge badge-${isBlocked ? 'blocked' : 'info'}`}>
                                                    {log.method}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="custom-tooltip" style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, display: 'block' }}>
                                                    {log.url}
                                                    <span className="tooltip-text">{log.url}</span>
                                                </div>
                                            </td>
                                            <td><span className="badge badge-info">{getLogProtocol(log)}</span></td>
                                            <td style={{ fontFamily: 'monospace' }}>{getLogSize(log, idx)}</td>
                                            <td style={{ fontFamily: 'monospace' }}>{getLogLatency(log, idx)}</td>
                                            <td>
                                                <span className={`badge badge-${isBlocked ? 'blocked' : 'success'}`}>
                                                    {isBlocked ? 'BLOCKED' : 'ALLOWED'}
                                                </span>
                                            </td>
                                            <td>
                                                <button 
                                                    className="btn" 
                                                    style={{ height: '28px', padding: '0 8px', fontSize: '11px', gap: '4px' }}
                                                    onClick={(e) => { e.stopPropagation(); handleRowClick(log); }}
                                                >
                                                    <span>Details</span>
                                                    <ArrowRight size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Right Side Drawer Backdop */}
            <div 
                className={`drawer-backdrop ${isDrawerOpen ? 'open' : ''}`} 
                onClick={() => setIsDrawerOpen(false)}
            />

            {/* Right Side Slide-Over Details Drawer */}
            <div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
                {selectedLog && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        {/* Drawer Header */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#F8FAFC'
                        }}>
                            <div>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>Log Parameters</h3>
                                <p style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>HTTP transaction inspection details</p>
                            </div>
                            <button 
                                onClick={() => setIsDrawerOpen(false)}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: 'rgba(15, 23, 42, 0.04)',
                                    display: 'grid',
                                    placeItems: 'center',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Drawer Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                            
                            {/* URL Panel */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>Request URL</div>
                                <div style={{
                                    background: '#F8FAFC',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(15, 23, 42, 0.05)',
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: '11px',
                                    wordBreak: 'break-all',
                                    color: '#111827',
                                    lineHeight: 1.4,
                                    position: 'relative'
                                }}>
                                    {selectedLog.url}
                                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                                        <button 
                                            onClick={() => handleCopyUrl(selectedLog.url)}
                                            style={{ height: '26px', padding: '0 8px', fontSize: '11px', gap: '4px' }}
                                        >
                                            <Copy size={11} />
                                            <span>Copy URL</span>
                                        </button>
                                        <a 
                                            href={selectedLog.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            style={{ textDecoration: 'none' }}
                                        >
                                            <button style={{ height: '26px', padding: '0 8px', fontSize: '11px', gap: '4px' }}>
                                                <ExternalLink size={11} />
                                                <span>Open Link</span>
                                            </button>
                                        </a>
                                    </div>
                                </div>
                            </div>

                            {/* Inspection Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                                
                                {/* Method */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>HTTP Method</div>
                                    <span className={`badge badge-${selectedLog.method === 'BLOCK' ? 'blocked' : 'info'}`}>
                                        {selectedLog.method}
                                    </span>
                                </div>

                                {/* Source IP */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Source IP</div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{selectedLog.clientIp || '127.0.0.1'}</div>
                                </div>

                                {/* Destination Host */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Destination Host</div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>{selectedLog.host || 'unknown'}</div>
                                </div>

                                {/* Protocol */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Protocol</div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{getLogProtocol(selectedLog)}</div>
                                </div>

                                {/* TLS Details */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>TLS Version / Cipher</div>
                                    <div style={{ fontSize: '13px', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>{getLogTls(selectedLog)}</span>
                                    </div>
                                </div>

                                {/* Response Status */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Response Status</div>
                                    <span className={`badge badge-${selectedLog.method === 'BLOCK' ? 'blocked' : 'success'}`}>
                                        {selectedLog.method === 'BLOCK' ? '403 Forbidden (Blocked)' : '200 OK Connection Established'}
                                    </span>
                                </div>

                                {/* Time stamp */}
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Timestamp</div>
                                    <div style={{ fontSize: '13px', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={14} style={{ color: '#64748B' }} />
                                        <span>{selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : new Date().toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Rule Metadata */}
                                {selectedLog.meta && (
                                    <div>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Security Rule Triggered</div>
                                        <div style={{
                                            background: 'rgba(220, 38, 38, 0.04)',
                                            border: '1px solid rgba(220, 38, 38, 0.1)',
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                            color: '#DC2626'
                                        }}>
                                            <strong>Category:</strong> {selectedLog.meta.category || 'N/A'}<br/>
                                            <strong>Rule ID:</strong> {selectedLog.meta.rule || 'N/A'}<br/>
                                            {selectedLog.meta.evidence && <><strong>Evidence:</strong> {selectedLog.meta.evidence}</>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
