import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, Plus, Shield, Edit2, Trash2, Cpu, X } from 'lucide-react';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState({});
    
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('user');

    const [showEditModal, setShowEditModal] = useState(false);
    const [editTarget, setEditTarget] = useState('');
    const [editOldPassword, setEditOldPassword] = useState('');
    const [editNewUsername, setEditNewUsername] = useState('');
    const [editNewPassword, setEditNewPassword] = useState('');
    const [editNewRole, setEditNewRole] = useState('user');
    const [editError, setEditError] = useState('');

    const [showMacModal, setShowMacModal] = useState(false);
    const [macUser, setMacUser] = useState('');
    const [macList, setMacList] = useState([]);
    const [newMacAddress, setNewMacAddress] = useState('');
    const [newMacDesc, setNewMacDesc] = useState('');
    const [macError, setMacError] = useState('');

    const getHeaders = () => {
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        return { 'x-user': username, 'x-session-id': sessionId };
    };

    const loadUsers = async () => {
        try { const res = await fetch('/api/users', { headers: getHeaders() }); setUsers(await res.json() || []); } catch (e) { console.error('Failed to load users:', e); }
    };

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
        fetch('/api/audit/page-view', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ page: 'Team Management' }) }).catch(() => {});
    }, []);

    useEffect(() => { if (currentUser.username) loadUsers(); }, [currentUser]);

    const handleAddUser = async (e) => {
        e.preventDefault();
        if (!newUsername || !newPassword) return;
        try {
            const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }) });
            if (res.ok) { setNewUsername(''); setNewPassword(''); setNewRole('user'); loadUsers(); }
            else { const d = await res.json(); alert(d.error || 'Failed to add user'); }
        } catch (e) { alert('Communication error.'); }
    };

    const handleDeleteUser = async (username) => {
        if (!confirm(`Remove ${username} from the team?`)) return;
        try { const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE', headers: getHeaders() }); if (res.ok) loadUsers(); } catch (e) { alert('Deletion failed.'); }
    };

    const handleOpenEdit = (userObj) => {
        setEditTarget(userObj.username); setEditOldPassword(''); setEditNewUsername(''); setEditNewPassword(''); setEditNewRole(userObj.role); setEditError(''); setShowEditModal(true);
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editOldPassword) { setEditError('Identity verification required.'); return; }
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(editTarget)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ oldPassword: editOldPassword, newUsername: editNewUsername || undefined, newPassword: editNewPassword || undefined, newRole: editNewRole }) });
            if (res.ok) { setShowEditModal(false); loadUsers(); }
            else { const d = await res.json(); setEditError(d.error || 'Update failed.'); }
        } catch (e) { setEditError('Network error.'); }
    };

    const loadMacsForUser = async (username) => {
        try { const res = await fetch('/api/mac-allowlist', { headers: getHeaders() }); const d = await res.json(); if (d.success) setMacList(d.macs.filter(m => m.username === username)); } catch (e) {}
    };
    const handleOpenMac = async (username) => { setMacUser(username); setNewMacAddress(''); setNewMacDesc(''); setMacError(''); setShowMacModal(true); await loadMacsForUser(username); };
    const handleAddMac = async (e) => {
        e.preventDefault();
        const cleanMac = newMacAddress.trim().toLowerCase();
        if (!cleanMac) { setMacError('Please enter a MAC address'); return; }
        if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(cleanMac)) { setMacError('Invalid MAC format. Use: aa:bb:cc:dd:ee:ff'); return; }
        try {
            const res = await fetch('/api/mac-allowlist/add', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ username: macUser, macAddress: cleanMac, description: newMacDesc }) });
            const d = await res.json();
            if (d.success) { setNewMacAddress(''); setNewMacDesc(''); setMacError(''); await loadMacsForUser(macUser); }
            else setMacError(d.error || 'Failed to add MAC address');
        } catch (e) { setMacError('Network error'); }
    };
    const handleRemoveMac = async (macAddress) => {
        if (!confirm('Remove this MAC address restriction?')) return;
        try { const res = await fetch('/api/mac-allowlist/remove', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ username: macUser, macAddress }) }); const d = await res.json(); if (d.success) await loadMacsForUser(macUser); else setMacError(d.error || 'Failed'); } catch (e) { setMacError('Network error'); }
    };

    const getInitials = (name) => name ? name.slice(0, 2).toUpperCase() : '??';
    const getAvatarColor = (name) => {
        const colors = ['#2563EB', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626'];
        let hash = 0; for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 200 };
    const modalStyle = { background: '#FFF', borderRadius: 16, padding: 28, width: '90%', maxWidth: 460, boxShadow: '0 24px 80px rgba(15,23,42,.2)', display: 'flex', flexDirection: 'column', gap: 18 };
    const inputStyle = { width: '100%', padding: '10px 14px', fontSize: 13, borderRadius: 8, border: '1px solid #E2E8F0', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
    const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' };

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header */}
            <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <UsersIcon size={20} color="#2563EB" /> Team Management
                </h1>
                <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Manage user accounts, access levels & hardware authentication rules</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
                
                {/* Members List */}
                <div className="section-card" style={{ background: '#FFF', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                        Active Members <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, marginLeft: 6 }}>({users.length})</span>
                    </div>
                    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {users.length === 0 ? (
                            <div style={{ color: '#94A3B8', padding: 30, textAlign: 'center', fontSize: 13 }}>No users configured</div>
                        ) : users.map((u, idx) => {
                            const avatarColor = getAvatarColor(u.username);
                            const isAdmin = u.role === 'admin';
                            return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#F8FAFC', border: '1px solid #EFF3F7', borderRadius: 10, transition: 'box-shadow .15s' }}>
                                    <div style={{ width: 42, height: 42, borderRadius: 12, background: avatarColor, display: 'grid', placeItems: 'center', color: '#FFF', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                                        {getInitials(u.username)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {u.username}
                                            {u.username === currentUser.username && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 50, background: '#EFF6FF', color: '#2563EB', fontWeight: 700 }}>YOU</span>}
                                        </div>
                                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 50, fontWeight: 700, textTransform: 'uppercase', background: isAdmin ? 'rgba(37,99,235,.1)' : '#F1F5F9', color: isAdmin ? '#2563EB' : '#64748B' }}>
                                            {u.role}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {u.role !== 'admin' && (
                                            <button onClick={() => handleOpenMac(u.username)} className="btn" title="Manage MAC restrictions" style={{ padding: '7px', display: 'flex', alignItems: 'center' }}>
                                                <Cpu size={14} />
                                            </button>
                                        )}
                                        <button onClick={() => handleOpenEdit(u)} className="btn" title="Edit user" style={{ padding: '7px', display: 'flex', alignItems: 'center' }}>
                                            <Edit2 size={14} />
                                        </button>
                                        {u.username !== 'admin' && u.username !== currentUser.username && (
                                            <button onClick={() => handleDeleteUser(u.username)} className="btn" title="Delete user" style={{ padding: '7px', display: 'flex', alignItems: 'center', color: '#EF4444', border: '1px solid rgba(239,68,68,.2)' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Add User Panel */}
                <div className="section-card" style={{ background: '#FFF', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC', fontSize: 13, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Plus size={14} color="#2563EB" /> Add Team Member
                    </div>
                    <form onSubmit={handleAddUser} style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={labelStyle}>Username</label>
                            <input type="text" placeholder="Enter username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} style={inputStyle} required />
                        </div>
                        <div>
                            <label style={labelStyle}>Initial Password</label>
                            <input type="password" placeholder="Enter password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} required />
                        </div>
                        <div>
                            <label style={labelStyle}>Access Role</label>
                            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={inputStyle}>
                                <option value="user">User — Logs & Read-Only Dashboard</option>
                                <option value="admin">Admin — Full Control & Policy Settings</option>
                            </select>
                        </div>
                        <button type="submit" className="btn-accent" style={{ padding: '11px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <Plus size={15} /> Add Member
                        </button>
                    </form>
                </div>
            </div>

            {/* Edit User Modal */}
            {showEditModal && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>Edit Member: {editTarget}</h3>
                            <button onClick={() => setShowEditModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', padding: 4 }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={labelStyle}>Your Password (identity confirmation)</label>
                                <input type="password" placeholder="Enter your current password" value={editOldPassword} onChange={(e) => setEditOldPassword(e.target.value)} style={inputStyle} required />
                            </div>
                            <div>
                                <label style={labelStyle}>New Username</label>
                                <input type="text" placeholder="Leave blank to keep same" value={editNewUsername} onChange={(e) => setEditNewUsername(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={labelStyle}>Access Level</label>
                                <select value={editNewRole} onChange={(e) => setEditNewRole(e.target.value)} style={inputStyle}>
                                    <option value="user">User Access</option>
                                    <option value="admin">Admin Access</option>
                                </select>
                            </div>
                            <div>
                                <label style={labelStyle}>Update Password</label>
                                <input type="password" placeholder="Leave blank to keep same" value={editNewPassword} onChange={(e) => setEditNewPassword(e.target.value)} style={inputStyle} />
                            </div>
                            {editError && <div style={{ color: '#EF4444', fontSize: 13, fontWeight: 600 }}>{editError}</div>}
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                                <button type="button" onClick={() => setShowEditModal(false)} className="btn" style={{ padding: '10px 18px' }}>Cancel</button>
                                <button type="submit" className="btn-accent" style={{ padding: '10px 18px' }}>Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MAC Restrictions Modal */}
            {showMacModal && (
                <div style={overlayStyle}>
                    <div style={{ ...modalStyle, maxWidth: 540, maxHeight: '88vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0 }}>MAC Restrictions: {macUser}</h3>
                                <p style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Restrict login to specific hardware. Leave empty to allow any device.</p>
                            </div>
                            <button onClick={() => setShowMacModal(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', padding: 4, flexShrink: 0 }}><X size={18} /></button>
                        </div>

                        <form onSubmit={handleAddMac} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: 16, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Add Allowed Device</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <input type="text" placeholder="00:1a:2b:3c:4d:5e" value={newMacAddress} onChange={(e) => setNewMacAddress(e.target.value)} style={{ ...inputStyle, background: '#FFF' }} required />
                                <input type="text" placeholder="Description (optional)" value={newMacDesc} onChange={(e) => setNewMacDesc(e.target.value)} style={{ ...inputStyle, background: '#FFF' }} />
                            </div>
                            <button type="submit" className="btn-accent" style={{ padding: '10px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Plus size={14} /> Add Allowed MAC
                            </button>
                            {macError && <div style={{ color: '#EF4444', fontSize: 12, fontWeight: 600 }}>{macError}</div>}
                        </form>

                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>Allowed MAC Rules</div>
                            {macList.length === 0 ? (
                                <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 20, fontStyle: 'italic' }}>No restrictions active. Login allowed from any workstation.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {macList.map((m, idx) => (
                                        <div key={idx} style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                                            <div>
                                                <div style={{ fontFamily: 'monospace', color: '#2563EB', fontWeight: 700, fontSize: 13 }}>{m.mac_address}</div>
                                                {m.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{m.description}</div>}
                                                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Added by {m.added_by} · {new Date(m.created_at).toLocaleDateString()}</div>
                                            </div>
                                            <button onClick={() => handleRemoveMac(m.mac_address)} className="btn" style={{ padding: '6px', border: 'none', background: 'transparent', color: '#EF4444' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowMacModal(false)} className="btn" style={{ padding: '10px 18px' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
