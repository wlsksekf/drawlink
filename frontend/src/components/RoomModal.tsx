import { useState } from 'react';
import { Copy, Check, ArrowRight, Shuffle, X, Link2, Users, Hash } from 'lucide-react';

interface RoomModalProps {
  currentBoardId: string;
  onJoinRoom: (roomId: string) => void;
  onClose: () => void;
}

// 재미있는 단어 조합으로 방 이름 생성
const ADJECTIVES = ['swift', 'cool', 'bright', 'calm', 'bold', 'wild', 'cozy', 'crisp', 'deep', 'epic', 'firm', 'glad', 'hazy', 'icy', 'keen', 'lush', 'mild', 'neat', 'peak', 'pure'];
const NOUNS = ['panda', 'tiger', 'eagle', 'ocean', 'spark', 'storm', 'river', 'cloud', 'stone', 'flame', 'frost', 'grove', 'haven', 'island', 'jungle', 'lake', 'meadow', 'nova', 'orbit', 'pixel'];

function generateRoomId(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}

type TabType = 'create' | 'join' | 'share';

export function RoomModal({ currentBoardId, onJoinRoom, onClose }: RoomModalProps) {
  const [tab, setTab] = useState<TabType>('share');
  const [newRoomId, setNewRoomId] = useState(() => generateRoomId());
  const [joinCode, setJoinCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const shareUrl = `${window.location.origin}?room=${currentBoardId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentBoardId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCreateRoom = () => {
    onJoinRoom(newRoomId);
    onClose();
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (!code) return;
    onJoinRoom(code);
    onClose();
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'share', label: '공유', icon: <Link2 size={14} /> },
    { key: 'create', label: '방 만들기', icon: <Users size={14} /> },
    { key: 'join', label: '참여', icon: <Hash size={14} /> },
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 1000 }}
    >
      <div
        className="glass-panel"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '1.75rem',
          borderRadius: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '14px', right: '16px',
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '1.4rem', fontWeight: 300,
            lineHeight: 1, padding: '2px 6px', borderRadius: '4px',
            transition: 'color 0.15s', fontFamily: 'inherit'
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#f1f5f9')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div>
          <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            방 관리
          </h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>
            현재 방: <span style={{ color: '#a5f3fc', fontWeight: 600 }}>{currentBoardId}</span>
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', background: 'rgba(0,0,0,0.3)',
          borderRadius: '12px', padding: '4px', gap: '4px'
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '0.5rem 0.25rem', borderRadius: '9px',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                background: tab === t.key ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: tab === t.key ? '#f1f5f9' : '#64748b',
                boxShadow: tab === t.key ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── 공유 탭 ─────────────────────────────────────── */}
        {tab === 'share' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.83rem', lineHeight: 1.6 }}>
              아래 링크나 코드를 친구에게 보내세요. 친구가 링크를 열면 같은 보드에 바로 입장합니다.
            </p>

            {/* Share link */}
            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                초대 링크
              </label>
              <div style={{
                display: 'flex', gap: '0.5rem', alignItems: 'center',
                background: 'rgba(0,0,0,0.3)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)', padding: '0.6rem 0.75rem',
              }}>
                <span style={{
                  flex: 1, fontSize: '0.8rem', color: '#94a3b8',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {shareUrl}
                </span>
                <button
                  onClick={handleCopyLink}
                  style={{
                    background: copiedLink ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${copiedLink ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: '7px', padding: '0.35rem 0.65rem',
                    cursor: 'pointer', color: copiedLink ? '#22c55e' : '#94a3b8',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.78rem', fontWeight: 500, transition: 'all 0.2s',
                    whiteSpace: 'nowrap', fontFamily: 'inherit'
                  }}
                >
                  {copiedLink ? <Check size={13} /> : <Copy size={13} />}
                  {copiedLink ? '복사됨!' : '복사'}
                </button>
              </div>
            </div>

            {/* Room code */}
            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                방 코드
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <div style={{
                  flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem 1rem',
                  textAlign: 'center',
                }}>
                  <span style={{
                    fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.08em',
                    color: '#a5f3fc', fontFamily: 'monospace'
                  }}>
                    {currentBoardId}
                  </span>
                </div>
                <button
                  onClick={handleCopyCode}
                  style={{
                    background: copiedCode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${copiedCode ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: '10px', padding: '0.75rem 1rem',
                    cursor: 'pointer', color: copiedCode ? '#22c55e' : '#94a3b8',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.82rem', fontWeight: 500, transition: 'all 0.2s',
                    whiteSpace: 'nowrap', fontFamily: 'inherit'
                  }}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCode ? '복사됨!' : '코드 복사'}
                </button>
              </div>
            </div>

            {/* Online users hint */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.65rem 0.9rem',
              background: 'rgba(165,243,252,0.06)',
              border: '1px solid rgba(165,243,252,0.12)',
              borderRadius: '10px',
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                같은 코드를 입력하면 실시간으로 함께 그릴 수 있어요
              </span>
            </div>
          </div>
        )}

        {/* ── 방 만들기 탭 ─────────────────────────────────── */}
        {tab === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.83rem', lineHeight: 1.6 }}>
              새 방을 만들면 빈 보드가 생성됩니다. 방 이름을 직접 수정하거나 랜덤으로 생성할 수 있어요.
            </p>

            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                새 방 이름
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={newRoomId}
                  onChange={e => setNewRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="방 이름 입력..."
                  className="input-field"
                  style={{ flex: 1, fontSize: '0.9rem', fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  onClick={() => setNewRoomId(generateRoomId())}
                  title="랜덤 이름 생성"
                  style={{
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px', padding: '0 0.75rem', cursor: 'pointer',
                    color: '#94a3b8', display: 'flex', alignItems: 'center', transition: 'all 0.15s',
                    fontFamily: 'inherit'
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f1f5f9'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                >
                  <Shuffle size={16} />
                </button>
              </div>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.73rem', color: '#475569' }}>
                영문 소문자, 숫자, 하이픈(-)만 사용 가능
              </p>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={!newRoomId.trim()}
              className="btn-primary"
              style={{
                padding: '0.75rem', borderRadius: '10px', border: 'none',
                cursor: newRoomId.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.95rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '0.4rem',
                opacity: newRoomId.trim() ? 1 : 0.5,
              }}
            >
              <Users size={16} />
              새 방 만들기
            </button>

            <p style={{ margin: 0, textAlign: 'center', fontSize: '0.78rem', color: '#475569' }}>
              방 이름은 공유 링크에 포함됩니다
            </p>
          </div>
        )}

        {/* ── 참여 탭 ──────────────────────────────────────── */}
        {tab === 'join' && (
          <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.83rem', lineHeight: 1.6 }}>
              친구에게 받은 방 코드를 입력하면 같은 보드에 입장합니다.
            </p>

            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem' }}>
                방 코드 입력
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                placeholder="예: swift-panda-342"
                className="input-field"
                style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.95rem', fontFamily: 'monospace', letterSpacing: '0.04em' }}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={!joinCode.trim()}
              className="btn-primary"
              style={{
                padding: '0.75rem', borderRadius: '10px', border: 'none',
                cursor: joinCode.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.95rem', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '0.4rem',
                opacity: joinCode.trim() ? 1 : 0.5,
              }}
            >
              <ArrowRight size={16} />
              방 입장하기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
