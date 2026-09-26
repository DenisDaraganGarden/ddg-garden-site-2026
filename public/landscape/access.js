'use strict';
(() => {
  const dialog = document.querySelector('#pdf-access');
  const form = dialog.querySelector('[data-pdf-form]');
  const input = form.querySelector('input');
  const submit = form.querySelector('[type=submit]');
  const status = form.querySelector('[role=status]');
  let ticket = 0, controller = null;
  const reset = () => {++ticket;controller?.abort();input.value = '';status.textContent = '';submit.disabled = false;input.removeAttribute('aria-invalid');};
  dialog.addEventListener('close', reset);
  window.addEventListener('pagehide', reset);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const password = input.value.trim();
    if (!password) {input.focus();return;}
    const current = ++ticket;
    controller = new AbortController();
    submit.disabled = true;
    input.removeAttribute('aria-invalid');
    status.textContent = 'Открываю…';
    let decrypting = false;
    try {
      if (!window.crypto?.subtle) throw new Error('secure-context');
      const response = await fetch('./portfolio.enc', {signal:controller.signal,cache:'no-store'});
      if (!response.ok) throw new Error('download');
      const payload = new Uint8Array(await response.arrayBuffer());
      if (payload.length < 56 || new TextDecoder().decode(payload.slice(0,8)) !== 'DDPDF001') throw new Error('format');
      const header = payload.slice(0,40), iterations = new DataView(header.buffer).getUint32(8);
      if (iterations !== 600000) throw new Error('format');
      const salt = header.slice(12,28), iv = header.slice(28,40);
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['decrypt']);
      decrypting = true;
      const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:header}, key, payload.slice(40));
      decrypting = false;
      if (current !== ticket || !dialog.open) return;
      const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Denis-Daragan-Landscape.pdf';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      input.value = '';
      status.textContent = 'Скачивание PDF началось.';
    } catch (error) {
      if (current !== ticket || error.name === 'AbortError') return;
      status.textContent = decrypting ? 'Пароль не подошёл. Попробуйте ещё раз.' : error.message === 'secure-context' ? 'Откройте сайт по защищённому адресу HTTPS.' : 'Не удалось получить PDF. Попробуйте ещё раз.';
      if (decrypting) {input.setAttribute('aria-invalid','true');input.select();}
    } finally {
      if (current === ticket) submit.disabled = false;
    }
  });
})();

(() => {
  const file = document.querySelector('[data-local-audio]');
  const audio = document.querySelector('[data-music-audio]');
  const status = document.querySelector('[data-music-status]');
  const toggle = document.querySelector('[data-sound-toggle]');
  const sync = () => {
    toggle.textContent = audio.paused ? 'Звук ▶' : 'Звук Ⅱ';
    toggle.setAttribute('aria-label', audio.paused ? 'Включить музыку' : 'Приостановить музыку');
    toggle.setAttribute('aria-pressed', String(!audio.paused));
  };
  toggle.addEventListener('click', () => {if (audio.paused) audio.play().catch(() => {});else audio.pause();});
  audio.addEventListener('play', sync);
  audio.addEventListener('pause', sync);
  let url = null;
  document.querySelector('[data-audio-file]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const source = file.files[0];
    if (!source) return;
    audio.pause();
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(source);
    audio.src = url;
    audio.hidden = false;
    toggle.hidden = false;
    document.body.classList.add('has-local-music');
    status.textContent = source.name;
    file.value = '';
    try {await audio.play();} catch {status.textContent = 'Нажмите воспроизведение. Если файл не открывается, выберите другой.';}
  });
  audio.addEventListener('error', () => {status.textContent = 'Не удалось воспроизвести файл. Выберите другой аудиофайл.';});
  document.addEventListener('visibilitychange', () => {if (document.hidden) audio.pause();});
  window.addEventListener('pagehide', () => audio.pause());
})();
