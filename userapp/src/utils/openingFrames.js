import { matrix, pose } from './openingMotion.js';
// Eliminate flat interior samples without changing linear interpolation at any
// point in time. Keep boundary samples on both sides of every transition.
export function compactOpeningTrack(frames, key) {
  const values = frames.values.map(value => value[key]);
  const indices = values.map((_, index) => index).filter(index => index === 0 || index === values.length - 1 || values[index - 1] !== values[index] || values[index] !== values[index + 1]);
  return { inputRange: indices.map(index => frames.inputRange[index]), outputRange: indices.map(index => values[index]) };
}
// Sample the authored tracks once. Native Animated interpolates transforms on the UI thread.
export function openingFrames(node, duration, delta = { x: 0, y: 0 }) {
  const times = new Set([0, duration]);
  if (Object.keys(node.tr).length) {
    for (let i = 1; i < duration * 30; i++) times.add(i / 30);
  }
  Object.values(node.tr).forEach(track => track.forEach(frame => times.add(frame[0])));
  const inputRange = [...times].filter(t => t <= duration).sort((a, b) => a - b);
  const values = inputRange.map(t => {
    const p = pose(node, t, delta), m = matrix(node, p), cx = node.w / 2, cy = node.h / 2;
    const sx = Math.hypot(m[0], m[1]) || 1;
    return { x: m[4] + m[0] * cx + m[2] * cy - cx, y: m[5] + m[1] * cx + m[3] * cy - cy,
      sx, sy: (m[0] * m[3] - m[1] * m[2]) / sx, rotate: Math.atan2(m[1], m[0]) * 180 / Math.PI,
      opacity: p.opacity, trim: p.trim };
  });
  for (let i = 1; i < values.length; i++) {
    while (values[i].rotate - values[i - 1].rotate > 180) values[i].rotate -= 360;
    while (values[i].rotate - values[i - 1].rotate < -180) values[i].rotate += 360;
  }
  return { inputRange, values };
}

