import { useState, useEffect, useRef } from 'react';
import { LogOut, RefreshCw, Layers, MousePointer2, PenTool, Eraser, PlusCircle, Trash2, Users } from 'lucide-react';
import { supabase } from './supabase';
import { Canvas } from './components/Canvas';
import { StickyNotes } from './components/StickyNotes';
import { AuthModal } from './components/AuthModal';
import { RoomModal } from './components/RoomModal';

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
  // 세션 상태 관리 - 기본값으로 게스트로 시작합니다
  const [session, setSession] = useState<UserSession>(defaultGuest());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);

  // 앱 워크스페이스(현재 보드) 상태
  const [boardId, setBoardId] = useState('lobby');

  // 활성 도구 선택: 'select' (선택/이동) | 'draw' (네온 초크 드로잉) | 'erase' (지우개)
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'erase'>('draw');

  // 캔버스 드로잉(선 굵기/색상) 설정
  const [brushColor, setBrushColor] = useState('#ffffff'); // 기본 색상: 칠판 흰색
  const [brushWidth, setBrushWidth] = useState(8); // 기본 브러시 굵기
  const [clearTrigger, setClearTrigger] = useState(0);

  // 가상 보드 스크롤을 위한 화면 이동(팬) 오프셋
  const [panOffset, setPanOffset] = useState({ x: -1000, y: -1000 });

  // 포스트잇 상태 관리
  const [notes, setNotes] = useState<StickyNote[]>([]);

  // 다른 사용자의 원격 커서 상태 관리
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const lastCursorSentRef = useRef<number>(0);

  // 웹소켓 객체 참조 및 연결 상태 관리
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // 컴포넌트 마운트 시 현재 Supabase 세션 확인
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
        setIsAuthModalOpen(false); // 로그인 성공 시 모달 닫기
      } else {
        setSession(defaultGuest());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // URL 파라미터와 현재 boardId 동기화
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam !== boardId) {
      setBoardId(roomParam.toLowerCase());
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (boardId !== 'lobby') {
      url.searchParams.set('room', boardId);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  }, [boardId]);

  // 웹소켓 설정 및 동적 연결 주소 생성
  useEffect(() => {
    let isMounted = true;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;

    const connectWebSocket = () => {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('웹소켓 재연결 횟수 초과');
        return;
      }
      
      setWsStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
      const wsUrl = `${protocol}//${host}/api/ws/${boardId}${session.token ? `?token=${session.token}` : ''}`;
      
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isMounted) return;
        reconnectAttempts = 0; // 연결 성공 시 재시도 횟수 초기화
        setWsStatus('connected');
      };

      socket.onclose = () => {
        if (!isMounted) return;
        setWsStatus('disconnected');
        reconnectAttempts++;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connectWebSocket();
          }, 3000);
        } else {
          console.error('웹소켓 서버에 접속할 수 없습니다. (재연결 시도 중단)');
        }
      };

      socket.onerror = () => {
        if (!isMounted) return;
        setWsStatus('disconnected');
      };
    };

    connectWebSocket();

  }, [session, boardId]);

  // 원격 마우스 포인터 이동 이벤트 수신
  useEffect(() => {
    if (!wsRef.current || wsStatus !== 'connected') return;

    const handleWSMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'cursor') {
          const { x, y, user_id, email: senderEmail } = msg.data;
          if (user_id === session.id) return; // 자신의 포인터 움직임은 무시합니다

          // user_id 해시를 기반으로 일관된 색상을 할당합니다
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

  // 비활성 원격 커서 주기적으로 정리 (5초 이상 대기/오프라인인 경우)
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

  // 보드가 변경될 때 초기 포스트잇 목록을 불러옵니다
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
    setPanOffset({ x: -1000, y: -1000 }); // 보드 전환 시 화면 위치를 중앙으로 초기화
  }, [boardId, clearTrigger]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };



  // 로컬 마우스 이동: 변경된 좌표를 브로드캐스트
  const handleWorkspacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wsRef.current || wsStatus !== 'connected') return;

    const now = Date.now();
    if (now - lastCursorSentRef.current < 50) return; // 초당 20회 업데이트로 스로틀링(제한)
    lastCursorSentRef.current = now;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - panOffset.x; // 가상 세계 좌표로 변환
    const y = e.clientY - rect.top - panOffset.y; // 가상 세계 좌표로 변환

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

  // 캔버스 더블 클릭 시 가상 공간 내에 포스트잇 생성
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 96;
    const y = e.clientY - rect.top - 64;

    spawnSticky(x, y);
  };

  // 지정된 명시적 좌표에 포스트잇을 생성합니다
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
    // 화면(viewport) 중앙을 기준으로 포스트잇을 생성합니다
    spawnSticky(250 + Math.random() * 80 - panOffset.x, 200 + Math.random() * 80 - panOffset.y);
  };

  // 보드의 DB 데이터를 초기화하고 화면을 지웁니다
  const handleClearBoard = async () => {
    if (!window.confirm('Are you sure you want to clear the entire blackboard?')) return;
    
    // 빠른 반응성을 위해 UI 상태를 즉시 지웁니다 (낙관적 업데이트)
    setNotes([]);
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setClearTrigger((prev) => prev + 1);

    try {
      // 백그라운드에서 초기화 명령을 전송합니다
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

          {/* Board Management Button */}
          <button
            onClick={() => setIsRoomModalOpen(true)}
            className="glass-panel-light flex-center tooltip"
            data-tooltip="방 관리 / 공유"
            style={{ 
              padding: '0.45rem 1rem', borderRadius: '20px', gap: '0.5rem', 
              fontSize: '0.85rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)',
              color: '#ffffff', transition: 'all 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.2)'}
          >
            <Users size={16} color="#94a3b8" />
            <span style={{ color: '#dfd0c0' }}>Room:</span>
            <span style={{ fontWeight: 600, color: '#a5f3fc' }}>{boardId}</span>
          </button>
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
                  '#ffffff', // 부드러운 흰색 초크
                  '#fef08a', // 부드러운 노란색 초크
                  '#fecdd3', // 부드러운 분홍색 초크
                  '#bae6fd', // 부드러운 파란색 초크
                  '#f5d0fe', // 부드러운 보라색 초크
                  '#bbf7d0', // 부드러운 초록색 초크
                  '#ffedd5'  // 부드러운 주황색 초크
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

      {/* Auth Modal */}
      {isAuthModalOpen && (
        <AuthModal onClose={() => setIsAuthModalOpen(false)} />
      )}

      {/* Room Modal */}
      {isRoomModalOpen && (
        <RoomModal
          currentBoardId={boardId}
          onJoinRoom={(newRoom) => setBoardId(newRoom.toLowerCase())}
          onClose={() => setIsRoomModalOpen(false)}
        />
      )}
    </div>
  );
}
