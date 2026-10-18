/* ============================================================
   物理系统 + 陀螺状态模型
   ============================================================ */
import { ComponentTypes } from '../engine/registry.js';
import { clamp, inv, smooth, hexA, mixHex } from '../core/math.js';
import { Audio } from '../core/audio.js';

export const Systems = {};

Systems.gearMesh = {
    update(scene, dt, env) {
        const gears = scene.elements.filter(e => e.type === 'gear');
        if (!gears.length) return;
        for (const g of gears) { g._omega = 0; g._meshParent = null; }
        const driver = gears.find(g => g.isDriver);
        if (!driver) return;
        driver._omega = driver.speed;
        const queue = [driver];
        const visited = new Set([driver.id]);
        const tol = 20 * env.S;
        while (queue.length) {
            const g = queue.shift();
            const gr = env.MODULE * g.teeth / 2;
            for (const o of gears) {
                if (visited.has(o.id)) continue;
                const or = env.MODULE * o.teeth / 2;
                if (Math.abs(Math.hypot(o.x - g.x, o.y - g.y) - (gr + or)) > tol) continue;
                o._meshParent = g;
                o._omega = -g._omega * g.teeth / o.teeth;
                visited.add(o.id);
                queue.push(o);
                Audio.clack();
            }
        }
        for (const g of gears) g.angle += g._omega * dt;
    }
};

Systems.topSpin = {
    update(scene, dt, env) {
        for (const el of scene.elements) {
            if (el.type !== 'top') continue;
            const cfg = topConfig(el);
            if (el.startTime == null) {
                el._tau = 0; el._spinPhase = 0; el._vel = 1; el._tilt = 0; el._fallProgress = 0;
                continue;
            }
            const tau = Math.max(0, scene.time - el.startTime);
            const state = getTopState(tau, cfg);
            el._tau = tau;
            el._spinPhase = state.spinPhase;
            el._vel = state.vel;
            el._tilt = state.tilt;
            el._fallProgress = state.fallProgress;
        }
    }
};

/* ---------- 陀螺物理模型（builtin 的 render 与 topSpin 共用） ---------- */
export function topConfig(el) {
    const comFrac = clamp(el.comFrac, 0.1, 0.9);
    const tipType = el.tipType || 'sharp';
    const massDist = el.massDist || 'uniform';
    const comPenalty  = clamp((comFrac - 0.28) / 0.38, 0, 1) * 0.30;
    const tipPenalty  = tipType === 'flat' ? 0.24 : (tipType === 'round' ? 0.12 : 0);
    const massPenalty = massDist === 'center' ? 0.22 : (massDist === 'edge' ? 0 : 0.10);
    const decay = 0.14 + comPenalty + tipPenalty + massPenalty;
    const stableTime = clamp(16 - (decay - 0.14) * 20, 3.5, 16);
    return { decay, stableTime };
}
export function getTopState(tau, cfg) {
    if (tau <= 0) return { spinPhase: 0, vel: 1, tilt: 0, fallProgress: 0, elapsed: 0 };
    const spinPhase = (18 / cfg.decay) * (1 - Math.exp(-cfg.decay * tau));
    const vel = Math.exp(-cfg.decay * tau);
    const fallProgress = smooth(inv(tau, cfg.stableTime, cfg.stableTime + 1.6));
    const wobble = Math.sin(tau * 5.2) * 0.05 * (1 - fallProgress);
    const tilt = fallProgress * 1.15 + wobble;
    const elapsed = Math.min(tau, cfg.stableTime + 1.6);
    return { spinPhase, vel, tilt, fallProgress, elapsed };
}