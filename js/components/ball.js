(function () {
  function parseColor(hex) {
    let s = (hex || '#ffe27a').replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16);
    if (isNaN(n)) return { r: 255, g: 226, b: 122 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function hexA(hex, a) {
    const c = parseColor(hex);
    return `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, a))})`;
  }
  function mixHex(a, b, t) {
    const A = parseColor(a), B = parseColor(b);
    return '#' + ['r','g','b'].map(k =>
      Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
  }
  function mirrorSeg(m) {
    const h = (m.length || 0) / 2;
    const c = Math.cos(m.angle || 0);
    const s = Math.sin(m.angle || 0);
    return {
      a: { x: m.x - c * h, y: m.y - s * h },
      b: { x: m.x + c * h, y: m.y + s * h }
    };
  }
  function raySegmentIntersect(ox, oy, dx, dy, a, b) {
    const ex = b.x - a.x, ey = b.y - a.y;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 0.0001) return null;
    const tx = a.x - ox, ty = a.y - oy;
    const t = (tx * ey - ty * ex) / denom;
    const s = (tx * dy - ty * dx) / denom;
    if (t < 0.001 || s < 0 || s > 1) return null;
    return { x: ox + t * dx, y: oy + t * dy, dist: t };
  }
  /* 射线与圆求交 */
  function rayCircleIntersect(ox, oy, dx, dy, cx, cy, r) {
    const ox2 = ox - cx, oy2 = oy - cy;
    const b = ox2 * dx + oy2 * dy;
    const c = ox2 * ox2 + oy2 * oy2 - r * r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = -b - sq;
    const t2 = -b + sq;
    let t = null;
    if (t1 > 0.001) t = t1;
    else if (t2 > 0.001) t = t2;
    if (t == null) return null;
    return { x: ox + t * dx, y: oy + t * dy, dist: t };
  }

  /* ---------- 光线追踪：检测镜子 + 球 ---------- */
  function traceRays(el, mirrors, balls) {
    const rays = [];
    const beamLength = el.beamLength || 500;
    const spreads = (el.beamSpread || 0) > 0 ? 15 : 1;
    const halfSpread = ((el.beamSpread || 0) * Math.PI / 180) / 2;
    const baseAngle = el.angle || 0;

    for (let i = 0; i < spreads; i++) {
      const t = spreads === 1 ? 0 : (i / (spreads - 1) - 0.5);
      const a = baseAngle + t * halfSpread;
      const dx = Math.cos(a), dy = Math.sin(a);

      let best = null, bestDist = beamLength, bestType = null;

      // 检测镜子
      for (const m of mirrors) {
        const seg = mirrorSeg(m);
        const hit = raySegmentIntersect(el.x, el.y, dx, dy, seg.a, seg.b);
        if (hit && hit.dist < bestDist) {
          bestDist = hit.dist;
          best = { hit, mirror: m };
          bestType = 'mirror';
        }
      }
      // 检测球（球会挡住光）
      for (const b of balls) {
        const hit = rayCircleIntersect(el.x, el.y, dx, dy, b.x, b.y, b.r);
        if (hit && hit.dist < bestDist) {
          bestDist = hit.dist;
          best = { hit, ball: b };
          bestType = 'ball';
        }
      }

      if (bestType === 'mirror') {
        const nx = -Math.sin(best.mirror.angle || 0);
        const ny = Math.cos(best.mirror.angle || 0);
        const dot = dx * nx + dy * ny;
        const rdx = dx - 2 * dot * nx;
        const rdy = dy - 2 * dot * ny;
        const remain = Math.max(100, beamLength - bestDist);
        rays.push({
          origin: { x: el.x, y: el.y },
          hit: { x: best.hit.x, y: best.hit.y },
          hitMirror: best.mirror,
          hitBall: null,
          refEnd: { x: best.hit.x + rdx * remain, y: best.hit.y + rdy * remain }
        });
      } else if (bestType === 'ball') {
        // 打到球上：光被遮挡，不延伸
        rays.push({
          origin: { x: el.x, y: el.y },
          hit: { x: best.hit.x, y: best.hit.y },
          hitMirror: null,
          hitBall: best.ball,
          refEnd: null
        });
      } else {
        rays.push({
          origin: { x: el.x, y: el.y },
          hit: { x: el.x + dx * beamLength, y: el.y + dy * beamLength },
          hitMirror: null,
          hitBall: null,
          refEnd: null
        });
      }
    }
    return rays;
  }

  return {
    type: 'light_source',
    label: '光源',
    icon: '💡',
    category: 'optical',
    color: '#ffe27a',

    defaults() {
      return {
        x: 200, y: 200,
        angle: -Math.PI / 4,
        color: '#ffe27a',
        intensity: 1.0,
        beamSpread: 20,
        beamLength: 500,
        showBeam: true,
        showRays: true,
        _pulse: 0,
        _rays: []
      };
    },

    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    getRadius(el, env) { return 32 * (env && env.S ? env.S : 1); },

    getHandles(el, env) {
      const S = (env && env.S) ? env.S : 1;
      const r = 48 * S;
      return [{
        id: 'dir',
        x: el.x + Math.cos(el.angle) * r,
        y: el.y + Math.sin(el.angle) * r
      }];
    },
    onHandleDrag(el, handleId, p) {
      if (handleId !== 'dir') return;
      const dx = p.x - el.x;
      const dy = p.y - el.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.angle = Math.atan2(dy, dx);
    },

    properties: [
      { key: 'x', label: 'X', type: 'number' },
      { key: 'y', label: 'Y', type: 'number' },
      { key: 'angle', label: '方向°', type: 'number', step: 5, radians: true },
      { key: 'intensity', label: '强度', type: 'range', min: 10, max: 200, scale: 100 },
      { key: 'beamSpread', label: '发散°', type: 'number', step: 1, min: 0, max: 180 },
      { key: 'beamLength', label: '射程', type: 'number', min: 50, max: 2000 },
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'showBeam', label: '显示光束', type: 'checkbox' },
      { key: 'showRays', label: '显示反射', type: 'checkbox' }
    ],

    system: {
      update(scene, dt, env) {
        const mirrors = scene.elements.filter(e => e.type === 'mirror' && !e.__missing);
        const balls = scene.elements.filter(e => e.type === 'ball' && !e.__missing);
        for (const el of scene.elements) {
          if (el.type !== 'light_source') continue;
          el._pulse = (el._pulse || 0) + dt * 2;
          el._rays = traceRays(el, mirrors, balls);
        }
      }
    },

    render: {
      main(el, scene, env) {
        const c = env.ctx;
        const S = (env && env.S) ? env.S : 1;
        const intensity = el.intensity ?? 1;
        const pulse = 0.5 + 0.5 * Math.sin(el._pulse || 0);
        const rays = Array.isArray(el._rays) ? el._rays : [];

        // 1. 光束：到第一个交点（镜面 / 球 / 射程）
        if (el.showBeam && rays.length) {
          c.save();
          if (rays.length === 1) {
            const r = rays[0];
            const lineGrad = c.createLinearGradient(r.origin.x, r.origin.y, r.hit.x, r.hit.y);
            lineGrad.addColorStop(0, hexA(el.color, 0.75 * intensity));
            lineGrad.addColorStop(0.5, hexA(el.color, 0.32 * intensity));
            lineGrad.addColorStop(1, hexA(el.color, 0.05 * intensity));
            c.strokeStyle = lineGrad;
            c.lineWidth = 2.5 * S;
            c.lineCap = 'round';
            c.beginPath();
            c.moveTo(r.origin.x, r.origin.y);
            c.lineTo(r.hit.x, r.hit.y);
            c.stroke();
          } else {
            // 扇形光束：多边形，顶点在光源，边缘落在各条 hit 点
            // 因为部分 hit 打在球上（距离短），多边形自然在球的位置"凹进去"
            const maxR = Math.max(...rays.map(r =>
              Math.hypot(r.hit.x - el.x, r.hit.y - el.y)));
            const fanGrad = c.createRadialGradient(el.x, el.y, 0, el.x, el.y, Math.max(30, maxR));
            fanGrad.addColorStop(0, hexA(el.color, 0.42 * intensity));
            fanGrad.addColorStop(0.7, hexA(el.color, 0.15 * intensity));
            fanGrad.addColorStop(1, hexA(el.color, 0.02 * intensity));
            c.fillStyle = fanGrad;
            c.beginPath();
            c.moveTo(rays[0].origin.x, rays[0].origin.y);
            for (const r of rays) c.lineTo(r.hit.x, r.hit.y);
            c.closePath();
            c.fill();
          }
          c.restore();
        }

        // 2. 反射（球不反射，只有镜子反射）
        if (el.showRays && rays.length) {
          c.save();
          for (const r of rays) {
            if (!r.hitMirror || !r.refEnd) continue;
            if (!el.showBeam) {
              c.strokeStyle = hexA(el.color, 0.35 * intensity);
              c.lineWidth = 1.2 * S;
              c.setLineDash([4 * S, 4 * S]);
              c.beginPath();
              c.moveTo(r.origin.x, r.origin.y);
              c.lineTo(r.hit.x, r.hit.y);
              c.stroke();
              c.setLineDash([]);
            }
            c.strokeStyle = hexA(el.color, 0.55 * intensity);
            c.lineWidth = 1.6 * S;
            c.beginPath();
            c.moveTo(r.hit.x, r.hit.y);
            c.lineTo(r.refEnd.x, r.refEnd.y);
            c.stroke();
            c.beginPath();
            c.arc(r.hit.x, r.hit.y, 3.5 * S, 0, Math.PI * 2);
            c.fillStyle = hexA(el.color, 0.95);
            c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.7)';
            c.lineWidth = 1 * S;
            c.stroke();
          }
          c.restore();
        }

        // 3. 光晕
        const glowR = 34 * S * (1 + 0.12 * pulse) * Math.max(0.6, intensity);
        const glow = c.createRadialGradient(el.x, el.y, 0, el.x, el.y, glowR);
        glow.addColorStop(0, hexA(el.color, 0.9 * intensity));
        glow.addColorStop(0.35, hexA(el.color, 0.35 * intensity));
        glow.addColorStop(1, hexA(el.color, 0));
        c.fillStyle = glow;
        c.beginPath();
        c.arc(el.x, el.y, glowR, 0, Math.PI * 2);
        c.fill();

        // 4. 核心
        c.save();
        c.beginPath();
        c.arc(el.x, el.y, 9 * S, 0, Math.PI * 2);
        c.fillStyle = mixHex(el.color, '#ffffff', 0.55);
        c.fill();
        c.strokeStyle = hexA('#ffffff', 0.85);
        c.lineWidth = 1.5 * S;
        c.stroke();
        c.beginPath();
        c.arc(el.x - 2 * S, el.y - 2 * S, 3 * S, 0, Math.PI * 2);
        c.fillStyle = hexA('#ffffff', 0.9);
        c.fill();
        c.restore();

        // 5. 方向箭头
        const ax = el.x + Math.cos(el.angle) * 22 * S;
        const ay = el.y + Math.sin(el.angle) * 22 * S;
        c.save();
        c.strokeStyle = hexA(el.color, 0.85);
        c.lineWidth = 1.8 * S;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(el.x + Math.cos(el.angle) * 12 * S, el.y + Math.sin(el.angle) * 12 * S);
        c.lineTo(ax, ay);
        c.stroke();
        const a = el.angle;
        c.beginPath();
        c.moveTo(ax + Math.cos(a) * 6 * S, ay + Math.sin(a) * 6 * S);
        c.lineTo(ax - Math.cos(a) * 2 * S - Math.sin(a) * 4 * S,
                 ay - Math.sin(a) * 2 * S + Math.cos(a) * 4 * S);
        c.lineTo(ax - Math.cos(a) * 2 * S + Math.sin(a) * 4 * S,
                 ay - Math.sin(a) * 2 * S - Math.cos(a) * 4 * S);
        c.closePath();
        c.fillStyle = hexA(el.color, 0.85);
        c.fill();
        c.restore();
      }
    }
  };
})()