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

// 초크 질감을 위해 내부 코어와 외부 분필 가루가 있는 원형 브러시를 미리 렌더링합니다
const createChalkBrush = (color: string, size: number): HTMLCanvasElement => {
  const brush = document.createElement('canvas');
  // 분산된 외부 분필 가루 입자를 포함할 수 있도록 코어 주변에 여백(패딩)을 추가합니다
  const padding = Math.max(8, size * 0.8);
  const brushSize = size + padding * 2;
  brush.width = brushSize;
  brush.height = brushSize;
  const ctx = brush.getContext('2d');
  if (!ctx) return brush;

  const center = brushSize / 2;
  const radius = size / 2;

  // 1. 울퉁불퉁하고 거친 초크 코어 그리기 (위치가 조금씩 다른 부드러운 원들을 겹침)
  ctx.fillStyle = color;
  const coreDots = 8;
  for (let i = 0; i < coreDots; i++) {
    const offsetLimit = radius * 0.15;
    const ox = (Math.random() - 0.5) * offsetLimit;
    const oy = (Math.random() - 0.5) * offsetLimit;
    const r = radius * (0.8 + Math.random() * 0.3); // 크기의 미세한 변화
    
    ctx.globalAlpha = 0.2 + Math.random() * 0.3; // 부드러운 원 투명도 겹치기
    ctx.beginPath();
    ctx.arc(center + ox, center + oy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. 외부에 흩뿌려진 분필 가루 입자 그리기
  const dustCount = Math.floor(size * 1.5) + 12;
  ctx.fillStyle = color;
  for (let i = 0; i < dustCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    // 내부 코어에서 코어 반경의 최대 1.8배까지 입자 분산
    const dist = radius * 0.4 + Math.random() * (radius * 1.4 + 4);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    const dustSize = Math.random() * 1.3 + 0.4; // 0.4px과 1.7px 사이의 아주 작은 입자
    ctx.globalAlpha = Math.random() * 0.4 + 0.15; // 낮은 투명도 입자
    ctx.beginPath();
    ctx.arc(center + dx, center + dy, dustSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1.0; // 투명도 초기화

  // 3. 다공성 질감으로 만들기 위한 후처리 (거친 칠판 노이즈 필터 적용)
  const imgData = ctx.getImageData(0, 0, brushSize, brushSize);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha > 0) {
      const rand = Math.random();
      if (rand > 0.5) {
        data[i + 3] = 0; // 픽셀을 잘라내어 빈 공간(기공) 생성
      } else {
        data[i + 3] = Math.floor(alpha * (Math.random() * 0.65 + 0.25)); // 불균일한 분필 두께 표현
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

  // 부드러운 선 연결을 위해 원격 드로잉 상태 추적
  const remoteLinesRef = useRef<Record<string, RemoteLine>>({});

  // 초크 브러시 캐시
  const brushCacheRef = useRef<Record<string, HTMLCanvasElement>>({});

  // 화면 이동(팬) 드래그 상태 (isGrabbing은 커서를 업데이트하고, isPanningRef는 동기식으로 추적함)
  const [isGrabbing, setIsGrabbing] = React.useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const initialPanOffsetRef = useRef({ x: 0, y: 0 });

  // 선택한 도구에 따른 활성 파라미터 결정
  const isEraser = tool === 'erase';
  const activeColor = isEraser ? 'eraser' : color;
  const activeWidth = isEraser ? Math.max(24, width * 4) : width;

  // 지우개와 초크 질감 모두를 처리하는 선 그리기 유틸리티 함수
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
    
    // 밀도를 높이기 위해 짧은 간격으로 브러시를 선을 따라 찍음
    const step = Math.max(1.2, strokeWidth / 5);
    const steps = Math.max(1, dist / step);
    
    // 패딩이 적용된 브러시 크기를 기반으로 오프셋 계산
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

  // 초기 보드 상태를 가져오고 렌더링
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

        // 기존 선을 그리기 전에 캔버스 초기화
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 기록된 선들을 그림
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
        
        ctx.globalCompositeOperation = 'source-over'; // 합성 모드 초기화
      } catch (err) {
        console.error('Error fetching drawings:', err);
      }
    };

    fetchDrawings();
  }, [boardId, clearTrigger]);

  // Retina/High-DPI 디스플레이에 맞게 캔버스 해상도 조정
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

  // 원격 드로잉 이벤트를 위한 웹소켓 메시지 수신
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

  // 캔버스 기준 상대 좌표를 가져오는 유틸리티
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

  // 로컬 마우스 / 터치 이벤트 핸들러
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (tool === 'select') {
      // 화면 이동(팬) 드래그 시작
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
      // 화면 이동(팬) 드래그 계속
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
