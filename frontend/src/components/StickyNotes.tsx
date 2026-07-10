import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  user_id: string;
}

interface StickyNotesProps {
  boardId: string;
  userId: string;
  ws: WebSocket | null;
  notes: StickyNote[];
  setNotes: React.Dispatch<React.SetStateAction<StickyNote[]>>;
  tool: 'select' | 'draw' | 'erase';
}

// 파스텔톤 포스트잇 색상 팔레트 (따뜻하고 채도 높은 종이 색감)
const NOTE_COLORS = [
  { bg: '#fef08a', shadow: '#d4a017', tape: '#fde68a', label: 'Yellow' },
  { bg: '#fda4af', shadow: '#be123c', tape: '#fecdd3', label: 'Pink' },
  { bg: '#86efac', shadow: '#15803d', tape: '#bbf7d0', label: 'Green' },
  { bg: '#93c5fd', shadow: '#1d4ed8', tape: '#bfdbfe', label: 'Blue' },
  { bg: '#f9a8d4', shadow: '#9d174d', tape: '#fbcfe8', label: 'Rose' },
  { bg: '#c4b5fd', shadow: '#5b21b6', tape: '#ddd6fe', label: 'Purple' },
  { bg: '#fdba74', shadow: '#c2410c', tape: '#fed7aa', label: 'Orange' },
];

export const StickyNotes: React.FC<StickyNotesProps> = ({
  userId,
  ws,
  notes,
  setNotes
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const dragStartRef = useRef<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });

  // 노트 ID를 기반으로 일관된 고정 기울기 계산
  const getTilt = (id: string): number => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return ((sum % 60) - 30) / 10; // -3.0도 ~ +3.0도 범위
  };

  // 상단 테이프 조각의 회전 각도 계산
  const getTapeAngle = (id: string): number => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i) * (i + 1);
    return ((sum % 30) - 15); // -15도 ~ +15도 범위
  };

  // 노트의 색상 설정 가져오기
  const getColorConfig = (color: string) => {
    return NOTE_COLORS.find(c => c.bg === color) || NOTE_COLORS[0];
  };

  // 포스트잇 이벤트를 위한 웹소켓 메시지 수신
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'clear_board') {
          setNotes([]);
          return;
        }

        if (msg.type !== 'sticky') return;

        const { action, note_id, x, y, text, color, user_id: senderId } = msg.data;

        setNotes((prevNotes) => {
          if (action === 'create') {
            if (prevNotes.some((n) => n.id === note_id)) return prevNotes;
            return [...prevNotes, { id: note_id, x: x || 100, y: y || 100, text: text || '', color: color || '#fef08a', user_id: senderId }];
          }
          if (action === 'update') {
            return prevNotes.map((note) => {
              if (note.id === note_id) {
                return {
                  ...note,
                  x: x !== undefined ? x : note.x,
                  y: y !== undefined ? y : note.y,
                  text: text !== undefined ? text : note.text,
                  color: color !== undefined ? color : note.color
                };
              }
              return note;
            });
          }
          if (action === 'delete') {
            return prevNotes.filter((note) => note.id !== note_id);
          }
          return prevNotes;
        });
      } catch (err) {
        console.error('Error parsing sticky note websocket message:', err);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, setNotes]);

  // 드래그 시작 이벤트 처리
  const handleMouseDown = (e: React.MouseEvent, note: StickyNote) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setActiveDragId(note.id);
    dragStartRef.current = {
      offsetX: e.clientX - note.x,
      offsetY: e.clientY - note.y
    };
  };

  // 드래그 이동 이벤트 처리
  const handleMouseMove = (e: MouseEvent) => {
    if (!activeDragId || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    let newX = e.clientX - dragStartRef.current.offsetX;
    let newY = e.clientY - dragStartRef.current.offsetY;

    newX = Math.max(0, Math.min(newX, containerRect.width - 220));
    newY = Math.max(0, Math.min(newY, containerRect.height - 240));

    setNotes((prev) =>
      prev.map((n) => (n.id === activeDragId ? { ...n, x: newX, y: newY } : n))
    );

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: {
            action: 'update',
            note_id: activeDragId,
            x: newX,
            y: newY,
            user_id: userId
          }
        })
      );
    }
  };

  // 드래그 종료 이벤트 처리
  const handleMouseUp = () => {
    if (!activeDragId) return;
    const note = notes.find((n) => n.id === activeDragId);
    if (note && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: {
            action: 'update',
            note_id: note.id,
            x: note.x,
            y: note.y,
            text: note.text,
            color: note.color,
            user_id: userId
          }
        })
      );
    }
    setActiveDragId(null);
  };

  useEffect(() => {
    if (activeDragId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDragId, notes]);

  const handleTextChange = (id: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: { action: 'update', note_id: id, text, user_id: userId }
        })
      );
    }
  };

  const handleTextBlur = (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (note && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: {
            action: 'update',
            note_id: id,
            x: note.x,
            y: note.y,
            text: note.text,
            color: note.color,
            user_id: userId
          }
        })
      );
    }
  };

  const handleColorChange = (id: string, color: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: { action: 'update', note_id: id, color, user_id: userId }
        })
      );
    }
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: { action: 'delete', note_id: id, user_id: userId }
        })
      );
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
    >
      {notes.map((note) => {
        const isDragging = activeDragId === note.id;
        const isHovered = hoveredNoteId === note.id;
        const tilt = isHovered || isDragging ? 0 : getTilt(note.id);
        const tapeAngle = getTapeAngle(note.id);
        const scale = isDragging ? 1.06 : isHovered ? 1.03 : 1;
        const colorConfig = getColorConfig(note.color);

        return (
          <div
            key={note.id}
            className="sticky-note-wrapper pointer-events-auto"
            onMouseDown={(e) => handleMouseDown(e, note)}
            onMouseEnter={() => setHoveredNoteId(note.id)}
            onMouseLeave={() => setHoveredNoteId(null)}
            style={{
              position: 'absolute',
              left: note.x,
              top: note.y,
              zIndex: isDragging ? 200 : isHovered ? 150 : 10,
              transform: `rotate(${tilt}deg) scale(${scale})`,
              transformOrigin: 'top center',
              transition: isDragging
                ? 'transform 0.05s ease, box-shadow 0.2s ease'
                : 'transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28), box-shadow 0.2s ease',
            }}
          >
            {/* Tape strip at top */}
            <div
              style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: `translateX(-50%) rotate(${tapeAngle}deg)`,
                width: '52px',
                height: '22px',
                background: `${colorConfig.tape}cc`,
                borderRadius: '3px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                zIndex: 2,
                border: `1px solid ${colorConfig.bg}`,
                backdropFilter: 'none',
                // 테이프 질감 선 표현
                backgroundImage: `repeating-linear-gradient(
                  90deg,
                  transparent,
                  transparent 3px,
                  rgba(255,255,255,0.15) 3px,
                  rgba(255,255,255,0.15) 4px
                )`,
              }}
            />

            {/* Main note body */}
            <div
              style={{
                width: '210px',
                minHeight: '200px',
                background: `linear-gradient(
                  160deg,
                  ${colorConfig.bg} 0%,
                  ${colorConfig.bg}dd 100%
                )`,
                boxShadow: isDragging
                  ? `0 22px 45px rgba(0,0,0,0.45), 4px 4px 0 ${colorConfig.shadow}33`
                  : isHovered
                    ? `0 14px 28px rgba(0,0,0,0.3), 3px 3px 0 ${colorConfig.shadow}33`
                    : `0 6px 14px rgba(0,0,0,0.22), 2px 2px 0 ${colorConfig.shadow}33`,
                borderRadius: '2px 2px 4px 4px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                cursor: isDragging ? 'grabbing' : 'grab',
                overflow: 'hidden',
                // 테두리를 활용한 종이 접힘(모서리) 효과 표현
                clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 0 100%)',
              }}
            >
              {/* Lined paper effect */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `repeating-linear-gradient(
                    transparent,
                    transparent 27px,
                    rgba(0,0,0,0.06) 27px,
                    rgba(0,0,0,0.06) 28px
                  )`,
                  backgroundPositionY: '44px',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />

              {/* Folded corner triangle */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 0,
                  height: 0,
                  borderStyle: 'solid',
                  borderWidth: '0 20px 20px 0',
                  borderColor: `transparent ${colorConfig.shadow}33 transparent transparent`,
                  zIndex: 2,
                  filter: 'drop-shadow(-1px 1px 2px rgba(0,0,0,0.15))',
                }}
              />

              {/* Top control bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px 6px 12px',
                  position: 'relative',
                  zIndex: 3,
                  borderBottom: `1px solid ${colorConfig.shadow}22`,
                }}
              >
                {/* Color dots */}
                <div style={{ display: 'flex', gap: '5px' }}>
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.bg}
                      onClick={() => handleColorChange(note.id, c.bg)}
                      title={c.label}
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        backgroundColor: c.bg,
                        border: note.color === c.bg
                          ? `2px solid rgba(0,0,0,0.5)`
                          : `1.5px solid rgba(0,0,0,0.15)`,
                        cursor: 'pointer',
                        transition: 'transform 0.12s',
                        transform: note.color === c.bg ? 'scale(1.25)' : 'scale(1)',
                        boxShadow: note.color === c.bg ? '0 0 0 2px rgba(255,255,255,0.6)' : 'none',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: `${colorConfig.shadow}88`,
                    padding: '2px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.15s, background 0.15s',
                    lineHeight: 1,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = '#ef4444';
                    (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = `${colorConfig.shadow}88`;
                    (e.currentTarget as HTMLElement).style.background = 'none';
                  }}
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>

              {/* Text area */}
              <textarea
                value={note.text}
                onChange={(e) => handleTextChange(note.id, e.target.value)}
                onBlur={() => handleTextBlur(note.id)}
                placeholder="메모를 입력하세요..."
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  minHeight: '150px',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  padding: '10px 14px 14px 14px',
                  fontSize: '14px',
                  lineHeight: '28px',
                  color: '#1a1a1a',
                  fontFamily: "'Caveat', 'Patrick Hand', 'Segoe UI', cursive, sans-serif",
                  fontWeight: 500,
                  cursor: 'text',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  position: 'relative',
                  zIndex: 3,
                  letterSpacing: '0.02em',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
