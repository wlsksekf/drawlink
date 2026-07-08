import { useState, useEffect, useRef } from 'react';
import { LogOut, RefreshCw, Layers, Sparkles, Copy, Check, MousePointer2, PenTool, Eraser, PlusCircle, Trash2 } from 'lucide-react';
import { supabase } from './supabase';
import { Canvas } from './components/Canvas';
import { StickyNotes } from './components/StickyNotes';

interface UserSession {
  id: string;
  email: string;
  token: string;
  isGuest: boolean;
}

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  user_id: string;
}

interface RemoteCursor {
  x: number;
  y: number;
  email: string;
  color: string;
  lastUpdate: number;
}

const defaultGuest = (): UserSession => ({
  id: `guest_${Math.random().toString(36).substring(2, 9)}`,
  email: 'Anonymous Guest',
  token: '',
  isGuest: true
});

export default function App() {
  // Session states - starts as guest automatically
  const [session, setSession] = useState<UserSession>(defaultGuest());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // App workspace states
  const [boardId, setBoardId] = useState('lobby');
  const [newBoardId, setNewBoardId] = useState('');
  const [copied, setCopied] = useState(false);

  // Active Tool Selection: 'select' (Grab/Type) | 'draw' (Neon Chalk) | 'erase' (Rubber)
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'erase'>('draw');

  // Canvas stroke settings
  const [brushColor, setBrushColor] = useState('#ffffff'); // chalk white default
  const [brushWidth, setBrushWidth] = useState(8); // thicker default brush
  const [clearTrigger, setClearTrigger] = useState(0);

  // Panning offsets for virtual board scroll
  const [panOffset, setPanOffset] = useState({ x: -1000, y: -1000 });

  // Sticky notes states
  const [notes, setNotes] = useState<StickyNote[]>([]);

  // Remote cursors state
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const lastCursorSentRef = useRef<number>(0);

  // WebSocket reference & connection status
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Check current Supabase session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: sbSession } }) => {
      if (sbSession) {
        setSession({
          id: sbSession.user.id,
          email: sbSession.user.email || '',
          token: sbSession.access_token,
          isGuest: false
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sbSession) => {
      if (sbSession) {
        setSession({
          id: sbSession.user.id,
          email: sbSession.user.email || '',
          token: sbSession.access_token,
          isGuest: false
        });
        setIsAuthModalOpen(false); // Close modal when logged in
      } else {
        setSession(defaultGuest());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // WebSockets setup & dynamic url calculations
  useEffect(() => {
    const connectWebSocket = () => {
      setWsStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/${boardId}${session.token ? `?token=${session.token}` : ''}`;
      
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus('connected');
      };

      socket.onclose = () => {
        setWsStatus('disconnected');
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      socket.onerror = () => {
        setWsStatus('disconnected');
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [session, boardId]);

  // Listen for remote mouse pointer movements
  useEffect(() => {
    if (!wsRef.current || wsStatus !== 'connected') return;

    const handleWSMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'cursor') {
          const { x, y, user_id, email: senderEmail } = msg.data;
          if (user_id === session.id) return; // ignore local pointer reflections

          // Deterministic color assignment based on user_id hash
          const colors = ['#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#ef4444', '#06b6d4'];
          let hash = 0;
          for (let i = 0; i < user_id.length; i++) {
            hash += user_id.charCodeAt(i);
          }
          const color = colors[hash % colors.length];

          setRemoteCursors((prev) => ({
            ...prev,
            [user_id]: {
              x,
              y,
              email: senderEmail || 'Anonymous',
              color,
              lastUpdate: Date.now()
            }
          }));
        }
      } catch (err) {}
    };

    const ws = wsRef.current;
    ws.addEventListener('message', handleWSMessage);
    return () => ws.removeEventListener('message', handleWSMessage);
  }, [wsStatus, session]);

  // Periodically prune stagnant remote cursors (if idle/offline for >5 seconds)
  useEffect(() => {
    const pruneTimer = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        const updated = { ...prev };
        let changed = false;
        for (const [id, cursor] of Object.entries(updated)) {
          if (now - cursor.lastUpdate > 5000) {
            delete updated[id];
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 2000);

    return () => clearInterval(pruneTimer);
  }, []);

  // Fetch initial stickies on board change
  useEffect(() => {
    const fetchStickies = async () => {
      try {
        const res = await fetch(`/api/boards/${boardId}/stickies`);
        if (res.ok) {
          const data = await res.json();
          setNotes(data);
        }
      } catch (err) {
        console.error('Failed to load sticky notes:', err);
      }
    };

    fetchStickies();
    setPanOffset({ x: -1000, y: -1000 }); // reset pan position to center on board switch
  }, [boardId, clearTrigger]);

  // Auth Submit Actions
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Verification email sent!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Join Board Handler
  const handleJoinBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardId.trim()) return;
    setBoardId(newBoardId.trim().toLowerCase());
    setNewBoardId('');
  };

  // Copy Board URL
  const copyBoardId = () => {
    navigator.clipboard.writeText(boardId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Local Pointer Move: Broadcast coordinate changes
  const handleWorkspacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wsRef.current || wsStatus !== 'connected') return;

    const now = Date.now();
    if (now - lastCursorSentRef.current < 50) return; // throttle to 20 updates/second
    lastCursorSentRef.current = now;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - panOffset.x; // Convert to virtual world coordinates
    const y = e.clientY - rect.top - panOffset.y; // Convert to virtual world coordinates

    wsRef.current.send(
      JSON.stringify({
        type: 'cursor',
        data: {
          x,
          y,
          user_id: session.id,
          email: session.email
        }
      })
    );
  };

  // Double-Click canvas to spawn a sticky note inside virtual space
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 96;
    const y = e.clientY - rect.top - 64;

    spawnSticky(x, y);
  };

  // Spawns a note at explicit coordinates
  const spawnSticky = (x: number, y: number) => {
    const newNoteId = `note_${session.id}_${Date.now()}`;
    const newNote = {
      id: newNoteId,
      x,
      y,
      text: '',
      color: '#fef3c7',
      user_id: session.id
    };

    setNotes((prev) => [...prev, newNote]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'sticky',
          data: {
            action: 'create',
            note_id: newNoteId,
            x,
            y,
            text: '',
            color: '#fef3c7',
            user_id: session.id
          }
        })
      );
    }
  };

  const handleToolbarSpawnSticky = () => {
    // Spawns note centered relative to the panned board viewport
    spawnSticky(250 + Math.random() * 80 - panOffset.x, 200 + Math.random() * 80 - panOffset.y);
  };

  // Reset Board DB contents & clear screen
  const handleClearBoard = async () => {
    if (!window.confirm('Are you sure you want to clear the entire blackboard?')) return;
    
    // Clear UI state instantly for responsiveness (Optimistic clear)
    setNotes([]);
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setClearTrigger((prev) => prev + 1);

    try {
      // Send clear command in the background
      await fetch(`/api/boards/${boardId}/clear`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to sync board clear to server:', err);
    }
  };

  return (
    <div className="app-container" style={{ backgroundColor: '#0e2016' }}>
      {/* Upper Navigation Header */}
      <header className="glass-panel board-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers className="w-5 h-5 text-blue-500" style={{ color: '#60a5fa' }} />
            <span style={{ fontWeight: 600, fontSize: '1.15rem', letterSpacing: '-0.02em', color: '#fcf6f0' }}>DrawLink</span>
          </div>

          {/* Board ID Display & Copy */}
          <div className="glass-panel-light flex-center" style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#dfd0c0' }}>Room:</span>
            <span style={{ color: '#ffffff', fontWeight: 500 }}>{boardId}</span>
            <button
              onClick={copyBoardId}
              style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" style={{ color: '#22c55e' }} /> : <Copy className="w-3.5 h-3.5 text-gray-400 hover:text-white" />}
            </button>
          </div>

          {/* Board Switching Input */}
          <form onSubmit={handleJoinBoard} style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              placeholder="Join room code..."
              value={newBoardId}
              onChange={(e) => setNewBoardId(e.target.value)}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', width: '110px' }}
              className="input-field"
            />
            <button type="submit" className="width-btn" style={{ padding: '0.35rem 0.6rem' }}>
              Switch
            </button>
          </form>
        </div>

        {/* Action controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Connection Status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                wsStatus === 'connected' ? 'bg-green-500 glow-green animate-blink' : 'bg-red-500 glow-red'
              }`}
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: wsStatus === 'connected' ? '#22c55e' : wsStatus === 'connecting' ? '#eab308' : '#ef4444',
                boxShadow: wsStatus === 'connected' ? '0 0 8px #22c55e' : wsStatus === 'connecting' ? '0 0 8px #eab308' : '0 0 8px #ef4444'
              }}
            />
            <span style={{ fontSize: '0.75rem', color: '#dfd0c0', textTransform: 'capitalize' }}>
              {wsStatus === 'connected' ? 'Connected' : wsStatus === 'connecting' ? 'Syncing...' : 'Offline'}
            </span>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />

          <span style={{ fontSize: '0.8rem', color: '#fcf6f0', fontWeight: 500 }}>
            {session.isGuest ? 'Guest' : session.email.split('@')[0]}
          </span>

          {/* Reset / Clear Button */}
          <button
            onClick={handleClearBoard}
            className="width-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.2)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Clear
          </button>

          {/* Login or Sign Out Button */}
          {session.isGuest ? (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="btn-primary"
              style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', border: 'none', fontSize: '0.85rem' }}
            >
              Sign In
            </button>
          ) : (
            <button
              onClick={handleLogout}
              className="width-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit
            </button>
          )}
        </div>
      </header>

      {/* Main Canvas Workspace & Stickies */}
      <main
        className="canvas-container blackboard-frame"
        onPointerMove={handleWorkspacePointerMove}
        style={{
          margin: '1rem',
          position: 'relative',
          overflow: 'hidden',
          background: '#163020'
        }}
      >
        {/* Viewport Wrapper that translates everything inside */}
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            width: '3000px',
            height: '3000px',
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: 'top left',
            backgroundSize: '36px 36px',
            backgroundImage: `
              linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px)
            `,
            backgroundColor: '#163020'
          }}
        >
          <Canvas
            boardId={boardId}
            userId={session.id}
            ws={wsRef.current}
            color={brushColor}
            width={brushWidth}
            clearTrigger={clearTrigger}
            tool={activeTool}
            panOffset={panOffset}
            setPanOffset={setPanOffset}
            onDoubleClick={handleCanvasDoubleClick}
          />
          
          <div id="notes-container-mask" className="absolute inset-0 pointer-events-none">
            <StickyNotes
              boardId={boardId}
              userId={session.id}
              ws={wsRef.current}
              notes={notes}
              setNotes={setNotes}
              tool={activeTool}
            />
          </div>

          {/* Remote Cursors Renderer */}
          {Object.entries(remoteCursors).map(([id, cursor]) => (
            <div
              key={id}
              className="remote-cursor"
              style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                color: cursor.color
              }}
            >
              <div className="remote-cursor-pointer" />
              <div className="remote-cursor-label">
                {cursor.email.split('@')[0]}
              </div>
            </div>
          ))}
        </div>

        {/* Tooltip explaining double clicks (fixed on screen, outside translation div) */}
        <div style={{ position: 'absolute', top: '12px', left: '12px', pointerEvents: 'none', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500 }}>
          * Double-click empty canvas space to place sticky notes. Drag background with Select tool to pan.
        </div>
      </main>

      {/* 흰색 floating macOS-style glass dock */}
      <div className="dock-container">
        {/* Tool Selector Buttons */}
        <button
          onClick={() => setActiveTool('select')}
          className={`dock-item tooltip ${activeTool === 'select' ? 'active' : ''}`}
          data-tooltip="Select & Grab notes"
        >
          <MousePointer2 className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveTool('draw')}
          className={`dock-item tooltip ${activeTool === 'draw' ? 'active' : ''}`}
          data-tooltip="Glowing Neon Chalk"
        >
          <PenTool className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveTool('erase')}
          className={`dock-item tooltip ${activeTool === 'erase' ? 'active' : ''}`}
          data-tooltip="Whiteboard Eraser"
        >
          <Eraser className="w-5 h-5" />
        </button>

        <button
          onClick={handleToolbarSpawnSticky}
          className="dock-item tooltip"
          data-tooltip="Place Sticky Note"
        >
          <PlusCircle className="w-5 h-5" />
        </button>

        <button
          onClick={handleClearBoard}
          className="dock-item tooltip"
          data-tooltip="Clear Blackboard"
          style={{ color: '#fca5a5' }}
        >
          <Trash2 className="w-5 h-5" />
        </button>

        {/* Dynamic configurations based on active tools */}
        {(activeTool === 'draw' || activeTool === 'erase') && (
          <>
            <div className="dock-divider" />
            {activeTool === 'draw' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0 0.25rem' }}>
                {[
                  '#ffffff', // Soft White Chalk
                  '#fef08a', // Soft Yellow Chalk
                  '#fecdd3', // Soft Pink Chalk
                  '#bae6fd', // Soft Blue Chalk
                  '#f5d0fe', // Soft Purple Chalk
                  '#bbf7d0', // Soft Green Chalk
                  '#ffedd5'  // Soft Orange Chalk
                ].map((c) => (
                  <button
                    key={c}
                    onClick={() => setBrushColor(c)}
                    style={{ backgroundColor: c }}
                    className={`color-btn ${brushColor === c ? 'active' : ''}`}
                  />
                ))}
              </div>
            )}

            <div className="dock-divider" />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', paddingRight: '0.25rem' }}>
              {[4, 8, 12, 24].map((w) => (
                <button
                  key={w}
                  onClick={() => setBrushWidth(w)}
                  className={`width-btn ${brushWidth === w ? 'active' : ''}`}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                >
                  {w}px
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Floating Auth Modal Panel */}
      {isAuthModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAuthModalOpen(false)}>
          <div className="glass-panel auth-card" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
            {/* Close Button X */}
            <button
              onClick={() => setIsAuthModalOpen(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '1.5rem',
                fontWeight: 300,
                lineHeight: 1
              }}
            >
              &times;
            </button>

            <div className="flex flex-col items-center gap-1 text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="flex-center animate-blink" style={{ background: 'rgba(59, 130, 246, 0.12)', padding: '0.75rem', borderRadius: '50%', marginBottom: '0.5rem', boxShadow: '0 0 16px rgba(59,130,246,0.2)', animationDuration: '4s' }}>
                <Sparkles className="w-8 h-8 text-blue-500" style={{ color: '#3b82f6' }} />
              </div>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.025em' }}>Save Your Board</h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', padding: '0 1rem' }}>
                Sign in or create an account to save drawings and sticky notes permanently.
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Email Address</label>
                <input
                  type="email"
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-field"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input-field"
                />
              </div>

              {authError && (
                <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>{authError}</p>
              )}

              <button type="submit" disabled={isLoading} className="btn-primary" style={{ padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', border: 'none' }}>
                {isLoading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'center', fontSize: '0.85rem' }}>
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0 }}
              >
                {isSignUp ? 'Already have an account? Sign In' : 'Create new account? Sign Up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
