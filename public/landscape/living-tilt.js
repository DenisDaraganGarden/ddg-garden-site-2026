'use strict';
(() => {
  const orientation = window.DeviceOrientationEvent;
  const mobile = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const available = mobile && window.isSecureContext && !!orientation;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const clients = new Set();
  const point = {x: 0, y: 0};
  let motion = !reduce.matches, enabled = false, granted = false, pending = false;
  let listening = false, pageActive = true, baseline = null, timeout = 0, ticket = 0;
  const radians = Math.PI / 180;
  const clamp = value => Math.max(-1, Math.min(1, value));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // Compare screen normals in the initial device basis, avoiding Euler wrap.
  function basis(event) {
    const a = (Number.isFinite(event.alpha) ? event.alpha : 0) * radians;
    const b = event.beta * radians, g = event.gamma * radians;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);
    return {
      x: [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg],
      y: [-sa * cb, ca * cb, sb],
      normal: [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg],
    };
  }
  function center() { baseline = null; point.x = point.y = 0; }
  function onOrientation(event) {
    if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    clearTimeout(timeout);
    const current = basis(event);
    if (!baseline) baseline = current;
    const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * radians;
    const x = dot(current.normal, baseline.x), y = -dot(current.normal, baseline.y);
    const range = Math.sin(12 * radians);
    point.x = clamp((x * Math.cos(angle) + y * Math.sin(angle)) / range);
    point.y = clamp((-x * Math.sin(angle) + y * Math.cos(angle)) / range);
  }
  function reconcile() {
    const shouldListen = motion && enabled && pageActive && !document.hidden
      && [...clients].some(client => client.active);
    if (shouldListen === listening) return;
    listening = shouldListen;
    center();
    clearTimeout(timeout);
    if (listening) {
      window.addEventListener('deviceorientation', onOrientation, {passive: true});
      window.addEventListener('orientationchange', center, {passive: true});
      screen.orientation?.addEventListener('change', center);
      timeout = setTimeout(() => {
        if (baseline) return;
        enabled = false;
        status.textContent = 'Наклон недоступен. Изображения откликаются на касание.';
        controls();
        reconcile();
      }, 4000);
    } else {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('orientationchange', center);
      screen.orientation?.removeEventListener('change', center);
    }
  }

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'motion-settings';
  settings.textContent = 'Эффекты';
  settings.setAttribute('aria-pressed', String(motion));
  const tiltSettings = available ? document.createElement('button') : null;
  if (tiltSettings) {
    tiltSettings.type = 'button';
    tiltSettings.className = 'motion-settings';
    tiltSettings.textContent = 'Наклон телефона';
    tiltSettings.setAttribute('aria-pressed', 'false');
  }
  const status = document.createElement('p');
  status.className = 'motion-status';
  status.setAttribute('role', 'status');
  const menu = document.querySelector('#menu-panel');
  menu.querySelector('.menu-primary').append(settings);
  if (tiltSettings) menu.querySelector('.menu-primary').append(tiltSettings);
  menu.append(status);

  function controls() {
    settings.setAttribute('aria-pressed', String(motion));
    settings.disabled = reduce.matches;
    if (tiltSettings) {
      tiltSettings.setAttribute('aria-pressed', String(enabled));
      tiltSettings.disabled = pending || reduce.matches;
    }
  }
  function setMotion(value) {
    ++ticket;
    motion = value && !reduce.matches;
    if (!motion) enabled = false;
    controls();
    for (const client of clients) client.onChange();
    reconcile();
  }
  settings.addEventListener('click', () => setMotion(!motion));
  tiltSettings?.addEventListener('click', async () => {
    if (pending || reduce.matches) return;
    if (enabled) {
      enabled = false;
      controls();
      return reconcile();
    }
    const current = ++ticket;
    pending = true;
    controls();
    status.textContent = '';
    try {
      // Keep the native request directly in this click, before any await.
      const result = granted || typeof orientation.requestPermission !== 'function'
        ? 'granted' : await orientation.requestPermission();
      if (current !== ticket) return;
      enabled = granted = result === 'granted';
      if (enabled) {
        motion = true;
        for (const client of clients) client.onChange();
      } else {
        status.textContent = 'Доступ к наклону закрыт. Можно управлять касанием.';
      }
    } catch {
      status.textContent = 'Наклон недоступен. Можно управлять касанием.';
    } finally {
      pending = false;
      controls();
      reconcile();
    }
  });

  window.LivingTilt = {
    get motion() { return motion; },
    attach(_container, {onChange}) {
      const client = {onChange, active:false};
      clients.add(client);
      return {
        update(active) { client.active = active; reconcile(); },
        read() { return enabled && listening && baseline && client.active ? point : null; },
      };
    },
  };
  reduce.addEventListener('change', event => {
    if (event.matches) setMotion(false);
    controls();
  });
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pagehide', () => {pageActive = false; reconcile();});
  window.addEventListener('pageshow', () => {pageActive = true; reconcile();});
  controls();
})();
