import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import bundle from '../../assets/opening/bundle.json';
import { compactOpeningTrack, openingFrames } from '../utils/openingFrames';
import { rgba } from '../utils/openingMotion';
import { nativeOpeningStage, OPENING_REVEAL_SECONDS } from '../utils/nativeOpeningStage';
const OpeningContext = createContext({ measureTarget: () => {}, dismiss: () => {}, uploadAvailable: false, setUploadAvailable: () => {} });
const cloudSprites = {
  '265:479': require('../../assets/opening/cloud-265-479.png'),
  '265:482': require('../../assets/opening/cloud-265-482.png'),
  '265:485': require('../../assets/opening/cloud-265-485.png'),
};
// The source cloud SVGs contain multi-pass SVG blur/shadow filters. Forty-eight
// full-cover instances make those filters prohibitively expensive on low-end
// Android; retain the original vector paths and fills without shadow passes.
const nativeAssets = Object.fromEntries(Object.entries(bundle.assets).map(([key, asset]) => [key, {
  ...asset,
  xml: asset.xml.replace(/\sfilter="[^"]*"/g, '').replace(/<defs>[\s\S]*?<\/defs>/g, ''),
}]));
export const useOpening = () => useContext(OpeningContext);
export function OpeningProvider({ children }) {
  const [target, setTarget] = useState(null), [dismissed, setDismissed] = useState(false);
  const [uploadAvailable, setUploadAvailable] = useState(false);
  const measureTarget = useCallback(ref => ref?.measureInWindow((x, y, width, height) => setTarget({ x, y, width, height })), []);
  const dismiss = useCallback(() => setDismissed(true), []);
  return <OpeningContext.Provider value={{ target, dismissed, measureTarget, dismiss, uploadAvailable, setUploadAvailable }}>{children}</OpeningContext.Provider>;
}
function Artwork({ node, trim, inset = 0 }) {
  if (node.component) {
    const a = nativeAssets[node.component], sx = node.w / a.w, sy = node.h / a.h;
    if (cloudSprites[node.component]) return <Image source={cloudSprites[node.component]} resizeMode="stretch" fadeDuration={0} style={{ position: 'absolute', left: inset + a.dx * sx, top: inset + a.dy * sy, width: a.rw * sx, height: a.rh * sy }} />;
    return <SvgXml xml={a.xml} width={a.rw * sx} height={a.rh * sy} style={{ position: 'absolute', left: a.dx * sx, top: a.dy * sy, overflow: 'visible' }} />;
  }
  const p = node.paint;
  if (!p) return null;
  const fill = p.f.length ? rgba(p.f.at(-1)) : 'none', stroke = p.s.length ? rgba(p.s.at(-1)) : 'none';
  if (node.tr.PATH_TRIM_END) return <Animated.View style={{ position: 'absolute', left: -2, top: -2, width: 4, height: node.h + 4, transformOrigin: [2, 2, 0], transform: [{ scaleY: trim }] }}><Svg width={4} height={node.h + 4} viewBox={`-2 -2 4 ${node.h + 4}`}><Path d={p.paths[0].data} fill="none" stroke={stroke} strokeWidth={p.sw} /></Svg></Animated.View>;
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="${p.sw}"`;
  const content = node.type === 'VECTOR' ? p.paths.map(v => `<path d="${v.data}" ${attrs} fill-rule="${v.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero'}"/>`).join('') : node.type === 'ELLIPSE' ? `<ellipse cx="${node.w / 2}" cy="${node.h / 2}" rx="${node.w / 2}" ry="${node.h / 2}" ${attrs}/>` : `<rect width="${node.w}" height="${node.h}" rx="${p.rx}" ${attrs}/>`;
  const pad = Math.max(2, p.sw), w = Math.max(1, node.w), h = Math.max(1, node.h);
  return <SvgXml xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}">${content}</svg>`} width={w + 2 * pad} height={h + 2 * pad} style={{ position: 'absolute', left: -pad, top: -pad, overflow: 'visible' }} />;
}
const Layer = React.memo(function Layer({ node, clock, duration, delta }) {
  // Cloud source bounds include lobes outside the Figma component bounds.
  // Give the native host extra room instead of relying on SVG overflow, which
  // Android clips at the component edge and creates straight seams.
  const inset = cloudSprites[node.component] ? 32 : 0;
  const frames = useMemo(() => openingFrames(node, duration, delta), [node, duration, delta.x, delta.y]);
  const animatedStyle = useMemo(() => {
    const animated = key => {
    const values = frames.values.map(p => p[key]);
    if (values.every(value => value === values[0])) return key === 'rotate' ? `${values[0]}deg` : values[0];
    // Remove only exactly flat interior samples. Preserve every sampled ease
    // transition, but avoid sending long constant runs across the native graph.
    const compact = compactOpeningTrack(frames, key);
    return clock.interpolate({ inputRange: compact.inputRange, outputRange: key === 'rotate' ? compact.outputRange.map(value => `${value}deg`) : compact.outputRange, extrapolate: 'clamp' });
    };
    return { opacity: animated('opacity'), transform: [{ translateX: animated('x') }, { translateY: animated('y') }, { rotate: animated('rotate') }, { scaleX: animated('sx') }, { scaleY: animated('sy') }] };
  }, [frames, clock]);
  const trim = useMemo(() => node.tr.PATH_TRIM_END ? clock.interpolate({ ...compactOpeningTrack(frames, 'trim'), extrapolate: 'clamp' }) : null, [frames, clock, node]);
  const cacheVector = Boolean(node.component && !cloudSprites[node.component] && node.children.length === 0);
  return <Animated.View renderToHardwareTextureAndroid={cacheVector} style={[{ position: 'absolute', left: -inset, top: -inset, width: node.w + 2 * inset, height: node.h + 2 * inset, overflow: 'visible' }, animatedStyle]}><Artwork node={node} trim={trim} inset={inset} />{node.children.map(child => <Layer key={child.id} node={child} clock={clock} duration={duration} delta={delta} />)}</Animated.View>;
});
export default function OpeningArtwork({ width, height, mode, signedOut, showPaper = true, onComplete, onReveal, onStart }) {
  const { target } = useOpening();
  const clock = useRef(new Animated.Value(0)).current;
  const done = useRef(false), latest = useRef(onComplete); latest.current = onComplete;
  const latestStart = useRef(onStart); latestStart.current = onStart;
  const latestReveal = useRef(onReveal); latestReveal.current = onReveal;
  const scene = useMemo(() => bundle.scenes[(signedOut ? 'signed-out-' : '') + mode], []);
  const stage = useMemo(() => nativeOpeningStage(scene, { cloudsOnly: !showPaper }), [scene, showPaper]);
  const delta = { x: target && !signedOut ? (target.x + 24) / width * 390 - 64 : 0, y: target && !signedOut ? (target.y + target.height / 2) / height * 844 - 340 : 0 };
  useEffect(() => {
    let active = true;
    done.current = false;
    clock.setValue(0);
    const finish = () => { if (active && !done.current) { done.current = true; latest.current(); } };
    const animations = Animated.timing(clock, { toValue: scene.duration, duration: scene.duration * 1000, easing: Easing.linear, useNativeDriver: true });
    let timeout, revealTimeout, nextFrame;
    const firstFrame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        if (!active) return;
        latestStart.current?.();
        animations.start(({ finished }) => { if (finished) finish(); });
        revealTimeout = setTimeout(() => { if (active && !done.current) latestReveal.current?.(); }, OPENING_REVEAL_SECONDS * 1000);
        timeout = setTimeout(finish, scene.duration * 1000 + 1500);
      });
    });
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { animations.stop(); finish(); } });
    return () => { active = false; done.current = true; cancelAnimationFrame(firstFrame); if (nextFrame) cancelAnimationFrame(nextFrame); animations.stop(); clearTimeout(timeout); clearTimeout(revealTimeout); subscription.remove(); };
  }, []);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}><View style={{ position: 'absolute', width: 390, height: 844, left: (width - 390) / 2, top: (height - 844) / 2, transform: [{ scaleX: width / 390 }, { scaleY: height / 844 }] }}><Layer node={stage} clock={clock} duration={scene.duration} delta={delta} /></View></View>;
}
