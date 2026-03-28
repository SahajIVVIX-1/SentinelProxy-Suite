/* Shared Sidebar Component Logic */
(function () {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const path = window.location.pathname;

    // Determine current service/theme for state persistence in links
    const params = new URLSearchParams(window.location.search);
    const serviceType = params.get('type') || (path === '/dns' ? 'dns' : (path === '/proxy' ? 'proxy' : ''));

    const navItems = [
        { href: '/dashboard', icon: 'dashboard', label: 'Overview', key: 'dashboard', accent: '#5c7cff', accentGlow: 'rgba(92, 124, 255, 0.18)' },
        { href: '/proxy', icon: 'shield', label: 'Proxy Server', key: 'proxy', accent: '#ff0044', accentGlow: 'rgba(255, 0, 68, 0.22)' },
        { href: '/dns', icon: 'dns', label: 'DNS Server', key: 'dns', accent: '#00f3ff', accentGlow: 'rgba(0, 243, 255, 0.2)' },
        { href: '/self-audit', icon: 'analytics', label: 'Self Audit', key: 'self-audit', adminOnly: true, accent: '#ffd166', accentGlow: 'rgba(255, 209, 102, 0.22)' },
        { href: '/logs-history', icon: 'history', label: 'Log History', key: 'logs-history', adminOnly: true, accent: '#fca130', accentGlow: 'rgba(252, 161, 48, 0.2)' },
        { href: '/audit-history', icon: 'verified_user', label: 'Audit Logs', key: 'audit-history', accent: '#00ff88', accentGlow: 'rgba(0, 255, 136, 0.2)' },
        { href: '/cert-logs', icon: 'security', label: 'Certificate Logs', key: 'cert-logs', accent: '#a130fc', accentGlow: 'rgba(161, 48, 252, 0.2)' }
    ];

    const adminItems = [
        { href: '/users', icon: 'group', label: 'Team', key: 'users', accent: '#36d1dc', accentGlow: 'rgba(54, 209, 220, 0.2)' }
    ];

    function injectSidebar() {
        const container = document.getElementById('sidebar-container');
        if (!container) return;

        const getActiveClass = (itemKey) => {
            const currentKey = path.replace('/', '') || 'dashboard';
            if (currentKey === itemKey) return 'active';
            // Match history even if key is mismatching slightly
            if (currentKey === 'logs-history' && itemKey === 'logs-history') return 'active';
            // Blocklist active state highlighting based on service type
            if (currentKey === 'blocklist' && itemKey === serviceType) return 'active';
            return '';
        };

        const logoutAccent = { accent: '#ff4d4d', accentGlow: 'rgba(255, 77, 77, 0.2)' };

        const sidebarHTML = `
            <nav class="sidebar" id="sidebar">
                <div class="logo">
                    <span class="icon">bolt</span>
                    <span>Chakhdi.local</span>
                </div>
                <div class="nav-links">
                    ${navItems.filter(item => currentUser.role === 'admin' || !item.adminOnly).map(item => `
                        <a href="${item.href}" class="nav-item ${getActiveClass(item.key)}" id="nav-${item.key}" style="--nav-accent: ${item.accent}; --nav-accent-glow: ${item.accentGlow};">
                            <span class="icon">${item.icon}</span>
                            <span>${item.label}</span>
                        </a>
                    `).join('')}
                    ${currentUser.role === 'admin' ? `
                        <div id="adminNav">
                            ${adminItems.map(item => `
                                <a href="${item.href}" class="nav-item ${getActiveClass(item.key)}" id="nav-${item.key}" style="--nav-accent: ${item.accent}; --nav-accent-glow: ${item.accentGlow};">
                                    <span class="icon">${item.icon}</span>
                                    <span>${item.label}</span>
                                </a>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="logout-section">
                    <a href="#" class="nav-item" id="logout-btn" style="--nav-accent: ${logoutAccent.accent}; --nav-accent-glow: ${logoutAccent.accentGlow};">
                        <span class="icon">logout</span>
                        <span>Logout</span>
                    </a>
                </div>
            </nav>
        `;

        container.innerHTML = sidebarHTML;

        const sidebar = document.getElementById('sidebar');
        sidebar.addEventListener('click', handleSidebarClick);

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                // Show confirmation modal
                const confirmed = await window.customConfirm('Are you sure you want to end your session?', 'End Session');
                if (!confirmed) return;

                // Send logout audit log
                const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
                const currentSessionId = sessionStorage.getItem('sessionId') || 'unknown';

                try {
                    await fetch('/api/logout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user': currentUser.username,
                            'x-session-id': currentSessionId,
                            'user-agent': navigator.userAgent
                        }
                    });
                } catch (err) {
                    console.error('Logout audit error:', err);
                }

                sessionStorage.clear();
                window.location.href = '/login';
            });
        }

        // Close session when browser/tab is closed or refreshed (not in-app navigation)
        let isNavigating = false;

        // Track if user is navigating within the site
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && link.href.startsWith(window.location.origin)) {
                isNavigating = true;
            }
        });

        function sendSessionClose() {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
            const currentSessionId = sessionStorage.getItem('sessionId') || 'unknown';

            if (!currentUser.username || currentSessionId === 'unknown') return;

            const data = JSON.stringify({
                user: currentUser.username,
                sessionId: currentSessionId,
                userAgent: navigator.userAgent
            });

            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/session/close', new Blob([data], {
                    type: 'application/json'
                }));
            } else {
                fetch('/api/session/close', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user': currentUser.username,
                        'x-session-id': currentSessionId,
                        'user-agent': navigator.userAgent
                    },
                    body: data,
                    keepalive: true
                }).catch(() => { });
            }
        }

        window.addEventListener('beforeunload', () => {
            if (isNavigating) return;
            sendSessionClose();
            sessionStorage.clear();
        });

        startHeartbeat();
        registerAuthRestoreGuard();

        initSidebarState();
    }

    function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    }

    function handleSidebarClick(e) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        // Toggle if clicked on the logo area or the empty sidebar background
        if (e.target.closest('.logo') || e.target === sidebar || e.target.classList.contains('nav-links')) {
            toggleSidebar();
            e.stopPropagation();
            return;
        }

        // Specifically do NOT toggle if a nav item is clicked while collapsed.
        // This prevents 'automatic' expansion during navigation.
    }

    function initSidebarState() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        if (localStorage.getItem('sidebarCollapsed') === 'true') {
            sidebar.classList.add('collapsed');
        }
    }

    function startHeartbeat() {
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const currentSessionId = sessionStorage.getItem('sessionId') || 'unknown';
        if (!currentUser.username || currentSessionId === 'unknown') return;

        const heartbeatIntervalMs = 30000;
        const sendHeartbeat = () => {
            fetch('/api/session/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user': currentUser.username,
                    'x-session-id': currentSessionId,
                    'user-agent': navigator.userAgent
                }
            }).catch(() => { });
        };

        sendHeartbeat();
        const timer = setInterval(sendHeartbeat, heartbeatIntervalMs);
        window.addEventListener('beforeunload', () => clearInterval(timer));
    }

    function registerAuthRestoreGuard() {
        const checkAuth = async () => {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
            const currentSessionId = sessionStorage.getItem('sessionId') || 'unknown';
            if (!currentUser.username || currentSessionId === 'unknown') {
                sessionStorage.clear();
                window.location.href = '/login';
                return;
            }

            try {
                const res = await fetch('/api/session/heartbeat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user': currentUser.username,
                        'x-session-id': currentSessionId,
                        'user-agent': navigator.userAgent
                    }
                });

                if (!res.ok) {
                    sessionStorage.clear();
                    window.location.href = '/login';
                }
            } catch (err) {
                sessionStorage.clear();
                window.location.href = '/login';
            }
        };

        window.addEventListener('pageshow', (evt) => {
            if (evt.persisted) checkAuth();
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) checkAuth();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectSidebar);
    } else {
        injectSidebar();
    }
})();
