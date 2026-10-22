/**
 * 圆球组件（ball）
 * ------------------------------------------------------------------
 * 模块概述：
 *   本文件以 IIFE 立即执行函数的形式返回一个「圆球」部件描述对象，供部件
 *   注册器（registry）加载。球被归类为光学（optical）部件，其主要职责是：
 *     - 接收场景中一个或多个光源（light / light_source）的照射；
 *     - 依据光源与球的相对位置、朝向和强度，计算球投射到地面上的阴影区间；
 *     - 根据最强光源方向在球面绘制高光，形成明暗立体感；
 *     - 当光照条件不满足（如无光源、光源未在球上方、方向未朝向球）时，
 *       通过 _hint 提示文案引导用户调整，并给出兜底的近似阴影。
 *
 * 关键内部状态（由 system.update 每帧写入，供 render 读取）：
 *   - _shadows：本帧计算出的阴影区间数组 [{x1,x2,y,alpha}]；
 *   - _groundY：当前地面线的 y 坐标；
 *   - _hint：需要展示给用户的操作提示文案（空串表示不显示）；
 *   - _litFrom：本帧中"最强"的照亮光源引用，用于确定球面高光方向。
 *
 * 说明：颜色处理与阴影计算的辅助函数均封闭在 IIFE 内部，避免污染全局；
 *   末尾 IIFE 结尾不使用分号，遵循项目外部部件文件的统一格式约定。
 */
(function () {
  /**
   * 将十六进制颜色字符串解析为 RGB 分量对象。
   * @param {string} hex 形如 '#ff6b8a' 或 '#fff' 的颜色串，允许省略前缀 '#'
   * @returns {{r:number,g:number,b:number}} RGB 分量（0~255）
   * 实现逻辑：去除 '#'；3 位简写逐位扩展为 6 位；按 16 进制解析后位移拆分为
   *   r/g/b。解析失败时回退为默认粉红色，保证渲染不崩溃。
   */
  function parseColor(hex) {
    let s = (hex || '#ff6b8a').replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16);
    if (isNaN(n)) return { r: 255, g: 107, b: 138 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  /**
   * 在两个十六进制颜色之间做线性插值（混色）。
   * @param {string} a 起始颜色  @param {string} b 目标颜色
   * @param {number} t 插值系数 [0,1]
   * @returns {string} 混合后的 '#rrggbb' 颜色串
   * 用途：球体渐变通过向白/黑混色来表现高光与暗部。
   */
  function mixHex(a, b, t) {
    const A = parseColor(a), B = parseColor(b);
    return '#' + ['r','g','b'].map(k =>
      Math.round(A[k] + (B[k] - A[k]) * t).toString(16).padStart(2, '0')).join('');
  }

  /**
   * 计算单个光源照射下，球投射到地面线上的阴影区间（本影近似）。
   * @param {object} light 光源元素，读取 x/y/angle/beamSpread/intensity
   * @param {object} ball 球元素，读取 x/y/r
   * @param {number} groundY 地面线的 y 坐标
   * @returns {null|{x1:number,x2:number,y:number,alpha:number}}
   *          阴影区间（地面上的左右端点、y、不透明度）；条件不满足时返回 null
   *
   * 实现逻辑与前置剔除：
   *   1. 光源必须在地面之上、且明显高于球，否则无法形成向下投影；
   *   2. 光源到球心距离需大于球半径（避免陷入球体内）；
   *   3. 若光源为定向光束（发散角 < 90°），用向量点积做宽松的"朝向球"检查；
   *   4. 以光源向球作两条切线（切线夹角 alpha = asin(r/d)），分别求其与地面
   *      的交点横坐标，得到阴影的左右端点 x1、x2；
   *   5. 阴影不透明度随光源强度增大而增强（上限 0.9）。
   * 设计意图：用几何切线投影近似真实本影，成本低且视觉上足够直观。
   */
  function computeShadow(light, ball, groundY) {
    const lx = light.x, ly = light.y;
    const cx = ball.x, cy = ball.y;
    const r = ball.r;

    if (ly >= groundY - 2) return null;
    if (ly >= cy - r * 0.1) return null;  // 光源必须明显高于球

    const dx = cx - lx, dy = cy - ly;
    const d = Math.hypot(dx, dy);
    if (d <= r * 1.05) return null;

    // 光源方向检查（宽松一点，只要大致朝向球即可）
    const spread = (light.beamSpread || 0) * Math.PI / 180;
    if (spread < Math.PI / 2) {
      const ldx = Math.cos(light.angle || 0);
      const ldy = Math.sin(light.angle || 0);
      const toBallX = cx - lx;
      const toBallY = cy - ly;
      const dot = (toBallX * ldx + toBallY * ldy) / d;
      const cosHalf = Math.cos(spread / 2 + 0.35);
      if (dot < cosHalf) return null;
    }

    const baseAngle = Math.atan2(dy, dx);
    const alpha = Math.asin(Math.min(1, r / d));

    const hits = [];
    for (const da of [-alpha, alpha]) {
      const a = baseAngle + da;
      const sA = Math.sin(a);
      if (Math.abs(sA) < 0.001) continue;
      const t = (groundY - ly) / sA;
      if (t <= 0) continue;
      hits.push(lx + Math.cos(a) * t);
    }
    if (hits.length < 2) return null;

    const x1 = Math.min(hits[0], hits[1]);
    const x2 = Math.max(hits[0], hits[1]);
    if (x2 - x1 < 2) return null;

    const intensity = light.intensity ?? 1;
    const alpha2 = Math.min(0.9, 0.35 + 0.55 * Math.min(intensity, 1.2));
    return { x1, x2, y: groundY, alpha: alpha2 };
  }

  return {
    // 组件元数据：类型标识、显示名称、图标、分类（光学）、主题色
    type: 'ball',
    label: '圆球',
    icon: '🔴',
    category: 'optical',
    color: '#ff6b8a',

    /** 新建球时的默认属性：位置、半径、颜色、地面距底百分比，以及各内部状态字段 */
    defaults() {
      return {
        x: 400, y: 280,
        r: 45,
        color: '#ff6b8a',
        groundOffset: 22,   // 地面距画布底部的百分比，决定地面线高度
        _shadows: [],       // 本帧阴影区间列表
        _groundY: 0,        // 本帧地面 y 坐标
        _hint: '',          // 操作提示文案
        _litFrom: null      // 最强照亮光源引用
      };
    },

    // 拖拽/序列化用的位置读写接口
    getPosition(el) { return { x: el.x, y: el.y }; },
    setPosition(el, x, y) { el.x = x; el.y = y; },
    // 命中/选择半径：球半径外加一定余量（随缩放 S 变化），便于点选
    getRadius(el, env) { return el.r + 12 * (env && env.S ? env.S : 1); },

    // 属性面板配置；groundOffset 用 range 控件，scale:1 表示面板值即真实值
    properties: [
      { key: 'x', label: 'X', type: 'number' },
      { key: 'y', label: 'Y', type: 'number' },
      { key: 'r', label: '半径', type: 'number', min: 10, max: 200 },
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'groundOffset', label: '地面距底%', type: 'range', min: 5, max: 60, scale: 1 }
    ],

    /**
     * 系统级更新：每帧被引擎调用，为每个球重算阴影、提示与主光源。
     * 流程：
     *   1. 先按 groundOffset 换算出地面线 y 坐标；
     *   2. 无光源则清空并提示放置光源；
     *   3. 遍历所有光源：记录是否有光源位于球上方(anyAbove)、是否有光源
     *      朝向球(anyAimed)，并调用 computeShadow 收集有效阴影；
     *   4. 若没有任何精确阴影，则依据缺失条件给出对应提示，或在位置和方向
     *      大致成立时兜底画一个近似阴影；
     *   5. 将阴影端点裁剪到画面范围（略留 50 边距）；
     *   6. 按 强度/距离 评分选出最强照亮光源（需在球上方），用于球面高光。
     */
    system: {
      update(scene, dt, env) {
        const lights = scene.elements.filter(e =>
          (e.type === 'light' || e.type === 'light_source') && !e.__missing
        );
        for (const el of scene.elements) {
          if (el.type !== 'ball') continue;
          const groundY = env.H * (1 - (el.groundOffset || 22) / 100);
          el._groundY = groundY;

          if (!lights.length) {
            el._shadows = [];
            el._hint = '没有光源，请先放置💡';
            el._litFrom = null;
            continue;
          }

          const shadows = [];
          let preciseCount = 0;
          let anyAbove = false;
          let anyAimed = false;

          for (const light of lights) {
            if (light.y < el.y - el.r * 0.1) anyAbove = true;
            // 方向检查
            const spread = (light.beamSpread || 0) * Math.PI / 180;
            if (spread >= Math.PI / 2) {
              anyAimed = true;
            } else {
              const ldx = Math.cos(light.angle || 0);
              const ldy = Math.sin(light.angle || 0);
              const toX = el.x - light.x;
              const toY = el.y - light.y;
              const d = Math.hypot(toX, toY) || 1;
              if ((toX * ldx + toY * ldy) / d > Math.cos(spread / 2 + 0.35)) {
                anyAimed = true;
              }
            }
            const s = computeShadow(light, el, groundY);
            if (s) { shadows.push(s); preciseCount++; }
          }

          if (preciseCount === 0) {
            if (!anyAbove) {
              el._hint = '↑ 把光源拖到球的上方（y更小）';
            } else if (!anyAimed) {
              el._hint = '↻ 调整光源方向，让它照向球';
            } else {
              // 位置和方向大致对，给个兜底影子保证看得见
              shadows.push({
                x1: el.x - el.r * 1.5,
                x2: el.x + el.r * 1.5,
                y: groundY,
                alpha: 0.28
              });
              el._hint = '≈ 光源偏离较远，效果近似';
            }
          } else {
            el._hint = '';
          }

          for (const s of shadows) {
            s.x1 = Math.max(-50, s.x1);
            s.x2 = Math.min(env.W + 50, s.x2);
          }

          // 找最强的照亮光源，用于球体高光
          let bestLight = null, bestScore = 0;
          for (const light of lights) {
            const toX = el.x - light.x;
            const toY = el.y - light.y;
            const d = Math.hypot(toX, toY) || 1;
            const score = (light.intensity || 1) / d;
            if (score > bestScore && light.y < el.y) {
              bestScore = score;
              bestLight = light;
            }
          }
          el._litFrom = bestLight;
          el._shadows = shadows;
        }
      }
    },

    render: {
      /**
       * 背景层渲染（先于球体绘制）：
       *   1. 绘制地面——从地面线到画布底部的垂直渐变填充，并描一条地面高亮线；
       *   2. 绘制每个阴影——以阴影区间为直径，在地面线上画椭圆径向渐变，
       *      中心最暗、边缘透明，模拟柔和的本影。
       */
      back(el, scene, env) {
        const c = env.ctx;
        const S = env.S;
        const groundY = el._groundY || (env.H * 0.78);

        c.save();
        const g = c.createLinearGradient(0, groundY, 0, env.H);
        g.addColorStop(0, 'rgba(40, 50, 80, 0.55)');
        g.addColorStop(1, 'rgba(10, 15, 30, 0.85)');
        c.fillStyle = g;
        c.fillRect(0, groundY, env.W, env.H - groundY);
        c.strokeStyle = 'rgba(120, 160, 240, 0.35)';
        c.lineWidth = 1.5 * S;
        c.beginPath();
        c.moveTo(0, groundY);
        c.lineTo(env.W, groundY);
        c.stroke();
        c.restore();

        for (const sh of el._shadows || []) {
          const cx = (sh.x1 + sh.x2) / 2;
          const w = Math.max(30 * S, sh.x2 - sh.x1);
          c.save();
          const grd = c.createRadialGradient(cx, groundY, 0, cx, groundY, w / 2);
          grd.addColorStop(0, `rgba(0,0,0,${sh.alpha})`);
          grd.addColorStop(0.7, `rgba(0,0,0,${sh.alpha * 0.65})`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = grd;
          c.beginPath();
          c.ellipse(cx, groundY, w / 2, Math.max(6 * S, w * 0.08), 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
      },

      /**
       * 主渲染：绘制球体本身、高光点与操作提示气泡。
       *   - 球体用径向渐变表现立体感：中心偏白、外缘偏黑；
       *   - 渐变焦点(hx,hy)偏向 _litFrom 光源方向，使亮面朝向光源；
       *   - 高光点沿同一方向偏移，强化受光效果；
       *   - _hint 非空时，在球下方绘制橙底提示气泡（优先用 roundRect，
       *     不支持则回退为直角矩形，做浏览器兼容处理）。
       */
      main(el, scene, env) {
        const c = env.ctx;
        const S = env.S;
        c.save();

        // 球体渐变：高光偏向光源方向（无光源时用默认左上 -0.35 偏移）
        let hx = -0.35, hy = -0.35;
        if (el._litFrom) {
          const dx = el._litFrom.x - el.x;
          const dy = el._litFrom.y - el.y;
          const d = Math.hypot(dx, dy) || 1;
          hx = dx / d * 0.5;
          hy = dy / d * 0.5;
        }
        const g = c.createRadialGradient(
          el.x + hx * el.r, el.y + hy * el.r, el.r * 0.1,
          el.x, el.y, el.r
        );
        g.addColorStop(0, mixHex(el.color, '#ffffff', 0.6));
        g.addColorStop(0.5, el.color);
        g.addColorStop(1, mixHex(el.color, '#000000', 0.6));
        c.fillStyle = g;
        c.beginPath();
        c.arc(el.x, el.y, el.r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = mixHex(el.color, '#000000', 0.65);
        c.lineWidth = 2 * S;
        c.stroke();

        // 高光点（朝光源一侧）
        c.beginPath();
        c.arc(el.x + hx * el.r * 0.7, el.y + hy * el.r * 0.7, el.r * 0.22, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.fill();

        // 提示
        if (el._hint) {
          c.font = `bold ${11 * S}px system-ui, sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          const text = el._hint;
          const tw = c.measureText(text).width;
          const pad = 7 * S;
          const bx = el.x - tw / 2 - pad;
          const by = el.y + el.r + 8 * S;
          const bw = tw + pad * 2;
          const bh = 20 * S;
          c.fillStyle = 'rgba(255,180,60,0.9)';
          c.beginPath();
          // 兼容：支持 roundRect 用圆角，否则回退直角矩形
          c.roundRect
            ? c.roundRect(bx, by, bw, bh, 9 * S)
            : c.rect(bx, by, bw, bh);
          c.fill();
          c.fillStyle = '#1a1200';
          c.fillText(text, el.x, by + bh / 2 + 1);
        }

        c.restore();
      }
    }
  };
})()