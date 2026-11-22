import type { FormWarning } from './engine';

type Point = { x: number; y: number };

export type OverlayOptions = {
  angle?: number | null;
  targetAngle?: number;
  direction?: 'flex' | 'extend';
  warning?: FormWarning | null;
  torsoJoints?: readonly Point[];
};

export function drawPoseOverlay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  joints: readonly Point[],
  options: OverlayOptions = {},
) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (joints.length !== 3) return;

  const [start, vertex, end] = joints;
  const radius = Math.max(4, Math.min(width, height) * 0.012);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Subtle vertical torso reference + measured torso segment when visible.
  if (options.torsoJoints && options.torsoJoints.length === 2) {
    const [shoulder, hip] = options.torsoJoints;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(219, 255, 238, 0.45)';
    ctx.lineWidth = Math.max(1.5, radius * 0.35);
    ctx.beginPath();
    ctx.moveTo(hip.x * width, hip.y * height);
    ctx.lineTo(hip.x * width, shoulder.y * height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = options.warning === 'trunk_lean' ? '#ff7a70' : 'rgba(131, 244, 194, 0.75)';
    ctx.lineWidth = radius * 0.55;
    ctx.beginPath();
    ctx.moveTo(shoulder.x * width, shoulder.y * height);
    ctx.lineTo(hip.x * width, hip.y * height);
    ctx.stroke();
    ctx.restore();
  }

  const reachedTarget = options.angle != null && options.targetAngle != null
    ? (options.direction === 'extend' ? options.angle >= options.targetAngle : options.angle <= options.targetAngle)
    : false;
  const lineColor = options.warning
    ? '#ff7a70'
    : reachedTarget
      ? '#4cf2a3'
      : '#83f4c2';

  ctx.strokeStyle = '#08231e';
  ctx.lineWidth = radius * 1.4;
  ctx.beginPath();
  ctx.moveTo(start.x * width, start.y * height);
  ctx.lineTo(vertex.x * width, vertex.y * height);
  ctx.lineTo(end.x * width, end.y * height);
  ctx.stroke();

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = radius * 0.7;
  ctx.stroke();

  ctx.fillStyle = options.warning ? '#ffd6d1' : '#dbffee';
  for (const joint of joints) {
    ctx.beginPath();
    ctx.arc(joint.x * width, joint.y * height, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (options.angle != null) {
    const label = `${Math.round(options.angle)}°`;
    const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.045));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const padX = 6;
    const padY = 4;
    const boxX = Math.min(width - textWidth - padX * 2 - 4, Math.max(4, vertex.x * width + radius * 1.6));
    const boxY = Math.max(4, Math.min(height - fontSize - padY * 2 - 4, vertex.y * height - fontSize / 2 - padY));
    ctx.fillStyle = 'rgba(8, 35, 30, 0.82)';
    ctx.fillRect(boxX, boxY, textWidth + padX * 2, fontSize + padY * 2);
    ctx.fillStyle = lineColor;
    ctx.fillText(label, boxX + padX, boxY + fontSize + padY - 2);
  }
}
