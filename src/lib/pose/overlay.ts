type Point = { x: number; y: number };

export function drawPoseOverlay(canvas: HTMLCanvasElement, width: number, height: number, joints: readonly Point[]) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  if (joints.length !== 3) return;
  const [hip, knee, ankle] = joints;
  const radius = Math.max(4, Math.min(width, height) * 0.012);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#08231e';
  ctx.lineWidth = radius * 1.4;
  ctx.beginPath();
  ctx.moveTo(hip.x * width, hip.y * height);
  ctx.lineTo(knee.x * width, knee.y * height);
  ctx.lineTo(ankle.x * width, ankle.y * height);
  ctx.stroke();
  ctx.strokeStyle = '#83f4c2';
  ctx.lineWidth = radius * 0.7;
  ctx.stroke();
  ctx.fillStyle = '#dbffee';
  for (const joint of joints) {
    ctx.beginPath();
    ctx.arc(joint.x * width, joint.y * height, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
