({
  type: 'spring',
  label: '弹簧',
  icon: '🧵',
  category: 'mechanical',
  color: '#c390ff',

  defaults() {
    return {
      // 锚点（固定端）
      x: 300, y: 380,
      // 弹簧参数
      restLength: 150,
      coils: 9,
      stiffness: 1.5,
      mass: 1.0,
      damping: 1.5,
      color: '#c390ff',
      // 运行时：自由端位置与速度
      _fx: 300, _fy: 530,
      _vx: 0, _vy: 0,
      _lastDragTime: 0
    };
  },

  // 整体（用于拖动中心的判定、选中框）
  getPosition(el) {
    return { x: (el.x + el._fx) / 2, y: (el.y + el._fy) / 2 };
  },
  setPosition(el, x, y) {
    const cx = (el.x + el._fx) / 2;
    const cy = (el.y + el._fy) / 2;
    const dx = x - cx, dy = y - cy;
    el.x += dx; el.y += dy;
    el._fx += dx; el._fy += dy;
  },
  getRadius(el, env) {
    const len = Math.hypot(el._fx - el.x, el._fy - el.y);
    return len / 2 + 30 * env.S;
  },

  // 两端手柄
  getHandles(el) {
    return [
      { id: 'anchor', x: el.x,  y: el.y  },
      { id: 'free',   x: el._fx, y: el._fy }
    ];
  },
  onHandleDrag(el, handleId, p) {
    const now = performance.now();
    if (handleId === 'anchor') {
      // 挪锚点：自由端保持相对位置一起平移
      const dx = p.x - el.x, dy = p.y - el.y;
      el.x = p.x; el.y = p.y;
      el._fx += dx; el._fy += dy;
    } else if (handleId === 'free') {
      // 直接拉自由端
      el._fx = p.x;
      el._fy = p.y;
      el._vx = 0;
      el._vy = 0;
      el._lastDragTime = now;
    }
  },

  properties: [
    { key: 'x',          label: 'X',    type: 'number' },
    { key: 'y',          label: 'Y',    type: 'number' },
    { key: 'restLength', label: '自然长', type: 'number', min: 40, max: 500 },
    { key: 'coils',      label: '圈数', type: 'number', min: 2,  max: 30 },
    { key: 'stiffness',  label: '劲度', type: 'number', min: 0.2, max: 5, step: 0.1 },
    { key: 'mass',       label: '质量', type: 'number', min: 0.2, max: 5, step: 0.1 },
    { key: 'damping',    label: '阻尼', type: 'number', min: 0, max: 5, step: 0.1 },
    { key: 'color',      label: '颜色', type: 'color' }
  ],

  render: {
    main(el, scene, env) {
      const c = env.ctx;

      // 当前实际长度与方向
      const dx = el._fx - el.x;
      const dy = el._fy - el.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx);
      const stretch = len - el.restLength;

      c.save();
      c.translate(el.x, el.y);
      c.rotate(ang);

      const amp = 14 * env.S;
      const n = Math.max(2, el.coils | 0) * 2;
      const inner = Math.max(10, len - 14 * env.S);

      // 锚点端子
      c.fillStyle = '#8899bb';
      c.beginPath();
      c.arc(0, 0, 7 * env.S, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 1.5 * env.S;
      c.stroke();

      // 自由端端子（按速度微微发光，被拉伸时变红）
      const hot = Math.min(1, Math.abs(stretch) / 60);
      const r = 9 * env.S;
      const rg = c.createRadialGradient(len, 0, 0, len, 0, r * 2.4);
      rg.addColorStop(0, `rgba(255,${150 - hot * 100},${120 - hot * 80},${0.6 + hot * 0.4})`);
      rg.addColorStop(1, 'rgba(255,120,100,0)');
      c.fillStyle = rg;
      c.beginPath();
      c.arc(len, 0, r * 2.4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffd8a8';
      c.beginPath();
      c.arc(len, 0, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(120,60,30,0.6)';
      c.lineWidth = 1.5 * env.S;
      c.stroke();

      // 弹簧线圈（跟劲度联动粗细）
      c.strokeStyle = el.color;
      c.lineWidth = (2 + el.stiffness * 1.2) * env.S;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = 10 * env.S + inner * t;
        const py = (i % 2 === 0 ? -1 : 1) * amp;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      // 高光
      c.strokeStyle = 'rgba(255,255,255,0.28)';
      c.lineWidth = 1.2 * env.S;
      c.stroke();

      // 拉伸量标签
      c.save();
      c.rotate(-ang);  // 转回水平，字不歪
      c.font = `bold ${10 * env.S}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const sTxt = stretch >= 0 ? `+${stretch.toFixed(0)}` : `${stretch.toFixed(0)}`;
      const labelColor = Math.abs(stretch) > 5
        ? `rgba(255,${150 - hot * 80},100,0.95)`
        : 'rgba(195,144,255,0.9)';
      c.fillStyle = labelColor;
      c.fillText(`Δ${sTxt}`, 0, -amp - 12 * env.S);
      c.restore();

      c.restore();

      // 平衡位置虚影（可选，帮助理解）
      if (Math.abs(stretch) > 8) {
        c.save();
        c.translate(el.x, el.y);
        c.rotate(ang);
        c.strokeStyle = 'rgba(195,144,255,0.25)';
        c.setLineDash([4 * env.S, 4 * env.S]);
        c.lineWidth = 1.5 * env.S;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(el.restLength, 0);
        c.stroke();
        c.setLineDash([]);
        c.restore();
      }
    }
  },

  // ===== 物理系统：简谐运动 =====
  system: {
    update(scene, dt, env) {
      const now = performance.now();
      const K = 120;   // 力的放大系数（调大更"硬"）

      for (const el of scene.elements) {
        if (el.type !== 'spring') continue;

        // 拖动中不更新物理
        if (now - (el._lastDragTime || 0) < 60) continue;

        // 子步积分，避免大 dt 抖爆
        const steps = Math.min(10, Math.max(1, Math.ceil(dt / 0.01)));
        const sdt = dt / steps;

        for (let s = 0; s < steps; s++) {
          const dx = el._fx - el.x;
          const dy = el._fy - el.y;
          const len = Math.hypot(dx, dy) || 0.001;
          const stretch = len - el.restLength;

          // 弹力方向：从自由端指向锚点的方向为恢复方向
          const nx = dx / len;
          const ny = dy / len;

          // 力 = -k * stretch，沿弹簧轴
          const forceMag = -el.stiffness * stretch * K;
          const fx = nx * forceMag;
          const fy = ny * forceMag;

          // 加速度
          const ax = fx / Math.max(0.1, el.mass);
          const ay = fy / Math.max(0.1, el.mass);

          // 速度积分 + 阻尼
          el._vx += ax * sdt;
          el._vy += ay * sdt;
          const damp = Math.max(0, 1 - el.damping * sdt);
          el._vx *= damp;
          el._vy *= damp;

          // 位置积分
          el._fx += el._vx * sdt;
          el._fy += el._vy * sdt;
        }

        // 速度极小时吸附到平衡长度，避免永远微振
        if (Math.abs(el._vx) < 0.5 && Math.abs(el._vy) < 0.5) {
          const dx2 = el._fx - el.x;
          const dy2 = el._fy - el.y;
          const len2 = Math.hypot(dx2, dy2) || 0.001;
          const err = len2 - el.restLength;
          if (Math.abs(err) < 0.8) {
            const nx = dx2 / len2;
            const ny = dy2 / len2;
            el._fx = el.x + nx * el.restLength;
            el._fy = el.y + ny * el.restLength;
            el._vx = 0;
            el._vy = 0;
          }
        }
      }
    }
  }
})