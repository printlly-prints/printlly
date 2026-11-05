export const OPENING_FLIGHT_START_SECONDS = 2.1;
export const OPENING_REVEAL_SECONDS = OPENING_FLIGHT_START_SECONDS - .05;

// Preserve cloud geometry and destinations, but hold the dense sky during all
// folds. Compress only cloud timing so retreat starts with the moving plane.
export function nativeOpeningStage(scene, { cloudsOnly = false } = {}) {
  const clouds = scene.stage.children.filter(node => node.name.startsWith('Sky / full-cover cloud'));
  const originalStart = Math.min(...clouds.map(node => node.tr.TRANSLATION_X[1][0]));
  const originalEnd = Math.max(...clouds.flatMap(node => Object.values(node.tr).flatMap(track => track.map(frame => frame[0]))));
  const clearAt = scene.duration > 4 ? 3.35 : 3.05;
  const scale = (clearAt - OPENING_FLIGHT_START_SECONDS) / (originalEnd - originalStart);
  const retime = time => time === 0 ? 0 : OPENING_FLIGHT_START_SECONDS + (time - originalStart) * scale;
  const children = scene.stage.children.filter(node => cloudsOnly ? node.name.startsWith('Sky / full-cover cloud') : !node.name.startsWith('Flight / short fading paper trail') && node.name !== 'Sky / clears behind paper').map(node => {
    if (!node.name.startsWith('Sky / full-cover cloud')) return node;
    return { ...node, tr: Object.fromEntries(Object.entries(node.tr).map(([key, track]) => [key, track.map(frame => [retime(frame[0]), ...frame.slice(1)])])) };
  });
  return { ...scene.stage, m: [[1,0,0],[0,1,0]], children };
}
