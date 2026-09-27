'use strict';
(() => {
  const orientation = window.DeviceOrientationEvent;
  const mobile = matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const available = mobile && window.isSecureContext && !!orientation;
  const clients = new Set();
  const point = {x: 0, y: 0};
  let motion = false, enabled = false, granted = false, pending = false;
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
        reconcile();
      }, 4000);
    } else {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('orientationchange', center);
      screen.orientation?.removeEventListener('change', center);
    }
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'motion-choice';
  dialog.setAttribute('aria-labelledby', 'motion-choice-title');
  dialog.setAttribute('aria-describedby', 'motion-choice-description');
  dialog.innerHTML = `<span class="motion-signature">Denis Daragan</span>
    <div class="motion-choice-copy"><h2 id="motion-choice-title">Живые<br>изображения.</h2>
    <p id="motion-choice-description"></p><div class="motion-choice-actions">
    <button data-motion-enable>Включить</button><button data-motion-skip>Без эффекта</button>
    </div></div>`;
  dialog.querySelector('p').textContent = available
    ? 'Наклоняйте телефон — сад отзовётся.'
    : mobile ? 'Прикосновение добавляет глубину.' : 'Движение курсора добавляет глубину.';
  const accept = dialog.querySelector('[data-motion-enable]');
  const skip = dialog.querySelector('[data-motion-skip]');
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'motion-settings';
  settings.textContent = 'Эффекты';
  settings.setAttribute('aria-haspopup', 'dialog');
  const status = document.createElement('p');
  status.className = 'motion-status';
  status.setAttribute('role', 'status');
  const menu = document.querySelector('#menu-panel');
  menu.querySelector('.menu-primary').append(settings);
  menu.append(status);
  document.body.append(dialog);

  function choose(withMotion, withTilt = false) {
    ++ticket;
    motion = withMotion;
    enabled = withTilt;
    pending = false;
    accept.disabled = false;
    accept.textContent = 'Включить';
    dialog.close();
    for (const client of clients) client.onChange();
    reconcile();
    document.querySelector('.folio').focus({preventScroll:true});
  }
  accept.addEventListener('click', async () => {
    if (pending) return;
    const current = ++ticket;
    pending = true;
    accept.disabled = true;
    accept.textContent = 'Включаем…';
    status.textContent = '';
    let withTilt = false;
    try {
      // Keep the native request directly in this click, before any await.
      if (available) {
        const result = granted || typeof orientation.requestPermission !== 'function'
          ? 'granted' : await orientation.requestPermission();
        if (current !== ticket) return;
        withTilt = result === 'granted';
        granted = withTilt;
        if (!withTilt) status.textContent = 'Доступ к наклону закрыт. Можно управлять касанием.';
      }
    } catch {
      status.textContent = 'Наклон недоступен. Можно управлять касанием.';
    }
    if (current === ticket) choose(true, withTilt);
  });
  skip.addEventListener('click', () => choose(false));
  dialog.addEventListener('cancel', event => {event.preventDefault(); choose(false);});
  settings.addEventListener('click', () => {menu.close(); dialog.showModal();});

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
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
    if (event.matches) choose(false);
  });
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pagehide', () => {pageActive = false; reconcile();});
  window.addEventListener('pageshow', () => {pageActive = true; reconcile();});
  // One choice on entry; paging and fullscreen views reuse it without controls.
  dialog.showModal();
})();
