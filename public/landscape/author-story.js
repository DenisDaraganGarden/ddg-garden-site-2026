'use strict';
(() => {
  const sheet = document.querySelector('#author');
  if (!sheet) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const play = sheet.querySelector('[data-author-play]');
  const frames = [...sheet.querySelectorAll('.author-frame')];
  // The fast passage stays on black. Changes of the whole background occur only
  // during the long rests, never in the rapid cuts.
  const beats = [
    {shot:'portrait', form:'cross', tone:'paper', hold:4000},
    {shot:'cross', form:'cross', tone:'paper', hold:2800},
    {shot:'portrait', form:'cut', tone:'ink', hold:900, turn:-4, shift:-2},
    {shot:'ram', form:'cut', tone:'ink', hold:800, turn:3, shift:1},
    {shot:'snake', form:'cut', tone:'ink', hold:600, turn:-5, shift:-1},
    {shot:'horse', form:'cut', tone:'ink', hold:700, turn:2, shift:2},
    {shot:'portrait', form:'cut', tone:'ink', hold:600, turn:-2, shift:-1},
    {shot:'snake', form:'cut', tone:'ink', hold:700, turn:-3, shift:1},
    {shot:'horse', form:'cut', tone:'ink', hold:600, turn:4, shift:-2},
    {shot:'portrait', form:'cut', tone:'ink', hold:650, turn:2, shift:1},
    {shot:'snake', form:'cut', tone:'ink', hold:600, turn:-4, shift:-1},
    {shot:'horse', form:'cut', tone:'ink', hold:1000, turn:1},
    {shot:'fire', form:'open', tone:'ink', hold:5500},
    {shot:'portrait', form:'cross', tone:'paper', hold:5500},
    {shot:'portrait', form:'square', tone:'ink', hold:2400},
    {shot:'portrait', form:'circle', tone:'ink', hold:3000},
    {shot:'portrait', form:'seal', tone:'ink', hold:9000},
  ];
  const names = {portrait:'Денис Дараган', cross:'Крест', ram:'Овен', snake:'Змея', horse:'Конь', fire:'Огонь'};
  let index = 0, remaining = beats[0].hold, startedAt = 0, timer = null;
  let active = false, ready = false, wanted = !reduce.matches;
  const duration = () => Math.max(beats[index].hold, reduce.matches ? 4000 : 0);
  const canRun = () => ready && active && wanted && !document.hidden && !document.querySelector('dialog[open]');
  const stopClock = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
    }
    sheet.dataset.playing = 'false';
  };
  const render = (announce = false) => {
    const beat = beats[index];
    Object.assign(sheet.dataset, {shot:beat.shot, form:beat.form, tone:beat.tone, cut:String(beat.form === 'cut'), beat:String(index)});
    sheet.style.setProperty('--turn', `${beat.turn || 0}deg`);
    sheet.style.setProperty('--skew', `${(beat.turn || 0) * .7}deg`);
    sheet.style.setProperty('--shift', `${beat.shift || 0}%`);
    frames.forEach(frame => frame.classList.toggle('is-visible', frame.dataset.shot === beat.shot));
    if (announce) sheet.querySelector('[data-author-status]').textContent = beat.form === 'seal' ? 'Уроборос. Монограмма Дениса Дарагана.' : names[beat.shot];
  };
  const sync = () => {
    if (!canRun()) stopClock();
    else if (timer === null) {
      sheet.dataset.playing = 'true';
      startedAt = performance.now();
      timer = setTimeout(() => {
        timer = null;
        index = (index + 1) % beats.length;
        remaining = duration();
        render();
        sync();
      }, remaining);
    }
    play.querySelector('span').textContent = wanted ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label', wanted ? 'Приостановить историю' : 'Воспроизвести историю');
    play.setAttribute('aria-pressed', String(wanted));
  };
  const inspect = next => {
    stopClock();
    index = (next + beats.length) % beats.length;
    wanted = false;
    remaining = duration();
    render(true);
    sync();
  };
  play.addEventListener('click', () => {wanted = !wanted; sync();});
  sheet.querySelector('[data-author-prev]').addEventListener('click', () => inspect(index - 1));
  sheet.querySelector('[data-author-next]').addEventListener('click', () => inspect(index + 1));
  sheet.addEventListener('author-step', event => inspect(index + event.detail));
  new IntersectionObserver(entries => {
    active = entries[0].isIntersecting && entries[0].intersectionRatio >= .6;
    sync();
  }, {threshold:[0,.6]}).observe(sheet);
  const dialogs = new MutationObserver(sync);
  document.querySelectorAll('dialog').forEach(dialog => dialogs.observe(dialog, {attributes:true, attributeFilter:['open']}));
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', stopClock);
  window.addEventListener('pageshow', sync);
  reduce.addEventListener('change', () => {
    if (reduce.matches) {wanted = false; stopClock();}
    remaining = duration();
    sync();
  });
  Promise.allSettled([...sheet.querySelectorAll('.author-art img')].map(img => img.decode())).then(() => {ready = true; sync();});
  render();
  sync();
})();

(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-study]').forEach(sheet => {
    const frames = [...sheet.querySelectorAll('.study-frame')];
    const play = sheet.querySelector('[data-study-play]');
    let index = 0, wanted = !reduce.matches, active = false, ready = false, timer = null;
    const stop = () => {clearTimeout(timer);timer = null;sheet.dataset.playing = 'false';};
    const show = (next, announce = false) => {
      index = (next + frames.length) % frames.length;
      sheet.dataset.frame = String(index);
      frames.forEach((frame, i) => {frame.classList.toggle('is-visible', i === index);frame.setAttribute('aria-hidden', String(i !== index));});
      if (announce) sheet.querySelector('[data-study-status]').textContent = frames[index].alt;
    };
    const sync = () => {
      const run = ready && wanted && active && !document.hidden && !document.querySelector('dialog[open]');
      if (!run) stop();
      else if (timer === null) {
        sheet.dataset.playing = 'true';
        timer = setTimeout(() => {timer = null;show(index + 1);sync();}, 8500);
      }
      play.textContent = wanted ? 'Ⅱ' : '▶';
      play.setAttribute('aria-label', wanted ? 'Приостановить последовательность' : 'Воспроизвести последовательность');
      play.setAttribute('aria-pressed', String(wanted));
    };
    const inspect = step => {stop();wanted = false;show(index + step, true);sync();};
    sheet.querySelector('[data-study-prev]').addEventListener('click', () => inspect(-1));
    sheet.querySelector('[data-study-next]').addEventListener('click', () => inspect(1));
    play.addEventListener('click', () => {wanted = !wanted;sync();});
    sheet.addEventListener('study-step', event => inspect(event.detail));
    new IntersectionObserver(entries => {active = entries[0].isIntersecting && entries[0].intersectionRatio >= .6;sync();}, {threshold:[0,.6]}).observe(sheet);
    const dialogs = new MutationObserver(sync);
    document.querySelectorAll('dialog').forEach(dialog => dialogs.observe(dialog, {attributes:true,attributeFilter:['open']}));
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', sync);
    reduce.addEventListener('change', () => {if (reduce.matches) wanted = false;sync();});
    Promise.allSettled(frames.map(img => img.decode())).then(() => {ready = true;sync();});
    show(0);
    sync();
  });
})();
