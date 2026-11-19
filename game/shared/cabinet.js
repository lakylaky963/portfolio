// Shared cabinet chrome: a still render of the hub's neon city behind every game page.
// One frame only (redrawn on resize / theme change), so it costs nothing while you play.
import { startBackground } from '../hub/bg.js?v=20261120';

const root = document.documentElement;
const c = document.createElement('canvas');
c.className = 'cab-city';
c.setAttribute('aria-hidden', 'true');
document.body.prepend(c);
root.classList.add('cab');
const bg = startBackground(c, { still: true });
new MutationObserver(() => bg.refresh()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

// Menu screens use the same render as a CSS background image (--cab-city).
let url = '', timer = 0;
function snap() {
  c.toBlob((b) => {
    if (!b) return;
    const next = URL.createObjectURL(b);
    root.style.setProperty('--cab-city', `url("${next}")`);
    if (url) URL.revokeObjectURL(url);
    url = next;
  }, 'image/jpeg', 0.82);
}
snap();
const later = () => { clearTimeout(timer); timer = setTimeout(snap, 250); };
addEventListener('resize', later);
new MutationObserver(later).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
