import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pose, matrix, sample } from '../src/utils/openingMotion.js';
import { compactOpeningTrack, openingFrames } from '../src/utils/openingFrames.js';
import { nativeOpeningStage, OPENING_FLIGHT_START_SECONDS, OPENING_REVEAL_SECONDS } from '../src/utils/nativeOpeningStage.js';
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/opening/bundle.json', import.meta.url)));
const all = node => [node, ...node.children.flatMap(all)];

test('recovery opening keeps all dense clouds and omits every paper and flight layer', () => {
 for (const scene of Object.values(bundle.scenes)) {
  const recovery = nativeOpeningStage(scene, { cloudsOnly: true });
  assert.equal(recovery.children.length, 36);
  assert.ok(recovery.children.every(node => node.name.startsWith('Sky / full-cover cloud')));
  const normalClouds = nativeOpeningStage(scene).children.filter(node => node.name.startsWith('Sky / full-cover cloud'));
  assert.deepEqual(recovery.children, normalClouds);
 }
});
test('native crease reveal is exactly equivalent to trimming the sole straight source line', () => {
 for(const scene of Object.values(bundle.scenes)) {
  const creases=all(nativeOpeningStage(scene)).filter(node=>node.tr.PATH_TRIM_END);
  assert.equal(creases.length,1);
  const crease=creases[0];
  assert.equal(crease.w,0);assert.equal(crease.h,132);
  assert.equal(crease.paint.paths[0].data,'M 0 0 L 0 132');
  for(let time=0;time<scene.duration;time+=.017) {
   const trim=pose(crease,time).trim;
   const dashedVisibleLength=132-132*(1-trim);
   const scaledVisibleLength=crease.h*trim;
   assert.ok(Math.abs(dashedVisibleLength-scaledVisibleLength)<1e-9);
  }
 }
});
test('native scene retains dense source clouds and paper motion while removing decorative trail hosts', () => {
 for(const scene of Object.values(bundle.scenes)) {
  const lean=nativeOpeningStage(scene), nodes=all(lean), originals=all(scene.stage);
  assert.ok(nodes.length<=52);
  assert.equal(nodes.filter(node=>node.name.startsWith('Sky / full-cover cloud')).length,36);
  assert.ok(!nodes.some(node=>node.name.startsWith('Trail / dash')));
  for(const node of originals.filter(node=>/Fold [1-6] \/|Flight \/ quicker|File \/ unfolds|Flight \/ faster/.test(node.name))) assert.deepEqual(nodes.find(candidate=>candidate.id===node.id),node);
  assert.ok(!nodes.some(node=>node.name==='Sky / clears behind paper'));
  const clouds=nodes.filter(node=>node.name.startsWith('Sky / full-cover cloud'));
  const firstMovement=Math.min(...clouds.map(node=>node.tr.TRANSLATION_X[1][0]));
  assert.equal(firstMovement,OPENING_FLIGHT_START_SECONDS);
  assert.ok(OPENING_REVEAL_SECONDS<firstMovement);
  assert.ok(firstMovement-OPENING_REVEAL_SECONDS<=.051);
  for(const cloud of clouds) {
   const original=originals.find(node=>node.id===cloud.id);
   assert.deepEqual({...cloud,tr:original.tr},original,'cloud geometry and artwork remain unchanged');
   for(let time=0;time<=2.1;time+=.05) {
    const p=pose(cloud,time);
    assert.ok(Math.abs(p.x)<1e-8 && Math.abs(p.y)<1e-8 && Math.abs(p.opacity-1)<1e-8,'cloud holds through folding');
   }
   for(const key of Object.keys(original.tr)) assert.deepEqual(cloud.tr[key].map(frame=>frame.slice(1)),original.tr[key].map(frame=>frame.slice(1)),'cloud values and easing remain unchanged');
   assert.equal(pose(cloud,scene.duration>4?3.36:3.06).opacity,0);
  }
 }
});
test('native compact tracks preserve every interpolated source pose while reducing flat runs', () => {
 const interpolate=(times,values,t)=>{let i=1;while(i<times.length-1&&t>times[i])i++;const p=(t-times[i-1])/(times[i]-times[i-1]);return values[i-1]+(values[i]-values[i-1])*p;};
 let originalCount=0,compactCount=0;
 for(const scene of Object.values(bundle.scenes)) for(const node of all(scene.stage)) {
  const frames=openingFrames(node,scene.duration);
  for(const key of ['x','y','rotate','sx','sy','opacity','trim']) {
   const compact=compactOpeningTrack(frames,key), values=frames.values.map(value=>value[key]);
   originalCount+=values.length;compactCount+=compact.outputRange.length;
   for(let t=0;t<=scene.duration;t+=.017) assert.ok(Math.abs(interpolate(frames.inputRange,values,t)-interpolate(compact.inputRange,compact.outputRange,t))<1e-8,`${node.name} ${key} ${t}`);
  }
 }
 assert.ok(compactCount<originalCount*.4,'flat sample compaction should materially reduce native graph payload');
});
test('pack one-shot scenes retain cloud hold, folds, exact source flight and dock destinations', () => {
 const nodes = all(bundle.scenes.light.stage);
 assert.equal(bundle.scenes.light.duration,4.6); assert.equal(bundle.scenes['signed-out-light'].duration,3.2);
 assert.equal(Object.keys(bundle.assets).length,11);
 assert.equal(nodes.filter(n=>n.name.startsWith('Sky / full-cover cloud')).length,36);
 const cloud=nodes.find(n=>n.name==='Sky / full-cover cloud 1'); assert.equal(pose(cloud,.84).x,0); assert.equal(pose(cloud,3.1).opacity,0);
 for(const [name,time,x,y] of [['Flight / quicker curve to Add files',3.7,64,308],['File / unfolds and docks',4.6,64,340]]) {
 const n=nodes.find(n=>n.name===name),m=matrix(n,pose(n,time));
 assert.ok(Math.abs(m[4]+m[0]*n.w/2+m[2]*n.h/2-x)<.001);assert.ok(Math.abs(m[5]+m[1]*n.w/2+m[3]*n.h/2-y)<.001);
 }
 assert.equal(sample([[0,0,'LINEAR'],[1,1,'HOLD']],.9),0);
});
test('native transform decomposition preserves authored matrix geometry and responsive dock offsets', () => {
 for(const scene of Object.values(bundle.scenes)) for(const n of all(scene.stage)) {
 const frames=openingFrames(n,scene.duration);
 assert.equal(frames.inputRange[0],0); assert.equal(frames.inputRange.at(-1),scene.duration);
 frames.values.forEach((p,i)=>{const m=matrix(n,pose(n,frames.inputRange[i])),r=p.rotate*Math.PI/180;
 assert.ok(Object.values(p).every(Number.isFinite));
 assert.ok(Math.abs(Math.cos(r)*p.sx-m[0])<.001);
 assert.ok(Math.abs(Math.sin(r)*p.sx-m[1])<.001);
 assert.ok(Math.abs(-Math.sin(r)*p.sy-m[2])<.001);
 assert.ok(Math.abs(Math.cos(r)*p.sy-m[3])<.001);
 });
 }
 const file=all(bundle.scenes.light.stage).find(n=>n.name==='File / unfolds and docks');
 const source=matrix(file,pose(file,4.6)),adjusted=matrix(file,pose(file,4.6,{x:12,y:73}));
 assert.ok(Math.abs(adjusted[4]-source[4]-12)<.001); assert.ok(Math.abs(adjusted[5]-source[5]-73)<.001);
});
