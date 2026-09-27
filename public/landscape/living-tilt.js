'use strict';
(() => {
  const orientation = window.DeviceOrientationEvent;
  const mobile = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const available = mobile && window.isSecureContext && !!orientation;
  const clients = new Set();
  const point = {x: 0, y: 0};
  let enabled = false, pending = false, listening = false, pageActive = true;
  let baseline = null, timeout = 0, requester = null;
  const radians = Math.PI / 180;
  const clamp = value => Math.max(-1, Math.min(1, value));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // DeviceOrientation uses intrinsic Z-X-Y rotations. Comparing screen normals
  // in the initial device basis avoids Euler wrap/jumps when held upright.
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
  function center() {
    baseline = null;
    point.x = point.y = 0;
  }
  function onOrientation(event) {
    if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    clearTimeout(timeout);
    const current = basis(event);
    if (!baseline) baseline = current;
    const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * radians;
    const x = dot(current.normal, baseline.x), y = -dot(current.normal, baseline.y);
    const range = Math.sin(18 * radians);
    point.x = clamp((x * Math.cos(angle) + y * Math.sin(angle)) / range);
    point.y = clamp((-x * Math.sin(angle) + y * Math.cos(angle)) / range);
  }
  function paint() {
    for (const client of clients) {
      client.button.hidden = !available || !client.shown;
      client.button.disabled = pending;
      client.button.textContent = pending ? 'Наклон…' : enabled ? 'Наклон ✓' : 'Наклон';
      client.button.setAttribute('aria-pressed', String(enabled));
      client.button.setAttribute('aria-label', enabled ? 'Выключить управление наклоном' : 'Управлять наклоном телефона');
      client.status.hidden = !client.shown || !client.status.textContent;
    }
  }
  function reconcile() {
    const shouldListen = enabled && pageActive && !document.hidden
      && [...clients].some(client => client.active);
    if (shouldListen !== listening) {
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
          if (requester) requester.status.textContent = 'Датчик наклона недоступен';
          reconcile();
        }, 4000);
      } else {
        window.removeEventListener('deviceorientation', onOrientation);
        window.removeEventListener('orientationchange', center);
        screen.orientation?.removeEventListener('change', center);
      }
    }
    paint();
  }
  async function toggle(client) {
    if (pending || !available) return;
    for (const item of clients) item.status.textContent = '';
    if (enabled) {
      enabled = false;
      reconcile();
      return;
    }
    requester = client;
    pending = true;
    paint();
    try {
      // Invoke directly inside the click; iOS requires transient user activation.
      // Relative orientation needs no compass/magnetometer or motion stream.
      const result = typeof orientation.requestPermission === 'function'
        ? await orientation.requestPermission() : 'granted';
      if (result === 'granted') {
        enabled = true;
        client.onEnable();
      } else client.status.textContent = 'Доступ к наклону закрыт';
    } catch {
      client.status.textContent = 'Наклон недоступен';
    }
    pending = false;
    reconcile();
  }

  window.LivingTilt = {
    attach(container, {className = '', onEnable}) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tilt-toggle ' + className;
      const status = document.createElement('span');
      status.className = 'tilt-status ' + className;
      status.setAttribute('role', 'status');
      const client = {button, status, onEnable, shown: false, active: false};
      clients.add(client);
      container.append(button, status);
      button.addEventListener('click', () => toggle(client));
      paint();
      return {
        update(active, shown = true) {
          client.active = active;
          client.shown = shown;
          reconcile();
        },
        read() { return enabled && listening && baseline && client.active ? point : null; },
      };
    },
  };
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pagehide', () => {pageActive = false; reconcile();});
  window.addEventListener('pageshow', () => {pageActive = true; reconcile();});
})();
