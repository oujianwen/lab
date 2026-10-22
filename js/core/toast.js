/* ============================================================
   轻提示（Toast）模块
   ------------------------------------------------------------
   以非阻塞的小横幅向用户反馈操作结果（如“已添加”“导入失败”等），
   显示一段时间后自动消失。DOM 节点引用自 dom.js 的 toastEl，
   显隐与样式由 css/platform.css 中的 .toast / .show / .err 类控制，
   本模块只负责写入文案并管理定时器。
   ============================================================ */
import { toastEl } from './dom.js';

/* 显示一条轻提示。
   @param {string} msg   提示文案
   @param {boolean} isErr 是否为错误提示：为 true 时加 .err 类以红色警示样式呈现
   工作方式：
   1) 更新文案，并根据 isErr 切换 .err 类；
   2) 加 .show 类触发显示动画；
   3) 关键——先用 clearTimeout 清除上一条提示遗留的隐藏定时器，
      避免连续提示时旧的定时器提前把新提示关掉；
   4) 重新设定 2.4 秒后移除 .show 类使其自动淡出。
   注：showTip._t 是把定时器句柄挂在函数属性上，作为模块级私有状态复用。 */
export function showTip(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(showTip._t);
    showTip._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
}
