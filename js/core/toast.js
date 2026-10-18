import { toastEl } from './dom.js';

export function showTip(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(showTip._t);
    showTip._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}
