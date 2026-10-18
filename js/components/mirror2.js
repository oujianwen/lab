(function () {
  function parseColor(hex) {
    let s = (hex || '#a8d8ff').replace('#', '');
    if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
    const n = parseInt(s, 16);
    if (isNaN(n)) return { r: 168, g: 216, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function lighten(hex, t) {
    const c = parseColor(hex);
    return '#' + ['r','g','b'].map(k =>
      Math.round(c[k] + (255 - c[k]) * t).toString(16).padStart(2, '0')).join('');
  }
  function darken(hex, t) {
    const c = parseColor(hex);
    return '#' + ['r','g','b'].map(k =>
      Math.round(c[k] * (1 - t)).toString(16).padStart(2, '0')).join('');
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function mirrorSeg(m) {
    const h = m.length / 2;
    const dx = Math.cos(m.angle) * h;
    const dy = Math.sin(m.angle) * h;
    return {
      ax: m.x - dx, ay: m.y - dy,
      bx: m.x + dx, by: m.y + dy,
      a: { x: m.x - dx, y: m.y - dy },
      b: { x: m.x + dx, y: m.y + dy }
    };
  }
  function mirrorPoint(px, py, ax, ay, bx, by) {
    const mx = bx - ax, my = by - ay;
    const len2 = mx * mx + my * my;
    if (len2 < 0.0001) return null;
    const t = ((px - ax) * mx + (py - ay) * my) / len2;
    return { x: 2 * (ax + mx * t) - px, y: 2 * (ay + my * t) - py };
  }
  function segmentIntersect(p1, p2, a, b) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = a.x, y3 = a.y, x4 = b.x, y4 = b.y;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t < -0.001 || t > 1.001) return null;
    if (u < -0.001 || u > 1.001) return null;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t, u };
  }

  function computeOneBounce(light, eye, m) {
    const seg = mirrorSeg(m);
    const eyeImg = mirrorPoint(eye.x, eye.y, seg.ax, seg.ay, seg.bx, seg.by);
    if (!eyeImg) return null;
    const hit = segmentIntersect(light, eyeImg, seg.a, seg.b);
    if (!hit) return null;
    return { points: [{ x: hit.x, y: hit.y }], mirrors: [m] };
  }

  function computeTwoBounce(light, eye, m1, m2) {
    const s1 = mirrorSeg(m1);
    const s2 = mirrorSeg(m2);
    const e1 = mirrorPoint(eye.x, eye.y, s1.ax, s1.ay, s1.bx, s1.by);
    if (!e1) return null;
    const e12 = mirrorPoint(e1.x, e1.y, s2.ax, s2.ay, s2.bx, s2.by);
    if (!e12) return null;
    const p2 = segmentIntersect(light, e12, s2.a, s2.b);
    if (!p2) return null;
    const p1 = segmentIntersect(p2, e1, s1.a, s1.b);
    if (!p1) return null;
    if (p1.t < 0.001 || p1.t > 0.999) return null;
    if (p2.t < 0.001 || p2.t > 0.999) return null;
    return {
      points: [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }],
      mirrors: [m1, m2]
    };
  }

  function angleAt(hit, from, to, mirrorAngle) {
    const nx = -Math.sin(mirrorAngle);
    const ny = Math.cos(mirrorAngle);
    const backDx = from.x - hit.x, backDy = from.y - hit.y;
    const backLen = Math.hypot(backDx, backDy) || 0.001;
    const backNx = backDx / backLen, backNy = backDy / backLen;
    const dot = backNx * nx + backNy * ny;
    const nX = dot >= 0 ? nx : -nx;
    const nY = dot >= 0 ? ny : -ny;
    const angleIn = Math.acos(clamp01(backNx * nX + backNy * nY)) * 180 / Math.PI;
    const outDx = to.x - hit.x, outDy = to.y - hit.y;
    const outLen = Math.hypot(outDx, outDy) || 0.001;
    const outNx = outDx / outLen, outNy = outDy / outLen;
    const angleOut = Math.acos(clamp01(outNx * nX + outNy * nY)) * 180 / Math.PI;
    return { angleIn, angleOut, normal: { x: nX, y: nY } };
  }

  function drawMirrorBody(c, el, env) {
    c.save();
    c.translate(el.x, el.y);
    c.rotate(el.angle);
    const half = el.length / 2;
    const thick = 6 * env.S;
    const glowPulse = 0.3 + 0.1 * Math.sin(env.time * 2);
    const glow = c.createLinearGradient(0, -thick * 4, 0, thick * 4);
    glow.addColorStop(0, 'rgba(168,216,255,0)');
    glow.addColorStop(0.5, `rgba(168,216,255,${glowPulse})`);
    glow.addColorStop(1, 'rgba(168,216,255,0)');
    c.fillStyle = glow;
    c.fillRect(-half, -thick * 4, el.length, thick * 8);
    const grad = c.createLinearGradient(0, -thick, 0, thick);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, el.color);
    grad.addColorStop(0.55, lighten(el.color, 0.5));
    grad.addColorStop(1, darken(el.color, 0.4));
    c.fillStyle = grad;
    c.fillRect(-half, -thick / 2, el.length, thick);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 1.5 * env.S;
    c.beginPath();
    c.moveTo(-half + 6 * env.S, -thick / 2 + 1.5 * env.S);
    c.lineTo(half - 6 * env.S, -thick / 2 + 1.5 * env.S);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1 * env.S;
    for (let i = 0; i < 3; i++) {
      const px = -half * 0.6 + i * half * 0.5;
      c.beginPath();
      c.moveTo(px, thick / 2 - 1 * env.S);
      c.lineTo(px + 20 * env.S, -thick / 2 + 1 * env.S);
      c.stroke();
    }
    c.strokeStyle = 'rgba(30,50,80,0.7)';
    c.lineWidth = 1.5 * env.S;
    c.strokeRect(-half, -thick / 2, el.length, thick);
    c.fillStyle = 'rgba(94,179,255,0.9)';
    c.beginPath();
    c.arc(half - 4 * env.S, 0, 4 * env.S, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(-half + 4 * env.S, 0, 4 * env.S, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawFullPath(c, el, ray, env) {
    const S = env.S;
    const path = [ray.light, ...ray.points, ray.eye];
    c.save();
    c.strokeStyle = 'rgba(255,220,120,0.85)';
    c.lineWidth = 1.6 * S;
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) c.lineTo(path[i].x, path[i].y);
    c.stroke();
    for (let i = 0; i < ray.points.length; i++) {
      const p = ray.points[i];
      const m = ray.mirrors[i];
      if (!m) continue;
      const nx = -Math.sin(m.angle);
      const ny = Math.cos(m.angle);
      c.strokeStyle = 'rgba(94,179,255,0.55)';
      c.lineWidth = 1 * S;
      c.setLineDash([4 * S, 4 * S]);
      c.beginPath();
      c.moveTo(p.x - nx * 20 * S, p.y - ny * 20 * S);
      c.lineTo(p.x + nx * 20 * S, p.y + ny * 20 * S);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.arc(p.x, p.y, 4 * S, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,220,120,1)';
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 1.2 * S;
      c.stroke();
    }
    c.restore();
  }

  function drawAngleAnnotation(c, el, ray, env) {
    if (ray.kind !== 'single') return;
    if (!ray.points.length) return;
    const S = env.S;
    const hit = ray.points[0];
    const angle = angleAt(hit, ray.light, ray.eye, el.angle);
    const nX = angle.normal.x;
    const nY = angle.normal.y;
    const toLightX = ray.light.x - hit.x, toLightY = ray.light.y - hit.y;
    const inLen = Math.hypot(toLightX, toLightY) || 0.001;
    const iUx = toLightX / inLen, iUy = toLightY / inLen;
    const toEyeX = ray.eye.x - hit.x, toEyeY = ray.eye.y - hit.y;
    const outLen = Math.hypot(toEyeX, toEyeY) || 0.001;
    const rUx = toEyeX / outLen, rUy = toEyeY / outLen;
    const arcR = 36 * S;
    c.save();
    const a1 = Math.atan2(iUy, iUx);
    const a2 = Math.atan2(nY, nX);
    let delta1 = a2 - a1;
    while (delta1 > Math.PI) delta1 -= Math.PI * 2;
    while (delta1 < -Math.PI) delta1 += Math.PI * 2;
    c.strokeStyle = 'rgba(255,220,120,0.85)';
    c.lineWidth = 1.8 * S;
    c.beginPath();
    c.arc(hit.x, hit.y, arcR, a1, a2, delta1 < 0);
    c.stroke();
    const a3 = Math.atan2(rUy, rUx);
    let delta2 = a3 - a2;
    while (delta2 > Math.PI) delta2 -= Math.PI * 2;
    while (delta2 < -Math.PI) delta2 += Math.PI * 2;
    c.strokeStyle = 'rgba(120,200,255,0.85)';
    c.beginPath();
    c.arc(hit.x, hit.y, arcR * 0.85, a2, a3, delta2 < 0);
    c.stroke();
    const labelR = arcR + 24 * S;
    const label1X = hit.x + iUx * labelR * 0.8 + nX * labelR * 0.3;
    const label1Y = hit.y + iUy * labelR * 0.8 + nY * labelR * 0.3;
    const label2X = hit.x + rUx * labelR * 0.8 + nX * labelR * 0.3;
    const label2Y = hit.y + rUy * labelR * 0.8 + nY * labelR * 0.3;
    c.font = `bold ${11 * S}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const drawLabel = (x, y, txt, color) => {
      const tw = c.measureText(txt).width;
      c.fillStyle = 'rgba(0,0,0,0.7)';
      const pad = 5 * S;
      const w = tw + pad * 2;
      const h = 16 * S;
      c.beginPath();
      c.roundRect
        ? c.roundRect(x - w / 2, y - h / 2, w, h, 6 * S)
        : c.rect(x - w / 2, y - h / 2, w, h);
      c.fill();
      c.fillStyle = color;
      c.fillText(txt, x, y + 1);
    };
    drawLabel(label1X, label1Y, `∠入 ${angle.angleIn.toFixed(1)}°`, 'rgba(255,220,120,0.95)');
    drawLabel(label2X, label2Y, `∠反 ${angle.angleOut.toFixed(1)}°`, 'rgba(120,200,255,0.95)');
    c.restore();
  }

  function drawVirtualLight(c, el, light, env) {
    const seg = mirrorSeg(el);
    const img = mirrorPoint(light.x, light.y, seg.ax, seg.ay, seg.bx, seg.by);
    if (!img) return;
    const S = env.S;
    c.save();
    const rays = (el._rays || []).filter(r => r.kind === 'single' && r.light.id === light.id);
    if (rays.length) {
      const hit = rays[0].points[0];
      c.strokeStyle = 'rgba(255,220,120,0.25)';
      c.setLineDash([4 * S, 6 * S]);
      c.lineWidth = 1 * S;
      c.beginPath();
      c.moveTo(img.x, img.y);
      c.lineTo(hit.x, hit.y);
      c.stroke();
      c.setLineDash([]);
    }
    const r = 10 * S;
    const g = c.createRadialGradient(img.x, img.y, 0, img.x, img.y, r * 3);
    g.addColorStop(0, 'rgba(255,220,120,0.55)');
    g.addColorStop(1, 'rgba(255,220,120,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(img.x, img.y, r * 3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,220,120,0.85)';
    c.lineWidth = 1.6 * S;
    c.setLineDash([3 * S, 3 * S]);
    c.beginPath();
    c.arc(img.x, img.y, r, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.font = `bold ${10 * S}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(255,220,120,0.9)';
    c.fillText('虚像', img.x, img.y + r + 12 * S);
    c.restore();
  }

  return {
    type: 'mirror',
    label: '平面镜',
    icon: '🪞',
    category: 'optical',
    color: '#a8d8ff',

    defaults() {
      return {
        x: 500, y: 400,
        length: 180,
        angle: 0,
        color: '#a8d8ff',
        showRays: true,
        showAngles: true,
        showVirtualImage: true,
        _rays: []
      };
    },

    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    getRadius(el, env) { return el.length / 2 + 20 * env.S; },

    /* ← 修复：接收 env，并加兜底 */
    getHandles(el, env) {
      const S = (env && env.S) ? env.S : 1;
      const h = el.length / 2;
      const dx = Math.cos(el.angle) * h;
      const dy = Math.sin(el.angle) * h;
      // 返回端点 + 中心，但手柄用端点
      return [
        { id: 'end1', x: el.x + dx, y: el.y + dy },
        { id: 'end2', x: el.x - dx, y: el.y - dy }
      ];
    },
    onHandleDrag(el, handleId, p) {
      const dx = p.x - el.x;
      const dy = p.y - el.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (handleId === 'end1') el.angle = Math.atan2(dy, dx);
      else el.angle = Math.atan2(dy, dx) + Math.PI;
    },

    properties: [
      { key: 'x', label: 'X', type: 'number' },
      { key: 'y', label: 'Y', type: 'number' },
      { key: 'length', label: '长度', type: 'number', min: 40, max: 500 },
      { key: 'angle', label: '角度°', type: 'number', step: 5, radians: true },
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'showRays', label: '显示光路', type: 'checkbox' },
      { key: 'showAngles', label: '显示角度', type: 'checkbox' },
      { key: 'showVirtualImage', label: '显示虚像', type: 'checkbox' }
    ],

    /* ---------- 关键修复：反射系统兼容 light_source ---------- */
    system: {
      update(scene, dt, env) {
        const mirrors = scene.elements.filter(e => e.type === 'mirror' && !e.__missing);

        // ← 修复：把 light_source 也当作光源
        const lights = scene.elements.filter(e =>
          (e.type === 'light' || e.type === 'light_source') && !e.__missing
        );
        const eyes = scene.elements.filter(e => e.type === 'eye' && !e.__missing);

        for (const m of mirrors) m._rays = [];
        if (!mirrors.length || !lights.length) return;

        for (const light of lights) {
          for (const eye of eyes) {
            for (const m of mirrors) {
              const r = computeOneBounce(light, eye, m);
              if (r) {
                m._rays.push({ kind: 'single', light, eye, points: r.points, mirrors: r.mirrors });
              }
            }
            if (mirrors.length >= 2) {
              for (const m1 of mirrors) {
                for (const m2 of mirrors) {
                  if (m1 === m2) continue;
                  const r = computeTwoBounce(light, eye, m1, m2);
                  if (r) {
                    m1._rays.push({ kind: 'double', light, eye, points: r.points, mirrors: r.mirrors });
                    m2._rays.push({ kind: 'double', light, eye, points: r.points, mirrors: r.mirrors });
                  }
                }
              }
            }
          }
        }
      }
    },

    render: {
      main(el, scene, env) {
        const c = env.ctx;
        if (el.showRays && Array.isArray(el._rays)) {
          for (const ray of el._rays) drawFullPath(c, el, ray, env);
        }
        if (el.showVirtualImage && Array.isArray(el._rays)) {
          const seen = new Set();
          for (const ray of el._rays) {
            if (ray.kind !== 'single') continue;
            if (seen.has(ray.light.id)) continue;
            seen.add(ray.light.id);
            drawVirtualLight(c, el, ray.light, env);
          }
        }
        drawMirrorBody(c, el, env);
        if (el.showAngles && Array.isArray(el._rays)) {
          for (const ray of el._rays) drawAngleAnnotation(c, el, ray, env);
        }
      }
    }
  };
})()