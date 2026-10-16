/* 56.6.8 - tangible section markers. Decoration and short, interruptible flex.
 * These controls remain native buttons; only the inner fabric bends.
 * No duplicate text, polling, cloned controls, audio, or navigation delay. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pending = new Map();
  const selector = '.rules-tab[data-bookmark],.entity-tab[data-bookmark]';
  const still = () => reduced.matches || document.hidden;

  function part(name) {
    const el = document.createElement('span');
    el.className = name;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  function mount(button) {
    if (!button || button.dataset.bookmark) return;
    const label = document.createElement('span');
    label.className = 'bookmark-label';
    label.append(...button.childNodes);
    const body = document.createElement('span');
    body.className = 'bookmark-body';
    const front = document.createElement('span');
    front.className = 'bookmark-front';
    front.append(part('bookmark-fold'), part('bookmark-stitches'), label,
      part('bookmark-root'));
    body.append(part('bookmark-backing'), front);
    button.append(part('bookmark-shadow'), body);
    button.dataset.bookmark = button.classList.contains('rules-tab') ? 'index' : 'ribbon';
  }
  function cancel(button) {
    const group = pending.get(button);
    if (group) {
      pending.delete(button);
      group.forEach(animation => animation.cancel());
    }
    button.removeAttribute('data-bookmark-held');
  }
  function release(button) {
    if (!button?.isConnected) return;
    button.removeAttribute('data-bookmark-held');
  }
  function flex(button) {
    cancel(button);
    if (still() || !button?.animate || !button.closest('dialog[open]')) return;
    const front = button.querySelector('.bookmark-front');
    const shadow = button.querySelector('.bookmark-shadow');
    // The themed bookmarks are already die-cut paper. Give the whole painted
    // face (including its DOM label) one restrained tap-and-release motion.
    // Animated *translate/rotate* on the face are independent of the selected
    // bookmark's CSS transform, so active-state changes never cancel the tap.
    if (button.dataset.bookmark === 'ribbon') {
      if (!front) return;
      const group = [];
      try {
        const main = front.animate([
          {translate:'0 0',rotate:'0deg',offset:0},
          {translate:'0 -4px',rotate:'-.7deg',offset:.33},
          {translate:'0 1px',rotate:'.28deg',offset:.72},
          {translate:'0 0',rotate:'0deg',offset:1}
        ],{duration:380,easing:'cubic-bezier(.22,.68,.22,1)'});
        main.finished.catch(()=>{});
        group.push(main);
        pending.set(button,group);
        main.finished.catch(()=>{}).then(()=>{
          if(pending.get(button)===group){pending.delete(button);group.forEach(a=>a.cancel());}
        });
      } catch (_) {group.forEach(a=>a.cancel());}
      return;
    }
    const side = button.dataset.bookmark === 'index' && matchMedia('(min-width:761px)').matches;
    const axis = side ? 'Y' : 'X';
    const group = [];
    const play = (el, frames) => {
      const animation = el.animate(frames, {
        duration:440, easing:'cubic-bezier(.2,.65,.25,1)'
      });
      animation.finished.catch(() => {});
      group.push(animation);
      return animation;
    };
    try {
      const main = play(front, [
        {transform:`rotate${axis}(0deg)`},
        {transform:`rotate${axis}(${side ? -19 : 21}deg)`, offset:.28},
        {transform:`rotate${axis}(${side ? 5 : -5}deg)`, offset:.66},
        {transform:`rotate${axis}(0deg)`}
      ]);
      play(shadow, [{opacity:.5}, {opacity:.9,offset:.3}, {opacity:.6}]);
      pending.set(button,group);
      main.finished.catch(() => {}).then(() => {
        if (pending.get(button) === group) {
          pending.delete(button);
          group.forEach(animation => animation.cancel());
        }
      });
    } catch (_) {
      group.forEach(animation => animation.cancel());
    }
  }
  function target(event) {
    const el = event.target instanceof Element ? event.target.closest(selector) : null;
    return el && !el.disabled && !el.closest('[inert],[data-motion="closing"]') ? el : null;
  }
  let held = null;
  document.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    const el = target(event);
    if (!el) return;
    cancel(el); held = el;
    if (!still()) el.dataset.bookmarkHeld = 'true';
  }, {passive:true});
  for (const type of ['pointerup','pointercancel']) {
    document.addEventListener(type, () => {release(held);held=null;}, {passive:true});
  }
  document.addEventListener('click', event => {
    const el = target(event);
    if (el) flex(el);
  });
  function settle() {
    release(held);held=null;
    for (const button of pending.keys()) cancel(button);
  }
  document.addEventListener('close', event => {
    if (!(event.target instanceof HTMLDialogElement)) return;
    for (const button of pending.keys()) if (event.target.contains(button)) cancel(button);
  }, true);
  document.addEventListener('visibilitychange', () => {if(document.hidden)settle();});
  window.addEventListener('pagehide', settle);
  window.addEventListener('blur', () => {release(held);held=null;});
  reduced.addEventListener?.('change', () => {if(reduced.matches)settle();});
  window.ExorcistBookmarks = Object.freeze({mount});
})();
