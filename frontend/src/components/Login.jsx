import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const LOADING_STEPS = [
    "Identity Authenticated",
    "Initializing Firewall Engine...",
    "Loading Network Services...",
    "Applying Security Policies...",
    "Starting Intrusion Prevention...",
    "Checking System Integrity...",
    "Preparing Dashboard..."
];

export default function Login() {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [ip, setIp] = useState('127.0.0.1');
    const [mac, setMac] = useState('00:00:00:00:00:00');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    
    // Animation progress states
    const [progressPercent, setProgressPercent] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);
    const canvasRef = useRef(null);

    useEffect(() => {
        // Fetch Client IP & MAC
        fetch('/api/client-info')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setIp(data.ip || '127.0.0.1');
                    setMac(data.mac || '00:00:00:00:00:00');
                }
            })
            .catch(() => {});
    }, []);

    // Animate loading steps and progress bar on success
    useEffect(() => {
        if (!success) return;

        const duration = 5000; // 5 seconds
        const intervalMs = 50;
        const totalSteps = LOADING_STEPS.length;
        const stepDuration = duration / totalSteps;
        
        let elapsed = 0;
        const timer = setInterval(() => {
            elapsed += intervalMs;
            const percentage = Math.min((elapsed / duration) * 100, 100);
            setProgressPercent(Math.floor(percentage));

            const currentStep = Math.min(Math.floor(elapsed / stepDuration), totalSteps - 1);
            setStepIndex(currentStep);

            if (elapsed >= duration) {
                clearInterval(timer);
                navigate('/dashboard');
            }
        }, intervalMs);

        return () => clearInterval(timer);
    }, [success, navigate]);

    // Canvas background node network animation
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationId;
        
        let width = canvas.width = canvas.parentElement.clientWidth;
        let height = canvas.height = canvas.parentElement.clientHeight;

        const handleResize = () => {
            if (canvas) {
                width = canvas.width = canvas.parentElement.clientWidth;
                height = canvas.height = canvas.parentElement.clientHeight;
            }
        };
        window.addEventListener('resize', handleResize);

        // Nodes setup
        const nodesCount = 65;
        const nodes = [];
        for (let i = 0; i < nodesCount; i++) {
            nodes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.6,
                vy: (Math.random() - 0.5) * 0.6,
                radius: Math.random() * 2.5 + 1.5
            });
        }

        // Draw hexagons helper
        const drawHexagon = (x, y, size) => {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI) / 3;
                ctx.lineTo(x + size * Math.cos(angle), y + size * Math.sin(angle));
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(15, 143, 255, 0.03)';
            ctx.lineWidth = 1;
            ctx.stroke();
        };

        const animate = () => {
            ctx.clearRect(0, 0, width, height);

            // Draw subtle static Hexagonal Grid
            const hexSize = 45;
            const xSpacing = hexSize * 1.5;
            const ySpacing = hexSize * Math.sqrt(3);
            for (let x = 0; x < width + hexSize; x += xSpacing) {
                for (let y = 0; y < height + hexSize; y += ySpacing) {
                    const offset = (Math.floor(x / xSpacing) % 2) * (ySpacing / 2);
                    drawHexagon(x, y + offset, hexSize);
                }
            }

            // Draw and update Nodes (Particles)
            ctx.fillStyle = '#0F8FFF';
            nodes.forEach(node => {
                node.x += node.vx;
                node.y += node.vy;

                // Bounce boundaries
                if (node.x < 0 || node.x > width) node.vx *= -1;
                if (node.y < 0 || node.y > height) node.vy *= -1;

                // Glowing point
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
                ctx.shadowColor = '#0F8FFF';
                ctx.shadowBlur = 8;
                ctx.fillStyle = 'rgba(15, 143, 255, 0.8)';
                ctx.fill();
                ctx.shadowBlur = 0; // Reset
            });

            // Draw Connection Lines between close nodes
            ctx.lineWidth = 0.8;
            for (let i = 0; i < nodesCount; i++) {
                for (let j = i + 1; j < nodesCount; j++) {
                    const dx = nodes[i].x - nodes[j].x;
                    const dy = nodes[i].y - nodes[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 100) {
                        const alpha = (1 - dist / 100) * 0.18;
                        ctx.strokeStyle = `rgba(15, 143, 255, ${alpha})`;
                        ctx.beginPath();
                        ctx.moveTo(nodes[i].x, nodes[i].y);
                        ctx.lineTo(nodes[j].x, nodes[j].y);
                        ctx.stroke();
                    }
                }
            }

            // Draw abstract floating world map nodes in top right
            ctx.strokeStyle = 'rgba(15, 143, 255, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(width * 0.8, height * 0.3, 150, 0, Math.PI * 2);
            ctx.stroke();

            animationId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationId);
        };
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success) {
                sessionStorage.setItem('dashboardAuth', 'true');
                sessionStorage.setItem('currentUser', JSON.stringify(data.user));
                sessionStorage.setItem('sessionId', data.sessionId);
                setSuccess(true);
            } else {
                throw new Error(data.message || 'Invalid credentials');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Access Denied');
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            minHeight: '100vh',
            width: '100vw',
            overflow: 'hidden',
            fontFamily: "'Outfit', sans-serif",
            background: '#071C2F'
        }}>
            {/* Left Control Panel Container */}
            <div style={{
                width: '380px',
                background: '#101820',
                padding: '35px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderRight: '1px solid rgba(15, 143, 255, 0.15)',
                zIndex: 10,
                boxShadow: '10px 0 30px rgba(0,0,0,0.3)'
            }}>
                {/* Branding Title */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z" fill="#0F8FFF" opacity="0.2"/>
                            <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6L12 2z" stroke="#0F8FFF" strokeWidth="1.5" strokeLinejoin="round"/>
                            <path d="M9 12l2 2 4-4" stroke="#0F8FFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <h1 style={{
                            color: '#FFFFFF',
                            fontSize: '1.4rem',
                            fontWeight: 700,
                            letterSpacing: '0.5px',
                            margin: 0
                        }}>
                            Chakhdi.local
                        </h1>
                    </div>
                    <span style={{
                        color: '#9FB3C8',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        display: 'block',
                        marginTop: '4px',
                        paddingLeft: '34px'
                    }}>
                        Next Generation Firewall
                    </span>
                    
                    <div style={{ 
                        color: 'rgba(159, 179, 200, 0.3)', 
                        fontSize: '0.85rem', 
                        margin: '25px 0',
                        letterSpacing: '-1.5px',
                        userSelect: 'none'
                    }}>
                        ────────────────────────
                    </div>

                    {success ? (
                        /* Premium SUCCESS Loading Sequence */
                        <div style={{ color: '#FFFFFF', marginTop: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px' }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    background: 'rgba(0, 210, 122, 0.15)',
                                    border: '1px solid #00D27A',
                                    borderRadius: '50%',
                                    display: 'grid',
                                    placeItems: 'center',
                                    fontSize: '1.1rem',
                                    color: '#00D27A',
                                    fontWeight: 700
                                }}>
                                    ✓
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#9FB3C8', fontWeight: 600, textTransform: 'uppercase' }}>Authentication Successful</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>Welcome, {username || 'Admin'}</span>
                                </div>
                            </div>

                            {/* Verification Steps List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '20px 0', fontSize: '0.8rem' }}>
                                {LOADING_STEPS.map((step, idx) => {
                                    const isDone = idx < stepIndex;
                                    const isActive = idx === stepIndex;
                                    
                                    return (
                                        <div key={idx} style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between',
                                            color: isDone ? '#00D27A' : isActive ? '#0F8FFF' : '#4a5568',
                                            fontWeight: isActive ? 600 : 400,
                                            transition: 'color 0.2s ease'
                                        }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.75rem' }}>
                                                    {isDone ? '•' : isActive ? '•' : '•'}
                                                </span>
                                                <span>{step}</span>
                                            </span>
                                            <span style={{ 
                                                fontFamily: 'monospace', 
                                                fontWeight: 700,
                                                animation: isActive ? 'spin 1s linear infinite' : 'none'
                                            }}>
                                                {isDone ? '✓' : isActive ? '⟳' : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Progress bar state */}
                            <div style={{ marginTop: '30px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9FB3C8', marginBottom: '8px', fontWeight: 600 }}>
                                    <span>Preparing Secure Environment</span>
                                    <span>{progressPercent}%</span>
                                </div>
                                <div style={{
                                    height: '4px',
                                    background: '#071C2F',
                                    borderRadius: '10px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${progressPercent}%`,
                                        background: 'linear-gradient(to right, #0F8FFF, #00D27A)',
                                        borderRadius: '10px',
                                        transition: 'width 0.1s linear'
                                    }} />
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#9FB3C8', marginTop: '12px', textAlign: 'center', fontStyle: 'italic' }}>
                                    Please wait... Redirecting to Dashboard
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Login Form Fields Input */
                        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                            <div>
                                <label style={{
                                    display: 'block',
                                    color: '#9FB3C8',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    marginBottom: '8px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    Username
                                </label>
                                <input 
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter username"
                                    required
                                    style={{
                                        width: '100%',
                                        background: '#071C2F',
                                        border: '1px solid rgba(15, 143, 255, 0.25)',
                                        borderRadius: '6px',
                                        color: '#FFFFFF',
                                        padding: '12px 14px',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{
                                    display: 'block',
                                    color: '#9FB3C8',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    marginBottom: '8px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    Password
                                </label>
                                <input 
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    required
                                    style={{
                                        width: '100%',
                                        background: '#071C2F',
                                        border: '1px solid rgba(15, 143, 255, 0.25)',
                                        borderRadius: '6px',
                                        color: '#FFFFFF',
                                        padding: '12px 14px',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>

                            {errorMsg && (
                                <div style={{ color: '#ff4d4d', fontSize: '0.8rem', fontWeight: 600 }}>
                                    ❌ {errorMsg}
                                </div>
                            )}

                            <button 
                                type="submit"
                                disabled={loading}
                                style={{
                                    background: '#0F8FFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#FFFFFF',
                                    padding: '12px',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    width: '100%',
                                    marginTop: '8px',
                                    boxShadow: '0 4px 15px rgba(15, 143, 255, 0.35)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {loading ? 'AUTHENTICATING...' : 'SECURE LOGIN'}
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer System Info Panel */}
                <div style={{ color: '#9FB3C8', fontSize: '0.75rem' }}>
                    <div style={{ 
                        color: 'rgba(159, 179, 200, 0.3)', 
                        fontSize: '0.85rem', 
                        marginBottom: '15px',
                        letterSpacing: '-1.5px',
                        userSelect: 'none'
                    }}>
                        ────────────────────────
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Firewall Version</span>
                            <span style={{ color: '#FFFFFF' }}>: 1.0.0</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Hostname</span>
                            <span style={{ color: '#FFFFFF' }}>: Chakhdi.local</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Security Status</span>
                            <span style={{ color: '#00D27A', fontWeight: 700 }}>: Secure</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Connection</span>
                            <span style={{ color: '#FFFFFF' }}>: Localhost</span>
                        </div>
                    </div>
                    <div style={{ marginTop: '20px', fontSize: '0.7rem', color: '#556a7d', textAlign: 'center' }}>
                        © 2026 Chakhdi Technologies
                    </div>
                </div>
            </div>

            {/* Right Panel Canvas illustration */}
            <div style={{
                flex: 1,
                background: '#071C2F',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                paddingLeft: '8%',
                overflow: 'hidden'
            }}>
                {/* Connecting Web Canvas */}
                <canvas 
                    ref={canvasRef} 
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 1
                    }}
                />

                {/* Right Panel Headings */}
                <div style={{ zIndex: 10, maxWidth: '650px', color: '#FFFFFF' }}>
                    <p style={{
                        fontSize: '1.25rem',
                        fontWeight: 400,
                        margin: '0 0 8px 0',
                        color: '#0F8FFF',
                        textTransform: 'uppercase',
                        letterSpacing: '1.5px'
                    }}>
                        Welcome Back
                    </p>
                    <h2 style={{
                        fontSize: '3.6rem',
                        fontWeight: 800,
                        margin: 0,
                        lineHeight: 1.1,
                        letterSpacing: '-0.5px'
                    }}>
                        Chakhdi.local Firewall
                    </h2>
                    <p style={{
                        fontSize: '1.15rem',
                        color: '#9FB3C8',
                        marginTop: '15px',
                        fontWeight: 500,
                        letterSpacing: '0.5px'
                    }}>
                        Enterprise Network Security Platform
                    </p>
                </div>
            </div>
            
            {/* Spinning keyframes rules inline style */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}} />
        </div>
    );
}
