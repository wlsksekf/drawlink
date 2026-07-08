import React, { useRef, useEffect } from 'react';

interface Point {
  x: number;
  y: number;
}

interface CanvasProps {
  boardId: string;
  userId: string;
  ws: WebSocket | null;
  color: string;
  width: number;
  clearTrigger: number;
  tool: 'select' | 'draw' | 'erase';
  panOffset: { x: number; y: number };
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onDoubleClick?: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

interface RemoteLine {
  lastPoint: Point;
  color: string;
  width: number;
}

// Pre-render a fuzzy, noisy circle brush for chalk texture with core roughness and outer dust halos
const createChalkBrush = (color: string, size: number): HTMLCanvasElement => {
  const brush = document.createElement('canvas');
  // Add padding around the core to contain the outer scattered dust particles
  const padding = Math.max(8, size * 0.8);
  const brushSize = size + padding * 2;
  brush.width = brushSize;
  brush.height = brushSize;
  const ctx = brush.getContext('2d');
  if (!ctx) return brush;

  const center = brushSize / 2;
  const radius = size / 2;

  // 1. Draw bumpy, rough chalk core (by overlaying multiple offset soft circles)
  ctx.fillStyle = color;
  const coreDots = 8;
  for (let i = 0; i < coreDots; i++) {
    const offsetLimit = radius * 0.15;
    const ox = (Math.random() - 0.5) * offsetLimit;
    const oy = (Math.random() - 0.5) * offsetLimit;
    const r = radius * (0.8 + Math.random() * 0.3); // slight variations in size
    
    ctx.globalAlpha = 0.2 + Math.random() * 0.3; // layering soft circles
    ctx.beginPath();
    ctx.arc(center + ox, center + oy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Draw outer scattered chalk dust halo particles
  const dustCount = Math.floor(size * 1.5) + 12;
  ctx.fillStyle = color;
  for (let i = 0; i < dustCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Distribute particles from inner core up to 1.8x core radius
    const dist = radius * 0.4 + Math.random() * (radius * 1.4 + 4);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    const dustSize = Math.random() * 1.3 + 0.4; // tiny speckles between 0.4px and 1.7px
    ctx.globalAlpha = Math.random() * 0.4 + 0.15; // low opacity particles
    ctx.beginPath();
    ctx.arc(center + dx, center + dy, dustSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1.0; // reset

  // 3. Post-process to make the texture porous (rough chalkboard noise filter)
  const imgData = ctx.getImageData(0, 0, brushSize, brushSize);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha > 0) {
      const rand = Math.random();
      if (rand > 0.5) {
        data[i + 3] = 0; // Cut out pixels to create empty pores
      } else {
        data[i + 3] = Math.floor(alpha * (Math.random() * 0.65 + 0.25)); // uneven chalk thickness
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return brush;
};

export const Canvas: React.FC<CanvasProps> = ({
  boardId,
  userId,
  ws,
  color,
  width,
  clearTrigger,
  tool,
  panOffset,
  setPanOffset,
  onDoubleClick
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentLineIdRef = useRef<string>('');
  const lastPointRef = useRef<Point>({ x: 0, y: 0 });
  const pointsAccumulatorRef = useRef<Point[]>([]);

  // Track remote draw states to connect segments smoothly
  const remoteLinesRef = useRef<Record<string, RemoteLine>>({});

  // Chalk Brush cache
  const brushCacheRef = useRef<Record<string, HTMLCanvasElement>>({});

  // Panning drag states (isGrabbing updates cursors, isPanningRef tracks panning synchronously)
  const [isGrabbing, setIsGrabbing] = React.useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const initialPanOffsetRef = useRef({ x: 0, y: 0 });

  // Determine active parameters based on tool selection
  const isEraser = tool === 'erase';
  const activeColor = isEraser ? 'eraser' : color;
  const activeWidth = isEraser ? Math.max(24, width * 4) : width;

  // Draw segment utility that handles both eraser and chalk textures
  const drawSegmentInCtx = (
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    strokeColor: string,
    strokeWidth: number
  ) => {
    if (strokeColor === 'eraser') {
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = strokeWidth;
      ctx.shadowBlur = 0;
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    ctx.globalCompositeOperation = 'source-over';
    const brushKey = `${strokeColor}_${strokeWidth}`;
    let brush = brushCacheRef.current[brushKey];
    if (!brush) {
      brush = createChalkBrush(strokeColor, strokeWidth);
      brushCacheRef.current[brushKey] = brush;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Stamp the brush along the line at small intervals for density
    const step = Math.max(1.2, strokeWidth / 5);
    const steps = Math.max(1, dist / step);
    
    // Offset calculation based on padded brush size
    const padding = Math.max(8, strokeWidth * 0.8);
    const brushSize = strokeWidth + padding * 2;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = start.x + dx * t - brushSize / 2;
      const y = start.y + dy * t - brushSize / 2;
      ctx.drawImage(brush, x, y);
    }
  };

  const drawSegment = (start: Point, end: Point, strokeColor: string, strokeWidth: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawSegmentInCtx(ctx, start, end, strokeColor, strokeWidth);
  };

  // Fetch initial board state and render it
  useEffect(() => {
    const fetchDrawings = async () => {
      try {
        const response = await fetch(`/api/boards/${boardId}/drawings`);
        if (!response.ok) throw new Error('Failed to load board state');
        const drawings = await response.json();
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas before drawing history
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw historic lines
        drawings.forEach((drawing: any) => {
          const pts = drawing.points;
          if (pts && pts.length > 1) {
            const isLineEraser = drawing.color === 'eraser' || drawing.color === '#0d1222' || drawing.color === '#163020';
            
            if (isLineEraser) {
              ctx.beginPath();
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.globalCompositeOperation = 'destination-out';
              ctx.strokeStyle = 'rgba(0,0,0,1)';
              ctx.lineWidth = drawing.width || 20;
              ctx.shadowBlur = 0;
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
              }
              ctx.stroke();
            } else {
              const strokeColor = drawing.color || '#ffffff';
              const strokeWidth = drawing.width || 4;
              for (let i = 0; i < pts.length - 1; i++) {
                drawSegmentInCtx(ctx, pts[i], pts[i+1], strokeColor, strokeWidth);
              }
            }
          }
        });
        
        ctx.globalCompositeOperation = 'source-over'; // Reset
      } catch (err) {
        console.error('Error fetching drawings:', err);
      }
    };

    fetchDrawings();
  }, [boardId, clearTrigger]);

  // Adjust canvas resolution for Retina/High-DPI displays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resizeCanvas = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Listen to WebSocket messages for remote drawing events
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'clear_board') {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
          return;
        }

        if (msg.type !== 'draw') return;

        const { action, line_id, points, color: remoteColor, width: remoteWidth } = msg.data;
        
        if (action === 'draw_start' && points && points.length > 0) {
          remoteLinesRef.current[line_id] = {
            lastPoint: points[0],
            color: remoteColor || '#ffffff',
            width: remoteWidth || 4
          };
        } else if (action === 'draw_progress' && points && points.length > 0) {
          const remoteLine = remoteLinesRef.current[line_id];
          const newPoint = points[0];
          if (remoteLine) {
            drawSegment(remoteLine.lastPoint, newPoint, remoteLine.color, remoteLine.width);
            remoteLine.lastPoint = newPoint;
          } else {
            remoteLinesRef.current[line_id] = {
              lastPoint: newPoint,
              color: remoteColor || '#ffffff',
              width: remoteWidth || 4
            };
          }
        } else if (action === 'draw_end') {
          delete remoteLinesRef.current[line_id];
        }
      } catch (err) {
        console.error('Error handling draw socket message:', err);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  // Utility to get coordinates relative to canvas
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  // Local mouse / touch handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (tool === 'select') {
      // Start Drag-to-Pan
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      isPanningRef.current = true;
      setIsGrabbing(true);
      panStartRef.current = { x: clientX, y: clientY };
      initialPanOffsetRef.current = { ...panOffset };
      return;
    }

    const point = getCoordinates(e);
    if (!point) return;

    isDrawingRef.current = true;
    lastPointRef.current = point;
    currentLineIdRef.current = `line_${userId}_${Date.now()}`;
    pointsAccumulatorRef.current = [point];

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'draw',
        data: {
          action: 'draw_start',
          line_id: currentLineIdRef.current,
          points: [point],
          color: activeColor,
          width: activeWidth,
          user_id: userId
        }
      }));
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (tool === 'select') {
      if (!isPanningRef.current) return;
      // Continue Drag-to-Pan
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - panStartRef.current.x;
      const dy = clientY - panStartRef.current.y;
      setPanOffset({
        x: initialPanOffsetRef.current.x + dx,
        y: initialPanOffsetRef.current.y + dy
      });
      return;
    }

    if (!isDrawingRef.current) return;
    const point = getCoordinates(e);
    if (!point) return;

    const start = lastPointRef.current;
    drawSegment(start, point, activeColor, activeWidth);

    lastPointRef.current = point;
    pointsAccumulatorRef.current.push(point);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'draw',
        data: {
          action: 'draw_progress',
          line_id: currentLineIdRef.current,
          points: [point],
          color: activeColor,
          width: activeWidth,
          user_id: userId
        }
      }));
    }
  };

  const endDrawing = () => {
    if (tool === 'select') {
      isPanningRef.current = false;
      setIsGrabbing(false);
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'draw',
        data: {
          action: 'draw_end',
          line_id: currentLineIdRef.current,
          points: pointsAccumulatorRef.current,
          color: activeColor,
          width: activeWidth,
          user_id: userId
        }
      }));
    }

    pointsAccumulatorRef.current = [];
    currentLineIdRef.current = '';
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={endDrawing}
      onMouseLeave={endDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={endDrawing}
      onDoubleClick={onDoubleClick}
      className={`absolute top-0 left-0 w-full h-full touch-none ${
        tool === 'select' 
          ? (isGrabbing ? 'cursor-grabbing' : 'cursor-grab') 
          : tool === 'erase' 
            ? 'cursor-board-erase' 
            : 'cursor-board-draw'
      }`}
    />
  );
};
