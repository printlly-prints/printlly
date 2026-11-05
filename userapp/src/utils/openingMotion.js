/** Exact Figma tracks. Shared by the web preview and the native adapter. */
export function bezier(p,x1,y1,x2,y2){
  'worklet';
  let lo=0,hi=1,u=p;
  for(let i=0;i<18;i++){u=(lo+hi)/2;const x=3*(1-u)*(1-u)*u*x1+3*(1-u)*u*u*x2+u*u*u;if(x<p)lo=u;else hi=u;}
  return 3*(1-u)*(1-u)*u*y1+3*(1-u)*u*u*y2+u*u*u;
}
export function easing(p,name,curve){
  'worklet';
  if(name==='HOLD')return p<1?0:1;
  if(name==='EASE_IN')return bezier(p,.42,0,1,1);
  if(name==='EASE_OUT')return bezier(p,0,0,.58,1);
  if(name==='EASE_IN_AND_OUT')return bezier(p,.42,0,.58,1);
  if(name==='CUSTOM_CUBIC_BEZIER'&&curve)return bezier(p,curve.x1,curve.y1,curve.x2,curve.y2);
  return p;
}
export function sample(track,t,fallback=0){
  'worklet';
  if(!track?.length)return fallback;
  if(t<=track[0][0])return track[0][1];
  for(let i=1;i<track.length;i++){
    const a=track[i-1],b=track[i];if(t>b[0])continue;
    const p=easing((t-a[0])/(b[0]-a[0]||1),b[2],b[3]);
    if(typeof a[1]==='number')return a[1]+(b[1]-a[1])*p;
    return {x:a[1].x+(b[1].x-a[1].x)*p,y:a[1].y+(b[1].y-a[1].y)*p};
  }
  return track[track.length-1][1];
}
export function pose(n,t,landingDelta={x:0,y:0}){
  'worklet';
  const q=n.tr,xy=sample(q.SCALE_XY,t,{x:1,y:1});
  let x=sample(q.TRANSLATION_X,t),y=sample(q.TRANSLATION_Y,t);
  // Dynamic CTA adjustment is an explicit responsive adaptation, never changes source tracks.
  const destinationLayer=/Flight \/ quicker|wing unfold at action|unfolds and docks|one landing cue/.test(n.name);
  if(destinationLayer){const p=Math.max(0,Math.min(1,(t-2.1)/1.6));x+=landingDelta.x*p*p*p;y+=landingDelta.y*p*p*p;}
  return {x,y,sx:sample(q.SCALE_X,t,xy.x),sy:sample(q.SCALE_Y,t,xy.y),
    rotate:-sample(q.ROTATION,t),opacity:n.visible?sample(q.OPACITY,t,n.opacity):0,
    trim:sample(q.PATH_TRIM_END,t,1)};
}
export function matrix(n,p){
  'worklet';
  const [[a,c,e],[b,d,f]]=n.m,cx=n.w/2,cy=n.h/2;
  const r=p.rotate*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
  const aa=co*p.sx,bb=si*p.sx,cc=-si*p.sy,dd=co*p.sy;
  return [a*aa+c*bb,b*aa+d*bb,a*cc+c*dd,b*cc+d*dd,
    e+p.x+a*cx+c*cy-(a*aa+c*bb)*cx-(a*cc+c*dd)*cy,
    f+p.y+b*cx+d*cy-(b*aa+d*bb)*cx-(b*cc+d*dd)*cy];
}
export function rgba(p){const c=p.c;return `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${p.o})`;}
