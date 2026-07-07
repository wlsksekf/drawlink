import React, { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

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

export const StickyNotes: React.FC<StickyNotesProps> = ({
  boardId,
  userId,
  ws,
  notes,
  setNotes,
  tool
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragStartRef = useRef<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });

  // Deterministic rotation helper to give notes a natural, sticky-paper feel
  const getTilt = (id: string): string => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      sum += id.charCodeAt(i);
    }
    // Yields a stable value between -2.5 and +2.5 degrees based on note id
    const deg = ((sum % 50) - 25) / 10;
    return `${deg}deg`;
  };

  // Listen to WebSocket messages for sticky notes
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
            return [...prevNotes, { id: note_id, x: x || 100, y: y || 100, text: text || '', color: color || '#fef3c7', user_id: senderId }];
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

  // Handle Drag Start
  const handleMouseDown = (e: React.MouseEvent, note: StickyNote) => {
    // Only allow dragging when SELECT tool is active (keeps canvas drawing clean)
    if (tool !== 'select') return;

    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).closest('button')) {
      return; // Focus writing pad or activate trash click
    }
    e.preventDefault();
    setActiveDragId(note.id);
    dragStartRef.current = {
      offsetX: e.clientX - note.x,
      offsetY: e.clientY - note.y
    };
  };

  // Handle Drag Move
  const handleMouseMove = (e: MouseEvent) => {
    if (!activeDragId || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    let newX = e.clientX - dragStartRef.current.offsetX;
    let newY = e.clientY - dragStartRef.current.offsetY;

    // Bounds checking
    newX = Math.max(0, Math.min(newX, containerRect.width - 192)); // match w-48 (192px)
    newY = Math.max(0, Math.min(newY, containerRect.height - 180));

    // Update local state
    setNotes((prev) =>
      prev.map((n) => (n.id === activeDragId ? { ...n, x: newX, y: newY } : n))
    );

    // Broadcast update
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

  // Handle Drag End
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

  // Update text values
  const handleTextChange = (id: string, text: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, text } : n))
    );

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: {
            action: 'update',
            note_id: id,
            text,
            user_id: userId
          }
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

  // Change Sticky Note Color
  const handleColorChange = (id: string, color: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, color } : n))
    );

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: {
            action: 'update',
            note_id: id,
            color,
            user_id: userId
          }
        })
      );
    }
  };

  // Delete Sticky Note
  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'sticky',
          data: {
            action: 'delete',
            note_id: id,
            user_id: userId
          }
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
        const transformStyle = isDragging
          ? `translate(${note.x}px, ${note.y}px) rotate(0deg) scale(1.04)`
          : `translate(${note.x}px, ${note.y}px) rotate(${getTilt(note.id)})`;

        return (
          <div
            key={note.id}
            onMouseDown={(e) => handleMouseDown(e, note)}
            style={{
              transform: transformStyle,
              backgroundColor: note.color,
              position: 'absolute',
              zIndex: isDragging ? 50 : 10
            }}
            className="pointer-events-auto w-48 p-3 rounded-lg shadow-lg border border-black/10 flex flex-col gap-2 cursor-move sticky-note-tilt"
          >
            <div className="flex justify-between items-center select-none border-b border-black/5 pb-1">
              {/* Color Palette Selector */}
              <div className="flex gap-1">
                {['#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3'].map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(note.id, c)}
                    style={{ backgroundColor: c }}
                    className={`w-3.5 h-3.5 rounded-full border border-black/20 hover:scale-110 transition-transform ${
                      note.color === c ? 'ring-1 ring-black/50' : ''
                    }`}
                  />
                ))}
              </div>

              {/* Delete button */}
              <button
                onClick={() => handleDeleteNote(note.id)}
                className="text-black/40 hover:text-red-500 transition-colors p-0.5 rounded hover:bg-black/5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <textarea
              value={note.text}
              onChange={(e) => handleTextChange(note.id, e.target.value)}
              onBlur={() => handleTextBlur(note.id)}
              placeholder={tool === 'select' ? "Type note here..." : "Switch to Select Tool to type"}
              disabled={tool !== 'select'}
              className="w-full h-24 bg-transparent resize-none border-none outline-none text-sm text-gray-800 placeholder-gray-500/60 leading-relaxed font-sans cursor-text disabled:cursor-not-allowed"
            />
          </div>
        );
      })}
    </div>
  );
};
