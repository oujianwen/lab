export let W = 800, H = 600, S = 1, DPR = 1;
export let time = 0;
let uidCounter = 1;

export function uid(prefix) { return (prefix || 'e') + '_' + (uidCounter++); }

export function setViewport(w, h, s, dpr) { W = w; H = h; S = s; DPR = dpr; }
export function advanceTime(dt) { time += dt; }