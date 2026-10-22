/**
 * 光源组件（light_source）
 * ------------------------------------------------------------------
 * 模块概述：
 *   本文件定义了一个「点光源」物理/光学部件，以 IIFE 立即执行函数的形式
 *   返回一个组件描述对象，供部件注册器（registry）加载。光源会沿指定方向
 *   发射一束光（可以是单线光束，也可以是扇形发散光束），并在系统更新阶段
 *   通过光线追踪检测场景中的镜子与球：
 *     - 遇到镜子：按反射定律计算反射光线并继续延伸；
 *     - 遇到球：球会遮挡光线，光束在球面处终止且不再反射；
 *     - 未命中任何物体：光束延伸到射程终点。
 *   渲染阶段依据追踪结果绘制光束、反射线、光晕、发光核心与方向箭头。
 *
 * 说明：
 *   几何求解与颜色处理等辅助函数均封闭在 IIFE 内部，避免污染全局命名空间。
 *   末尾的 IIFE 结尾不使用分号，遵循项目外部部件文件的统一格式约定。
 */
(function () {
  /**
   * 将十六进制颜色字符串解析为 RGB 分量对象。
   * @param {string} hex 形如 '#ffe27a' 或 '#fff' 的颜色串，允许省略前缀 '#'
   * @returns {{r:number,g:number,b:number}} RGB 分量（0~255）
   * 实现逻辑：去除 '#'；若为 3 位简写则逐位扩展为 6 位；再按 16 进制解析，
   * 通过位移和掩码拆分出 r/g/b。解析失败时回退为默认暖黄色，保证渲染不崩溃。
   */
  function parseColor(hex) {
    let s = (hex || '#ffe27a').replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16);
    if (isNaN(n)) return { r: 255, g: 226, b: 122 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  /**
   * 将十六进制颜色转换为带指定透明度的 rgba() 字符串。
   * @param {string} hex 基础颜色
   * @param {number} a 透明度，会被 clamp 到 [0,1]
   * @returns {string} rgba(...) 颜色串
   */
  function hexA(hex, a) {
    const c = parseColor(hex);
    return `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, a))})`;
  }
  /**
   * 在两个十六进制颜色之间做线性插值（混色）。
   * @param {string} a 起始颜色
   * @param {string} b 目标颜色
   * @param {number} t 插值系数 [0,1]，0 得到 a，1 得到 b
   * @returns {string} 混合后的 '#rrggbb' 颜色串
   * 用途：发光核心通过向白色靠拢来表现"高温/高亮"的观感。
   */
  function mixHex(a, b, t) {
    const A = parseColor(a), B = parseColor(b);
    return '#' + ['r','g','b'].map(k =>
      Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
  }
  /**
   * 计算镜子线段的两端点。
   * @param {object} m 镜子元素，含 x/y（中心）、length（全长）、angle（朝向弧度）
   * @returns {{a:{x,y},b:{x,y}}} 以镜子中心为中点、沿 angle 方向展开的两个端点
   * 设计意图：光线追踪把镜子近似为一条线段，用于射线-线段求交。
   */
  function mirrorSeg(m) {
    const h = (m.length || 0) / 2;
    const c = Math.cos(m.angle || 0);
    const s = Math.sin(m.angle || 0);
    return {
      a: { x: m.x - c * h, y: m.y - s * h },
      b: { x: m.x + c * h, y: m.y + s * h }
    };
  }
  /**
   * 射线与线段求交。
   * @param {number} ox,oy 射线起点
   * @param {number} dx,dy 射线方向向量（未归一化，t 即为沿该方向的距离参数）
   * @param {{x,y}} a,b 线段两端点
   * @returns {null|{x,y,dist}} 命中点及距离参数；平行或在线段外/反向时返回 null
   * 实现逻辑：使用行列式求解参数方程；denom 接近 0 视为平行；
   *   t 为射线方向参数（限制 t>0.001 避免自相交），s 为线段上的位置参数（限制 [0,1]）。
   */
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
  /**
   * 射线与圆形（球）求交。
   * @param {number} ox,oy 射线起点   @param {number} dx,dy 射线方向（单位向量）
   * @param {number} cx,cy 圆心       @param {number} r 半径
   * @returns {null|{x,y,dist}} 沿射线方向最近的命中点；无正向前交点返回 null
   * 实现逻辑：把问题转化为一元二次方程 t^2 + 2b t + c = 0（方向已归一化），
   *   判别式 disc<0 表示不相交；优先取较近的正根 t1，其次 t2。
   */
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
  /**
   * 对单个光源发射一组光线，计算它们与镜子/球的交互结果。
   * @param {object} el 光源元素，读取 angle/color/beamSpread/beamLength 等
   * @param {Array} mirrors 场景中所有镜子元素
   * @param {Array} balls 场景中所有球元素
   * @returns {Array} 光线数组，每条包含 origin/hit/hitMirror/hitBall/refEnd
   * 设计意图：
   *   - beamSpread>0 时按 15 条光线均匀铺开形成扇形，否则只发 1 条中心光线；
   *   - 每条光线取所有求交中距离最近者作为实际命中（best）；
   *   - 命中镜子则按反射定律算出反射终点 refEnd 并延伸剩余射程；
   *   - 命中球则光被遮挡，不产生反射；未命中则直线延伸到射程终点。
   */
  function traceRays(el, mirrors, balls) {
    const rays = [];
    const beamLength = el.beamLength || 500;
    const spreads = (el.beamSpread || 0) > 0 ? 15 : 1;
    const halfSpread = ((el.beamSpread || 0) * Math.PI / 180) / 2;
    const baseAngle = el.angle || 0;

    for (let i = 0; i < spreads; i++) {
      // 将 i 映射到 [-0.5, 0.5]，再乘半发散角得到该光线相对基准角的偏移
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
        // 镜面法向量（垂直于镜子朝向），按 r = d - 2(d·n)n 计算反射方向
        const nx = -Math.sin(best.mirror.angle || 0);
        const ny = Math.cos(best.mirror.angle || 0);
        const dot = dx * nx + dy * ny;
        const rdx = dx - 2 * dot * nx;
        const rdy = dy - 2 * dot * ny;
        // 反射光线保留剩余射程，且至少延伸 100，保证可见
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
        // 未命中任何物体：沿原方向延伸到射程终点
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
    // 组件元数据：类型标识、显示名称、图标、所属分类（光学）、主题色
    type: 'light_source',
    label: '光源',
    icon: '💡',
    category: 'optical',
    color: '#ffe27a',

    /** 新建光源时的默认属性：位置、朝向、颜色、强度、发散角、射程及显示开关 */
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
        _pulse: 0,   // 内部：呼吸动画相位
        _rays: []    // 内部：最近一次光线追踪结果，供渲染使用
      };
    },

    // 拖拽/序列化用的位置读写接口
    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    // 命中/选择用的半径（乘以缩放系数 S 以适配不同画布缩放）
    getRadius(el, env) { return 32 * (env && env.S ? env.S : 1); },

    /**
     * 返回可拖拽控制手柄列表。
     * 提供一个位于光源正前方 48*S 处的"方向手柄"，用户拖动它即可改变出光方向。
     */
    getHandles(el, env) {
      const S = (env && env.S) ? env.S : 1;
      const r = 48 * S;
      return [{
        id: 'dir',
        x: el.x + Math.cos(el.angle) * r,
        y: el.y + Math.sin(el.angle) * r
      }];
    },
    /**
     * 方向手柄拖拽回调：根据手柄相对光源的位置重新计算 angle。
     * 位移阈值 (>1) 用于避免在手柄与光源几乎重合时产生角度抖动。
     */
    onHandleDrag(el, handleId, p) {
      if (handleId !== 'dir') return;
      const dx = p.x - el.x;
      const dy = p.y - el.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.angle = Math.atan2(dy, dx);
    },

    // 属性面板配置：定义各可编辑字段的标签、控件类型与取值范围
    // angle 标记 radians:true 表示内部以弧度存储、面板以角度展示
    // intensity 使用 range 控件并通过 scale:100 映射（面板值/100 得到真实强度）
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

    /**
     * 系统级更新：每帧被引擎调用。
     * 先筛选出场景中有效的镜子与球（排除 __missing 缺失元素），
     * 再对每个光源累加呼吸动画相位并重新执行光线追踪，结果缓存到 el._rays。
     */
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
      /**
       * 主渲染：按「光束 → 反射线 → 光晕 → 发光核心 → 方向箭头」顺序叠加绘制。
       * 所有尺寸均乘以缩放系数 S，透明度乘以 intensity，保证不同缩放下观感一致。
       */
      main(el, scene, env) {
        const c = env.ctx;
        const S = (env && env.S) ? env.S : 1;
        const intensity = el.intensity ?? 1;
        const pulse = 0.5 + 0.5 * Math.sin(el._pulse || 0);  // [0,1] 呼吸脉动
        const rays = Array.isArray(el._rays) ? el._rays : [];

        // 1. 光束：到第一个交点（镜面 / 球 / 射程）
        if (el.showBeam && rays.length) {
          c.save();
          if (rays.length === 1) {
            // 单光线：用线性渐变画一条由亮到暗的光束线
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
            // 若未开启光束显示，则用虚线补充画出入射线，保证反射线可读
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
            // 反射线段
            c.strokeStyle = hexA(el.color, 0.55 * intensity);
            c.lineWidth = 1.6 * S;
            c.beginPath();
            c.moveTo(r.hit.x, r.hit.y);
            c.lineTo(r.refEnd.x, r.refEnd.y);
            c.stroke();
            // 命中点高亮标记
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

        // 3. 光晕：半径随呼吸脉动和强度变化，形成柔和发光
        const glowR = 34 * S * (1 + 0.12 * pulse) * Math.max(0.6, intensity);
        const glow = c.createRadialGradient(el.x, el.y, 0, el.x, el.y, glowR);
        glow.addColorStop(0, hexA(el.color, 0.9 * intensity));
        glow.addColorStop(0.35, hexA(el.color, 0.35 * intensity));
        glow.addColorStop(1, hexA(el.color, 0));
        c.fillStyle = glow;
        c.beginPath();
        c.arc(el.x, el.y, glowR, 0, Math.PI * 2);
        c.fill();

        // 4. 核心：向白色混色得到高亮灯泡核心，并叠加左上偏移高光点
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

        // 5. 方向箭头：从核心伸出，指示出光方向（杆 + 三角形箭头）
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
        // 箭头头部：沿角度 a 构造三角形的三个顶点
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