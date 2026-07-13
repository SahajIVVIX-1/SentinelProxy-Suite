import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, UploadCloud, ArrowLeft, Search, Trash2, Plus, FileText, X } from 'lucide-react';

export default function Blocklist() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const type = searchParams.get('type') || 'dns';

    const [sources, setSources] = useState([]);
    const [manualDomain, setManualDomain] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [domainsData, setDomainsData] = useState({ items: [], totalPages: 1 });
    const [page, setPage] = useState(1);
    const [currentUser, setCurrentUser] = useState({});
    const [fileName, setFileName] = useState('');

    const getHeaders = () => {
        const username = JSON.parse(sessionStorage.getItem('currentUser') || '{}').username || 'System';
        const sessionId = sessionStorage.getItem('sessionId') || 'unknown';
        return { 'x-user': username, 'x-session-id': sessionId };
    };

    const loadSources = async () => {
        try {
            const res = await fetch(`/api/${type}/blocklist/files`, { headers: getHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            setSources(data.files || []);
        } catch (e) { console.error('Failed to load sources:', e); }
    };

    const loadDomains = async () => {
        try {
            const res = await fetch(`/api/${type}/blocklist?search=${encodeURIComponent(searchTerm)}&page=${page}&limit=20`, { headers: getHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            setDomainsData({ items: (data.domains || []).map(d => ({ domain: d, source: 'active' })), totalPages: data.totalPages || 1 });
        } catch (e) { console.error('Failed to load domains:', e); }
    };

    useEffect(() => {
        const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        setCurrentUser(user);
    }, []);

    useEffect(() => {
        if (currentUser.username) { loadSources(); loadDomains(); }
    }, [currentUser, type, searchTerm, page]);

    const handleAddManual = async (e) => {
        e.preventDefault();
        if (!manualDomain.trim()) return;
        try {
            const res = await fetch(`/api/${type}/blocklist`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ domains: [manualDomain.trim()] }) });
            if (res.ok) { setManualDomain(''); loadSources(); loadDomains(); }
        } catch (e) { console.error('Failed to add domain:', e); }
    };

    const handleRemoveDomain = async (domain) => {
        if (!confirm(`Remove ${domain} from blocklist?`)) return;
        try {
            const res = await fetch(`/api/${type}/blocklist`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ domain }) });
            if (res.ok) { loadSources(); loadDomains(); }
        } catch (e) { console.error('Failed to remove domain:', e); }
    };

    const handleDeleteSource = async (source) => {
        if (!confirm(`Delete source: ${source} and all its domains?`)) return;
        try {
            const cleanedSource = source.startsWith('file:') ? source.replace('file:', '') : source;
            const res = await fetch(`/api/${type}/blocklist/files/${encodeURIComponent(cleanedSource)}`, { method: 'DELETE', headers: getHeaders() });
            if (res.ok) { loadSources(); loadDomains(); }
        } catch (e) { console.error('Failed to delete source:', e); }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const res = await fetch(`/api/${type}/blocklist/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() }, body: JSON.stringify({ filename: file.name, content: evt.target.result }) });
                if (res.ok) { alert('Blocklist imported successfully!'); loadSources(); loadDomains(); }
            } catch (err) { console.error('Import failed:', err); }
        };
        reader.readAsText(file);
    };

    const typeLabel = type.toUpperCase();
    const typeColor = type === 'proxy' ? '#8B5CF6' : '#2563EB';

    return (
        <div style={{ padding: '28px', background: '#F4F7FB', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <Shield size={20} color={typeColor} />
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>
                            {typeLabel} Blocklist Manager
                        </h1>
                        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 700, background: type === 'proxy' ? 'rgba(139,92,246,.1)' : 'rgba(37,99,235,.1)', color: typeColor, border: `1px solid ${type === 'proxy' ? 'rgba(139,92,246,.2)' : 'rgba(37,99,235,.2)'}` }}>
                            {typeLabel}
                        </span>
                    </div>
                    <p style={{ color: '#64748B', fontSize: 13, margin: 0 }}>Manage domain filter rules and block source lists</p>
                </div>
                <button onClick={() => navigate(type === 'proxy' ? '/proxy' : '/dns')} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', fontSize: 13 }}>
                    <ArrowLeft size={14} /> Back to Engine
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
                
                {/* Left: Domain List */}
                <div className="section-card" style={{ display: 'flex', flexDirection: 'column', background: '#FFF', minHeight: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFBFC' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                            Blocked Domains
                            <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 8, fontWeight: 500 }}>({domainsData.items.length} shown)</span>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                            <input type="text" placeholder="Search domains..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} style={{ padding: '7px 12px 7px 30px', fontSize: 12, width: 200, boxSizing: 'border-box' }} />
                        </div>
                    </div>

                    {currentUser.role === 'admin' && (
                        <div style={{ padding: '12px 18px', borderBottom: '1px solid #F1F5F9' }}>
                            <form onSubmit={handleAddManual} style={{ display: 'flex', gap: 8 }}>
                                <input type="text" placeholder="Block a domain (e.g. tracking.ads.com)" value={manualDomain} onChange={(e) => setManualDomain(e.target.value)} style={{ flex: 1, padding: '8px 12px', fontSize: 13 }} required />
                                <button type="submit" className="btn-accent" style={{ padding: '8px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Plus size={14} /> Block
                                </button>
                            </form>
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
                        {domainsData.items.length === 0 ? (
                            <div style={{ color: '#94A3B8', textAlign: 'center', padding: 50, fontSize: 13 }}>
                                <Shield size={32} style={{ margin: '0 auto 10px', opacity: .3 }} />
                                No domains found
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {domainsData.items.map((d, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #EFF3F7' }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>{d.domain}</span>
                                        {currentUser.role === 'admin' && (
                                            <button onClick={() => handleRemoveDomain(d.domain)} className="btn" style={{ padding: '4px 10px', color: '#EF4444', border: '1px solid rgba(239,68,68,.2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                                <X size={12} /> Unblock
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid #F1F5F9', background: '#FAFBFC' }}>
                        <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page <= 1} className="btn" style={{ padding: '6px 12px', fontSize: 12 }}>Prev</button>
                        <span style={{ fontSize: 12, color: '#64748B' }}>Page {page} / {domainsData.totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(p + 1, domainsData.totalPages))} disabled={page >= domainsData.totalPages} className="btn" style={{ padding: '6px 12px', fontSize: 12 }}>Next</button>
                    </div>
                </div>

                {/* Right: Sources + Import */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    
                    {/* File Import */}
                    {currentUser.role === 'admin' && (
                        <div className="section-card" style={{ background: '#FFF', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <UploadCloud size={15} color="#2563EB" />
                                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', margin: 0 }}>Import Blocklist</h3>
                            </div>
                            <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>
                                Upload a plain text hosts/domains file. One domain per line. Wildcards are generated automatically.
                            </p>
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', cursor: 'pointer', borderRadius: 10, border: '2px dashed #CBD5E1', color: '#2563EB', background: 'rgba(37,99,235,.03)', fontWeight: 700, fontSize: 13, transition: 'border-color .15s, background .15s' }}>
                                <UploadCloud size={16} />
                                <span>{fileName ? `Selected: ${fileName}` : 'Choose Hosts File'}</span>
                                <input type="file" accept=".txt,.hosts" onChange={handleFileUpload} style={{ display: 'none' }} />
                            </label>
                        </div>
                    )}

                    {/* Active Sources */}
                    <div className="section-card" style={{ background: '#FFF', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', fontSize: 13, fontWeight: 800, color: '#0F172A', background: '#FAFBFC', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={14} color="#64748B" /> Active Block Sources
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                            {sources.length === 0 ? (
                                <div style={{ color: '#94A3B8', textAlign: 'center', padding: 30, fontSize: 13 }}>No active block sources</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {sources.map((s, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #EFF3F7' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                                                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                                                    <span style={{ padding: '1px 6px', borderRadius: 4, background: '#EFF3F7', fontWeight: 600, marginRight: 6 }}>{s.type}</span>
                                                    {s.count} domains
                                                </div>
                                            </div>
                                            {currentUser.role === 'admin' && (
                                                <button onClick={() => handleDeleteSource(s.type === 'manual' ? 'manual' : `file:${s.name}`)} className="btn" style={{ padding: '6px', border: 'none', background: 'transparent', color: '#EF4444', flexShrink: 0 }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
