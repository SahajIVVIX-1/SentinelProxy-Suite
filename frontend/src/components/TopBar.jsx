import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, User, Moon, Sun, Cpu, Layers, Activity } from 'lucide-react';

const routeTitleMap = {
    '/dashboard': { title: 'Control Center', subtitle: 'Hostname: Chakhdi.local | Enterprise Administration' },
    '/proxy': { title: 'Proxy Gateway', subtitle: 'Real-time HTTP/HTTPS gateway logs & inspection' },
    '/dns': { title: 'DNS Resolver', subtitle: 'Concurrently forward DNS queries & filter queries' },
    '/blocklist': { title: 'Blocklist Manager', subtitle: 'Manage domain filter rules and block sources' },
    '/cert-logs': { title: 'Certificate Inventory', subtitle: 'Active local CA handshakes and SSL certificates' },
    '/logs-history': { title: 'Traffic History', subtitle: 'Search and view past network requests' },
    '/audit-history': { title: 'Administrative Audit', subtitle: 'Query administrator activity & session histories' },
    '/users': { title: 'Team Management', subtitle: 'Control user access levels & client hardware authentication' },
    '/settings': { title: 'System Configuration', subtitle: 'Configure dynamic network modules, TLS inspection, and security logs' },
    '/self-audit': { title: 'Self Audit System', subtitle: 'Automated threat assessment & telemetry logs' }
};

export default function TopBar() {
    const location = useLocation();
    const [currentUser, setCurrentUser] = useState({});
    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
    }, []);

    const pathInfo = routeTitleMap[location.pathname] || {
        title: 'Chakhdi.local Firewall',
        subtitle: 'Enterprise Network Security Platform'
    };

    return (
        <header style={{
            height: '70px',
            background: '#FFFFFF',
            borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
            padding: '0 30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 90,
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.02)'
        }}>
            {/* Left Page Title Block */}
            <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {pathInfo.title}
                </h1>
                <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>
                    {pathInfo.subtitle}
                </p>
            </div>

            {/* Right Telemetry Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                
                {/* Live Telemetry Info */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    borderRight: '1px solid rgba(15, 23, 42, 0.08)',
                    paddingRight: '20px'
                }}>
                    <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16A34A', display: 'inline-block', animate: 'pulse 2s infinite' }}></span>
                        🟢 Status: Active
                    </span>

                    <span style={{ color: '#111827', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Cpu className="w-3.5 h-3.5 text-slate-400" size={14} style={{ color: '#64748B' }} />
                        CPU: <span style={{ color: '#2563EB', fontWeight: 700 }}>12%</span>
                    </span>

                    <span style={{ color: '#111827', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Layers className="w-3.5 h-3.5 text-slate-400" size={14} style={{ color: '#64748B' }} />
                        RAM: <span style={{ color: '#2563EB', fontWeight: 700 }}>34%</span>
                    </span>

                    <span style={{ color: '#111827', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Activity className="w-3.5 h-3.5 text-slate-400" size={14} style={{ color: '#64748B' }} />
                        Latency: <span style={{ color: '#16A34A', fontWeight: 700 }}>2ms</span>
                    </span>
                </div>

                {/* Profile, Notifications & Dark Mode Mock */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {/* Simulated Dark Mode Toggle */}
                    <button 
                        onClick={() => setDarkMode(!darkMode)}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            border: '1px solid rgba(15, 23, 42, 0.06)',
                            background: 'transparent',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            color: '#64748B',
                            padding: 0
                        }}
                        title="Toggle dark mode"
                    >
                        {darkMode ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} />}
                    </button>

                    {/* Notifications */}
                    <button 
                        onClick={() => alert('Firewall engine operating within nominal margins. No active alerts.')}
                        style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            border: '1px solid rgba(15, 23, 42, 0.06)',
                            background: 'transparent',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            color: '#64748B',
                            position: 'relative',
                            padding: 0
                        }}
                        title="Alert notifications"
                    >
                        <Bell size={18} />
                        <span style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            width: '7px',
                            height: '7px',
                            background: '#DC2626',
                            borderRadius: '50%'
                        }}></span>
                    </button>

                    {/* User Profile Badge */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#F8FAFC',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(15, 23, 42, 0.06)',
                        color: '#111827',
                        fontWeight: 700,
                        fontSize: '0.82rem'
                    }}>
                        <User size={15} style={{ color: '#2563EB' }} />
                        <span>{currentUser.username || 'Administrator'}</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
