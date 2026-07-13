import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import AuthGuard from './components/AuthGuard';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Proxy from './pages/Proxy';
import Dns from './pages/Dns';
import Blocklist from './pages/Blocklist';
import LogsHistory from './pages/LogsHistory';
import SelfAudit from './pages/SelfAudit';
import AuditHistory from './pages/AuditHistory';
import CertLogs from './pages/CertLogs';
import Users from './pages/Users';
import Settings from './pages/Settings';
import TopBar from './components/TopBar';

// Dashboard layout wrapper
function Layout() {
    return (
        <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', overflow: 'hidden' }}>
            <Sidebar />
            <main style={{ flex: 1, height: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <TopBar />
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

export default function App() {
    return (
        <Router>
            <Routes>
                {/* Public Access */}
                <Route path="/login" element={<Login />} />

                {/* Secure Gateway Dashboard Access */}
                <Route element={<AuthGuard><Layout /></AuthGuard>}>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/proxy" element={<Proxy />} />
                    <Route path="/dns" element={<Dns />} />
                    <Route path="/blocklist" element={<Blocklist />} />
                    <Route path="/logs-history" element={<LogsHistory />} />
                    <Route path="/self-audit" element={<SelfAudit />} />
                    <Route path="/audit-history" element={<AuditHistory />} />
                    <Route path="/cert-logs" element={<CertLogs />} />
                    <Route path="/users" element={<Users />} />
                    <Route path="/settings" element={<Settings />} />
                </Route>

                {/* Redirect any other path to dashboard */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </Router>
    );
}
