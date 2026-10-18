/* ---------- 音效 ---------- */
export const Audio = {
    ctx: null,
    init() {
        if (!this.ctx) {
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
    },
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
    grab()  { this.beep(620, 0.06, 0.05, 'triangle'); },
    drop()  { this.beep(420, 0.07, 0.05, 'triangle'); },
    clack() { this.beep(880, 0.06, 0.08, 'square'); this.beep(660, 0.10, 0.05, 'triangle', 0.04); },
    click() { this.beep(520, 0.06, 0.05, 'triangle'); },
    add()   { this.beep(660, 0.05, 0.05, 'sine'); this.beep(880, 0.08, 0.05, 'sine', 0.05); },
    spin()  { this.beep(440, 0.10, 0.05, 'sawtooth'); this.beep(660, 0.15, 0.05, 'sawtooth', 0.08); }
};
