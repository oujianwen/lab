/* ============================================================
   音效模块 —— 基于 Web Audio API 的轻量合成音效
   ------------------------------------------------------------
   设计要点：
   - 不加载任何音频文件，全部用振荡器（Oscillator）实时合成，
     体积零开销、无网络请求、可随参数动态变化。
   - AudioContext 采用「懒初始化」：浏览器安全策略要求音频必须在
     用户手势（点击/触摸）之后才能启动，故 init() 由交互事件调用。
   - 对外只暴露语义化方法（grab/drop/click/add/spin/clack），
     屏蔽底层 beep 细节，调用方无需关心频率、时长等参数。
   ============================================================ */
export const Audio = {
    /* 底层 AudioContext 实例；null 表示尚未初始化（等待首次用户手势） */
    ctx: null,

    /* ---------- 初始化 ----------
       创建 AudioContext。window.webkitAudioContext 用于兼容旧版 Safari。
       用 try/catch 兜底：在不支持 Web Audio 或上下文创建失败的环境下静默降级，
       此时 this.ctx 保持 null，后续所有发声调用都会直接 return，不会抛错。 */
    init() {
        if (!this.ctx) {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
    },

    /* ---------- 基础发声单元 ----------
       合成一个短促音符：振荡器(o) → 音量包络(g) → 扬声器(destination)。
       @param {number} freq 频率（Hz），决定音高
       @param {number} dur  持续时间（秒）
       @param {number} vol  峰值音量（0~1），默认 0.08，避免过响
       @param {string} type 波形：'sine'正弦/'triangle'三角/'square'方波/'sawtooth'锯齿，决定音色
       @param {number} delay 相对当前时刻的延迟（秒），用于在同一调用里编排先后音符
       说明：t0 为绝对播放时间；音量从 vol 指数衰减到 0.001（近似静音），
       形成自然的「敲击/短促」听感，而非突然截断的爆音。ctx 未就绪时安全退出。 */
    beep(freq, dur, vol = 0.08, type = 'sine', delay = 0) {
        if (!this.ctx) return;
        const t0 = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t0);
        o.connect(g);
        g.connect(this.ctx.destination);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.start(t0);
        o.stop(t0 + dur);
    },

    /* ---------- 语义化音效（对外接口） ---------- */

    /* 抓起部件：中高频短音，提示「已选中并可拖动」 */
    grab()  { this.beep(620, 0.06, 0.05, 'triangle'); },

    /* 放下部件：比 grab 略低的音，形成「落定」的下行听感 */
    drop()  { this.beep(420, 0.07, 0.05, 'triangle'); },

    /* 齿轮咬合：先高音方波「咔」再低音三角「哒」，两音先后叠加模拟机械啮合声 */
    clack() { this.beep(880, 0.06, 0.08, 'square'); this.beep(660, 0.10, 0.05, 'triangle', 0.04); },

    /* 面板点击 / 删除等通用 UI 操作：清脆短促的中音 */
    click() { this.beep(520, 0.06, 0.05, 'triangle'); },

    /* 新增部件：双音上行（660→880），传达「出现/添加」的积极反馈 */
    add()   { this.beep(660, 0.05, 0.05, 'sine'); this.beep(880, 0.08, 0.05, 'sine', 0.05); },

    /* 陀螺旋转：锯齿波音色较「亮/飘」，两音上行营造持续转动的启动感 */
    spin()  { this.beep(440, 0.10, 0.05, 'sawtooth'); this.beep(660, 0.15, 0.05, 'sawtooth', 0.08); }
};
