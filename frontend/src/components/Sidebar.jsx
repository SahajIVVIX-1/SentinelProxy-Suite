import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Shield, 
    Globe, 
    Ban, 
    Lock, 
    AlertTriangle, 
    History, 
    Users, 
    Settings as SettingsIcon, 
    Activity, 
    RefreshCw, 
    HardDrive,
    LogOut
} from 'lucide-react';

const categories = [
    {
        title: 'NETWORK',
        items: [
            { href: '/proxy', icon: Shield, label: 'Proxy Engine', key: 'proxy' },
            { href: '/dns', icon: Globe, label: 'DNS Resolver', key: 'dns' },
            { href: '/blocklist', icon: Ban, label: 'DNS Blocklists', key: 'blocklist' }
        ]
    },
    {
        title: 'SECURITY',
        items: [
            { href: '/cert-logs', icon: Lock, label: 'Certificate Manager', key: 'cert-logs' },
            { href: '/logs-history', icon: AlertTriangle, label: 'Threat Detection', key: 'logs-history', adminOnly: true },
            { href: '/audit-history', icon: History, label: 'Audit Logs', key: 'audit-history' }
        ]
    },
    {
        title: 'ADMINISTRATION',
        items: [
            { href: '/users', icon: Users, label: 'Team Members', key: 'users', adminOnly: true },
            { href: '/settings', icon: SettingsIcon, label: 'Settings', key: 'settings', adminOnly: true },
            { href: '/self-audit', icon: Activity, label: 'Self Audit', key: 'self-audit', adminOnly: true }
        ]
    },
    {
        title: 'SYSTEM',
        items: [
            { href: '#', icon: RefreshCw, label: 'Updates', key: 'updates', isMock: true, mockMsg: 'Firewall firmware version is up to date (v1.0.2).' },
            { href: '#', icon: HardDrive, label: 'Backup', key: 'backup', isMock: true, mockMsg: 'System configuration backups successfully stored in secured local vault.' }
        ]
    }
];

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState({});

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
    }, []);

    const handleLogout = async () => {
        if (!window.confirm('Are you sure you want to end your session?')) return;

        const currentSessionId = sessionStorage.getItem('sessionId') || 'unknown';

        try {
            await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user': currentUser.username,
                    'x-session-id': currentSessionId
                }
            });
        } catch (err) {
            console.error('Logout audit error:', err);
        }

        sessionStorage.clear();
        navigate('/login');
    };

    return (
        <nav 
            className="sidebar"
            style={{
                width: 'var(--sidebar-width)',
                height: '100vh',
                background: '#0F172A', // Dark Navy `#0F172A`
                borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                padding: '24px 0',
                zIndex: 100,
                position: 'sticky',
                top: 0,
                userSelect: 'none'
            }}
        >
            {/* Chakhdi Brand logo */}
            <div 
                className="logo" 
                style={{
                    padding: '0 24px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    marginBottom: '20px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.5px' }}>
                        🛡️ Chakhdi.local
                    </span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px' }}>
                    Next Gen Firewall
                </span>
            </div>

            {/* Dashboard Link - Separate at top */}
            <div style={{ padding: '0 16px', marginBottom: '10px' }}>
                <Link
                    to="/dashboard"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        color: location.pathname === '/dashboard' ? '#FFFFFF' : '#94A3B8',
                        textDecoration: 'none',
                        borderRadius: '8px',
                        transition: 'all 0.2s ease',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        background: location.pathname === '/dashboard' ? '#2563EB' : 'transparent',
                    }}
                    className="sidebar-link-btn"
                >
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                </Link>
            </div>

            {/* Navigation links grouped by category */}
            <div className="nav-links" style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                padding: '0 16px',
                overflowY: 'auto'
            }}>
                {categories.map((cat, catIdx) => {
                    const items = cat.items.filter(item => currentUser.role === 'admin' || !item.adminOnly);
                    if (items.length === 0) return null;

                    return (
                        <React.Fragment key={catIdx}>
                            <div className="nav-category-title" style={{
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                color: '#475569', // Categories titles in gray
                                textTransform: 'uppercase',
                                letterSpacing: '0.8px',
                                padding: '16px 14px 6px'
                            }}>
                                {cat.title}
                            </div>
                            {items.map((item, idx) => {
                                const IconComp = item.icon;
                                const isActive = location.pathname === item.href;
                                if (item.isMock) {
                                    return (
                                        <a
                                            key={idx}
                                            href="#"
                                            onClick={(e) => { e.preventDefault(); alert(item.mockMsg); }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '10px 14px',
                                                color: '#94A3B8',
                                                textDecoration: 'none',
                                                borderRadius: '8px',
                                                transition: 'all 0.2s ease',
                                                fontWeight: 500,
                                                fontSize: '0.82rem',
                                                background: 'transparent',
                                                marginBottom: '2px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <IconComp size={16} />
                                            <span>{item.label}</span>
                                        </a>
                                    );
                                }
                                return (
                                    <Link
                                        key={idx}
                                        to={item.href}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '10px 14px',
                                            color: isActive ? '#FFFFFF' : '#94A3B8',
                                            textDecoration: 'none',
                                            borderRadius: '8px',
                                            transition: 'all 0.2s ease',
                                            fontWeight: 500,
                                            fontSize: '0.82rem',
                                            background: isActive ? '#2563EB' : 'transparent',
                                            marginBottom: '2px'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) e.currentTarget.style.background = 'transparent';
                                        }}
                                    >
                                        <IconComp size={16} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Logout panel */}
            <div className="logout-section" style={{
                padding: '16px 24px 0',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                marginTop: 'auto'
            }}>
                <a 
                    href="#" 
                    onClick={(e) => { e.preventDefault(); handleLogout(); }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        color: '#EF4444',
                        textDecoration: 'none',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <LogOut size={16} />
                    <span>Logout System</span>
                </a>
            </div>
        </nav>
    );
}
