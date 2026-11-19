import { useEffect, useRef } from 'react';
import { canPlace } from '../game/engine.ts';
import { PIECE_BY_ID, pieceBounds } from '../game/pieces.ts';
import type { Board, Coord, PieceInstance, ThemeId } from '../game/types.ts';
import { BOARD_SIZE } from '../game/types.ts';
import { themeById } from '../themeData.ts';

interface CanvasEffect {
  id: number;
  cleared: readonly Coord[];
  placed: readonly Coord[];
  label?: string;
}

interface GameCanvasProps {
  board: Board;
  tray: readonly (PieceInstance | null)[];
  theme: ThemeId;
  disabled?: boolean;
  effect?: CanvasEffect | null;
  hint?: { slot: number; row: number; col: number } | null;
  targets?: readonly Coord[];
  ariaLabel: string;
  canDrop?: (slot: number, row: number, col: number) => boolean;
  onDragStart?: (slot: number) => void;
  onPlace: (slot: number, row: number, col: number) => void;
  onInvalid?: () => void;
}

interface Geometry {
  width: number;
  height: number;
  boardX: number;
  boardY: number;
  boardSize: number;
  cell: number;
  trayY: number;
  slots: { x: number; y: number; width: number; height: number }[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
};

const geometryFor = (width: number, height: number): Geometry => {
  if (width > height * 1.35) {
    const boardSize = Math.min(height - 16, width - 150);
    const trayWidth = Math.min(138, width - boardSize - 28);
    const contentWidth = boardSize + trayWidth + 12;
    const boardX = (width - contentWidth) / 2;
    const boardY = (height - boardSize) / 2;
    const trayX = boardX + boardSize + 12;
    return {
      width, height, boardX, boardY, boardSize, cell: boardSize / BOARD_SIZE, trayY: boardY,
      slots: Array.from({ length: 3 }, (_, index) => ({
        x: trayX,
        y: boardY + index * boardSize / 3 + 2,
        width: trayWidth,
        height: boardSize / 3 - 4,
      })),
    };
  }
  const boardSize = Math.min(width - 22, height - 132);
  const boardX = (width - boardSize) / 2;
  const boardY = 8;
  const trayY = boardY + boardSize + 14;
  return {
    width, height, boardX, boardY, boardSize, cell: boardSize / BOARD_SIZE, trayY,
    slots: Array.from({ length: 3 }, (_, index) => ({
      x: width * (index / 3) + 5,
      y: trayY,
      width: width / 3 - 10,
      height: height - trayY - 5,
    })),
  };
};

const drawBlock = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha = 1,
  scale = 1,
) => {
  const inset = size * (1 - scale) / 2 + 2;
  const blockSize = size * scale - 4;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.18;
  roundedRect(ctx, x + inset, y + inset, blockSize, blockSize, size * 0.16);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  roundedRect(ctx, x + inset + 2, y + inset + 2, blockSize - 4, Math.max(3, blockSize * 0.22), size * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 1;
  roundedRect(ctx, x + inset + .5, y + inset + .5, blockSize - 1, blockSize - 1, size * 0.16);
  ctx.stroke();
  ctx.restore();
};

const modifierTiles = new Image();
modifierTiles.src = `${import.meta.env.BASE_URL}mechanic-tiles.png`;
const modifierTilePosition = { stone: [0, 0], ice: [1, 0], crystal: [0, 1], seal: [1, 1] } as const;

const drawModifier = (ctx: CanvasRenderingContext2D, modifier: Board[number][number]['modifier'], x: number, y: number, size: number, time: number) => {
  if (!modifier) return;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  ctx.save();
  if (modifierTiles.complete && modifierTiles.naturalWidth) {
    const [tileCol, tileRow] = modifierTilePosition[modifier.type];
    const sourceWidth = modifierTiles.naturalWidth / 2;
    const sourceHeight = modifierTiles.naturalHeight / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = modifier.type === 'crystal' ? .9 + Math.sin(time / 300 + x) * .1 : 1;
    ctx.drawImage(
      modifierTiles,
      tileCol * sourceWidth,
      tileRow * sourceHeight,
      sourceWidth,
      sourceHeight,
      x + 1,
      y + 1,
      size - 2,
      size - 2,
    );
    ctx.globalAlpha = 1;
    if ((modifier.type === 'stone' || modifier.type === 'ice') && modifier.hp > 1) {
      ctx.fillStyle = 'rgba(4,6,20,.88)';
      ctx.fillRect(x + size * .68, y + size * .68, size * .24, size * .24);
      ctx.fillStyle = '#fff7dd';
      ctx.font = `700 ${Math.max(9, size * .24)}px Georgia`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(modifier.hp), x + size * .8, y + size * .8);
    } else if (modifier.type === 'seal') {
      ctx.fillStyle = 'rgba(4,6,20,.88)';
      ctx.fillRect(x + size * .62, y + size * .7, size * .3, size * .22);
      ctx.fillStyle = '#fff0c3';
      ctx.font = `700 ${Math.max(8, size * .2)}px Georgia`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${modifier.progress}/${modifier.required}`, x + size * .77, y + size * .81);
    }
    ctx.restore();
    return;
  }
  if (modifier.type === 'stone') {
    ctx.shadowColor = '#050611';
    ctx.shadowBlur = 5;
    roundedRect(ctx, x + 3, y + 3, size - 6, size - 6, size * .18);
    ctx.fillStyle = modifier.hp > 1 ? '#596078' : '#747b91';
    ctx.fill();
    ctx.strokeStyle = '#a1a7b7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + size * .28, y + size * .2);
    ctx.lineTo(x + size * .46, y + size * .47);
    ctx.lineTo(x + size * .37, y + size * .76);
    if (modifier.hp === 1) {
      ctx.moveTo(x + size * .46, y + size * .47);
      ctx.lineTo(x + size * .73, y + size * .31);
      ctx.moveTo(x + size * .46, y + size * .47);
      ctx.lineTo(x + size * .71, y + size * .72);
    }
    ctx.stroke();
  } else if (modifier.type === 'ice') {
    ctx.fillStyle = 'rgba(122,225,255,.3)';
    ctx.strokeStyle = '#b9f4ff';
    ctx.lineWidth = modifier.hp > 1 ? 3 : 1.5;
    roundedRect(ctx, x + 2, y + 2, size - 4, size - 4, size * .12);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * .18, y + size * .62);
    ctx.lineTo(x + size * .43, y + size * .38);
    ctx.lineTo(x + size * .68, y + size * .62);
    ctx.stroke();
  } else if (modifier.type === 'crystal') {
    const pulse = 1 + Math.sin(time / 300 + x) * .08;
    ctx.translate(centerX, centerY);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = '#6cf5ff';
    ctx.shadowBlur = size * .35;
    ctx.fillStyle = '#80efff';
    ctx.beginPath();
    ctx.moveTo(0, -size * .31);
    ctx.lineTo(size * .22, -size * .05);
    ctx.lineTo(size * .12, size * .3);
    ctx.lineTo(-size * .13, size * .3);
    ctx.lineTo(-size * .22, -size * .05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.moveTo(-size * .1, -size * .12);
    ctx.lineTo(0, -size * .24);
    ctx.lineTo(size * .04, size * .17);
    ctx.closePath();
    ctx.fill();
  } else {
    const ratio = modifier.progress / modifier.required;
    ctx.shadowColor = '#d68cff';
    ctx.shadowBlur = 5 + ratio * 12;
    ctx.strokeStyle = ratio ? '#e5a8ff' : '#725893';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * .29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(.08, ratio));
    ctx.stroke();
    ctx.font = `700 ${Math.max(9, size * .25)}px Georgia`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f1c9ff';
    ctx.fillText(`${modifier.progress}/${modifier.required}`, centerX, centerY + 1);
  }
  ctx.restore();
};

const previewCells = (piece: PieceInstance | null, row: number, col: number): Coord[] => {
  const definition = piece ? PIECE_BY_ID.get(piece.shapeId) : null;
  return definition ? definition.cells.map((offset) => ({ row: row + offset.row, col: col + offset.col })) : [];
};

const dragLift = (pointerType: string, cell: number): number =>
  pointerType === 'touch' ? Math.min(90, cell * 1.8) : 0;

export function GameCanvas(props: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const geometryRef = useRef<Geometry | null>(null);
  const dragRef = useRef<{ slot: number; x: number; y: number; pointerType: string } | null>(null);
  const keyboardRef = useRef<{ slot: number; row: number; col: number } | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const flashRef = useRef<{ cells: readonly Coord[]; start: number; label?: string } | null>(null);
  const lastEffectRef = useRef(-1);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let previous = performance.now();

    const render = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const lastSize = lastSizeRef.current;
      if (lastSize && (lastSize.width !== rect.width || lastSize.height !== rect.height)) {
        dragRef.current = null;
        keyboardRef.current = null;
      }
      lastSizeRef.current = { width: rect.width, height: rect.height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const geometry = geometryFor(rect.width, rect.height);
      geometryRef.current = geometry;
      const current = propsRef.current;
      const theme = themeById(current.theme);
      const delta = Math.min(32, time - previous) / 16.67;
      previous = time;

      if (current.effect && current.effect.id !== lastEffectRef.current) {
        lastEffectRef.current = current.effect.id;
        flashRef.current = { cells: current.effect.cleared.length ? current.effect.cleared : current.effect.placed, start: time, label: current.effect.label };
        const sources = current.effect.cleared.length ? current.effect.cleared : current.effect.placed;
        sources.forEach((cell, cellIndex) => {
          for (let index = 0; index < (current.effect?.cleared.length ? 3 : 1); index += 1) {
            const angle = ((cellIndex * 3 + index) * 2.399) % (Math.PI * 2);
            particlesRef.current.push({
              x: cell.col + .5, y: cell.row + .5,
              vx: Math.cos(angle) * (.025 + index * .01), vy: Math.sin(angle) * .025 - .035,
              life: 34 + index * 8, maxLife: 50, color: index % 2 ? theme.glow : theme.accent,
            });
          }
        });
      }

      ctx.clearRect(0, 0, geometry.width, geometry.height);
      ctx.save();
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 18;
      roundedRect(ctx, geometry.boardX - 5, geometry.boardY - 5, geometry.boardSize + 10, geometry.boardSize + 10, 18);
      ctx.fillStyle = '#080b21';
      ctx.fill();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();

      const pulse = .45 + Math.sin(time / 260) * .18;
      const targetKeys = new Set((current.targets ?? []).map(({ row, col }) => `${row}:${col}`));
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          const x = geometry.boardX + col * geometry.cell;
          const y = geometry.boardY + row * geometry.cell;
          roundedRect(ctx, x + 1.4, y + 1.4, geometry.cell - 2.8, geometry.cell - 2.8, geometry.cell * .12);
          ctx.fillStyle = targetKeys.has(`${row}:${col}`) ? `rgba(246,201,92,${pulse})` : theme.board;
          ctx.fill();
          ctx.strokeStyle = targetKeys.has(`${row}:${col}`) ? theme.accent : 'rgba(157,180,235,.11)';
          ctx.lineWidth = targetKeys.has(`${row}:${col}`) ? 1.8 : 1;
          ctx.stroke();
          const cell = current.board[row][col];
          if (cell.fill) drawBlock(ctx, x, y, geometry.cell, theme.blocks[cell.fill]);
          drawModifier(ctx, cell.modifier, x, y, geometry.cell, time);
        }
      }

      const drag = dragRef.current;
      const keyboard = keyboardRef.current;
      let activePreview: { slot: number; row: number; col: number; valid: boolean } | null = null;
      if (drag) {
        const piece = current.tray[drag.slot];
        const definition = piece ? PIECE_BY_ID.get(piece.shapeId) : null;
        if (piece && definition) {
          const bounds = pieceBounds(definition);
          const lift = dragLift(drag.pointerType, geometry.cell);
          const ghostX = drag.x;
          const ghostY = drag.y - lift;
          const col = Math.round((ghostX - bounds.cols * geometry.cell / 2 - geometry.boardX) / geometry.cell);
          const row = Math.round((ghostY - bounds.rows * geometry.cell / 2 - geometry.boardY) / geometry.cell);
          activePreview = { slot: drag.slot, row, col, valid: canPlace(current.board, piece, row, col) && (current.canDrop?.(drag.slot, row, col) ?? true) };
        }
      } else if (keyboard) {
        const piece = current.tray[keyboard.slot];
        if (piece) activePreview = {
          ...keyboard,
          valid: canPlace(current.board, piece, keyboard.row, keyboard.col) && (current.canDrop?.(keyboard.slot, keyboard.row, keyboard.col) ?? true),
        };
      } else if (current.hint) {
        activePreview = { ...current.hint, valid: true };
      }

      if (activePreview) {
        const piece = current.tray[activePreview.slot];
        previewCells(piece, activePreview.row, activePreview.col).forEach((cell) => {
          if (cell.row < 0 || cell.col < 0 || cell.row >= BOARD_SIZE || cell.col >= BOARD_SIZE) return;
          const x = geometry.boardX + cell.col * geometry.cell;
          const y = geometry.boardY + cell.row * geometry.cell;
          drawBlock(ctx, x, y, geometry.cell, activePreview?.valid ? theme.accent : '#c14c67', .65, .92);
        });
      }

      geometry.slots.forEach((slotBounds, slot) => {
        const piece = current.tray[slot];
        const selected = drag?.slot === slot || keyboard?.slot === slot;
        ctx.save();
        roundedRect(ctx, slotBounds.x, slotBounds.y, slotBounds.width, slotBounds.height, 14);
        ctx.fillStyle = selected ? 'rgba(246,201,92,.13)' : 'rgba(10,13,37,.48)';
        ctx.fill();
        ctx.strokeStyle = selected ? theme.accent : 'rgba(246,201,92,.18)';
        ctx.lineWidth = selected ? 1.6 : 1;
        ctx.stroke();
        if (piece && drag?.slot !== slot) {
          const definition = PIECE_BY_ID.get(piece.shapeId)!;
          const bounds = pieceBounds(definition);
          const pieceCell = Math.min(28, (slotBounds.width - 16) / bounds.cols, (slotBounds.height - 12) / bounds.rows);
          const startX = slotBounds.x + (slotBounds.width - bounds.cols * pieceCell) / 2;
          const startY = slotBounds.y + (slotBounds.height - bounds.rows * pieceCell) / 2;
          definition.cells.forEach((cell) => drawBlock(ctx, startX + cell.col * pieceCell, startY + cell.row * pieceCell, pieceCell, theme.blocks[piece.color], 1, selected ? 1.08 : 1));
        }
        ctx.restore();
      });

      if (drag) {
        const piece = current.tray[drag.slot];
        const definition = piece ? PIECE_BY_ID.get(piece.shapeId) : null;
        if (piece && definition) {
          const bounds = pieceBounds(definition);
          const lift = dragLift(drag.pointerType, geometry.cell);
          const startX = drag.x - bounds.cols * geometry.cell / 2;
          const startY = drag.y - lift - bounds.rows * geometry.cell / 2;
          definition.cells.forEach((cell) => drawBlock(ctx, startX + cell.col * geometry.cell, startY + cell.row * geometry.cell, geometry.cell, theme.blocks[piece.color], .96, 1.07));
        }
      }

      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += .0018 * delta;
        particle.life -= delta;
        if (particle.life <= 0) return false;
        const x = geometry.boardX + particle.x * geometry.cell;
        const y = geometry.boardY + particle.y * geometry.cell;
        ctx.globalAlpha = Math.min(1, particle.life / 14);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, geometry.cell * .055), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      const flash = flashRef.current;
      if (flash && time - flash.start < 900) {
        const age = time - flash.start;
        if (age < 260) {
          ctx.globalAlpha = 1 - age / 260;
          ctx.fillStyle = theme.accent;
          flash.cells.forEach((cell) => ctx.fillRect(
            geometry.boardX + cell.col * geometry.cell + 2,
            geometry.boardY + cell.row * geometry.cell + 2,
            geometry.cell - 4,
            geometry.cell - 4,
          ));
          ctx.globalAlpha = 1;
        }
        if (flash.label) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.font = `700 ${Math.max(22, geometry.cell * .58)}px Georgia`;
          ctx.fillStyle = theme.accent;
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 8;
          ctx.globalAlpha = Math.min(1, (900 - age) / 220);
          ctx.fillText(flash.label, geometry.width / 2, geometry.boardY + geometry.boardSize * .48 - age * .025);
          ctx.restore();
        }
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  const pointFromClient = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrag = (point: { x: number; y: number }, pointerType: string) => {
    if (propsRef.current.disabled) return;
    const geometry = geometryRef.current;
    if (!geometry) return;
    const slot = geometry.slots.findIndex((bounds, index) => propsRef.current.tray[index]
      && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height);
    if (slot < 0) return;
    dragRef.current = { slot, ...point, pointerType };
    keyboardRef.current = null;
    propsRef.current.onDragStart?.(slot);
  };

  const moveDrag = (point: { x: number; y: number }) => {
    if (!dragRef.current) return;
    Object.assign(dragRef.current, point);
  };

  const finishDrag = (point: { x: number; y: number }) => {
    const drag = dragRef.current;
    const geometry = geometryRef.current;
    if (!drag || !geometry) return;
    Object.assign(drag, point);
    const piece = propsRef.current.tray[drag.slot];
    const definition = piece ? PIECE_BY_ID.get(piece.shapeId) : null;
    if (piece && definition) {
      const bounds = pieceBounds(definition);
      const lift = dragLift(drag.pointerType, geometry.cell);
      const col = Math.round((drag.x - bounds.cols * geometry.cell / 2 - geometry.boardX) / geometry.cell);
      const row = Math.round((drag.y - lift - bounds.rows * geometry.cell / 2 - geometry.boardY) / geometry.cell);
      const valid = canPlace(propsRef.current.board, piece, row, col) && (propsRef.current.canDrop?.(drag.slot, row, col) ?? true);
      if (valid) propsRef.current.onPlace(drag.slot, row, col);
      else propsRef.current.onInvalid?.();
    }
    dragRef.current = null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    startDrag(pointFromClient(event.currentTarget, event.clientX, event.clientY), event.pointerType);
    if (dragRef.current) event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) =>
    moveDrag(pointFromClient(event.currentTarget, event.clientX, event.clientY));

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) =>
    finishDrag(pointFromClient(event.currentTarget, event.clientX, event.clientY));

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (propsRef.current.disabled || event.ctrlKey || event.altKey || event.metaKey) return;
    const number = Number(event.key);
    if (number >= 1 && number <= 3 && propsRef.current.tray[number - 1]) {
      keyboardRef.current = { slot: number - 1, row: 0, col: 0 };
      propsRef.current.onDragStart?.(number - 1);
      event.preventDefault();
      return;
    }
    const cursor = keyboardRef.current;
    if (!cursor) return;
    if (event.key === 'ArrowUp') cursor.row = Math.max(-4, cursor.row - 1);
    else if (event.key === 'ArrowDown') cursor.row = Math.min(8, cursor.row + 1);
    else if (event.key === 'ArrowLeft') cursor.col = Math.max(-4, cursor.col - 1);
    else if (event.key === 'ArrowRight') cursor.col = Math.min(8, cursor.col + 1);
    else if (event.key === 'Enter' || event.key === ' ') {
      const piece = propsRef.current.tray[cursor.slot];
      if (piece && canPlace(propsRef.current.board, piece, cursor.row, cursor.col)
        && (propsRef.current.canDrop?.(cursor.slot, cursor.row, cursor.col) ?? true)) {
        propsRef.current.onPlace(cursor.slot, cursor.row, cursor.col);
        keyboardRef.current = null;
      } else propsRef.current.onInvalid?.();
    } else return;
    event.preventDefault();
  };

  return <canvas
    ref={canvasRef}
    className="game-canvas"
    role="application"
    tabIndex={0}
    aria-label={props.ariaLabel}
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finishPointer}
    onPointerCancel={() => { dragRef.current = null; }}
    onMouseDown={(event) => {
      if ('PointerEvent' in window) return;
      startDrag(pointFromClient(event.currentTarget, event.clientX, event.clientY), 'mouse');
    }}
    onMouseMove={(event) => {
      if ('PointerEvent' in window) return;
      moveDrag(pointFromClient(event.currentTarget, event.clientX, event.clientY));
    }}
    onMouseUp={(event) => {
      if ('PointerEvent' in window) return;
      finishDrag(pointFromClient(event.currentTarget, event.clientX, event.clientY));
    }}
    onMouseLeave={() => { if (!('PointerEvent' in window)) dragRef.current = null; }}
    onTouchStart={(event) => {
      if ('PointerEvent' in window) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      event.preventDefault();
      startDrag(pointFromClient(event.currentTarget, touch.clientX, touch.clientY), 'touch');
    }}
    onTouchMove={(event) => {
      if ('PointerEvent' in window) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      event.preventDefault();
      moveDrag(pointFromClient(event.currentTarget, touch.clientX, touch.clientY));
    }}
    onTouchEnd={(event) => {
      if ('PointerEvent' in window) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      event.preventDefault();
      finishDrag(pointFromClient(event.currentTarget, touch.clientX, touch.clientY));
    }}
    onTouchCancel={() => { dragRef.current = null; }}
    onKeyDown={onKeyDown}
  />;
}
