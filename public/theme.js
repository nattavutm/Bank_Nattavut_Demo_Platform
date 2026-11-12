/* Load before CSS so the saved appearance is applied before first paint. */
(() => {
  const key = 'r5r5-theme';
  const root = document.documentElement;
  const valid = value => value === 'light' || value === 'dark';
  let mode = 'dark';
  try { const saved = localStorage.getItem(key); if (valid(saved)) mode = saved; } catch {}
  const embedded = window.parent !== window;
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const moon = '<path d="M20.7 13A9 9 0 0 1 11 3.3 9 9 0 1 0 20.7 13Z"/>';
  function renderButtons() {
    const target = mode === 'dark' ? 'Daylight' : 'Dark';
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      button.setAttribute('aria-label', 'Switch to ' + target + ' theme');
      button.setAttribute('title', 'Switch to ' + target + ' theme');
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (mode === 'dark' ? sun : moon) + '</svg><span>' + target + '</span>';
    }
  }
  function send(frame) {
    frame.contentWindow?.postMessage({ type: 'r5r5-theme', theme: mode }, location.origin);
  }
  function apply(value, persist = false) {
    if (!valid(value)) return;
    mode = value;
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = mode === 'dark' ? '#080808' : '#fafafa';
    if (persist) { try { localStorage.setItem(key, mode); } catch {} }
    renderButtons();
    if (!embedded) for (const frame of document.querySelectorAll('iframe.gateway-frame, iframe#gateway-frame')) send(frame);
  }
  apply(mode);
  addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(valid(event.newValue) ? event.newValue : 'dark');
  });
  // Also synchronise embedded views when browser storage is unavailable.
  addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (embedded && event.source === parent && event.data?.type === 'r5r5-theme') apply(event.data.theme);
    if (!embedded && event.data?.type === 'r5r5-theme-request') {
      const frame = [...document.querySelectorAll('iframe.gateway-frame, iframe#gateway-frame')].find(f => f.contentWindow === event.source);
      if (frame) send(frame);
    }
  });
  document.addEventListener('load', event => {
    if (!embedded && event.target.matches?.('iframe.gateway-frame, iframe#gateway-frame')) send(event.target);
  }, true);
  function mount() {
    if (!embedded && !document.querySelector('[data-theme-toggle]')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'theme-toggle'; button.setAttribute('data-theme-toggle', '');
      const toolbar = document.querySelector('.sidebar-signout');
      if (toolbar) toolbar.prepend(button);
      else { button.classList.add('theme-toggle-floating'); document.body.append(button); }
    }
    document.addEventListener('click', event => {
      if (event.target.closest('[data-theme-toggle]')) apply(mode === 'dark' ? 'light' : 'dark', true);
    });
    apply(mode);
    if (embedded) parent.postMessage({ type: 'r5r5-theme-request' }, location.origin);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
