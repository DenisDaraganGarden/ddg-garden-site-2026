// Одна протяжка манипулятора — один шаг Undo. Нужен сервер редактора
// (песочница 41213 или UNDO_URL); профиль браузера свежий, черновик сцены не трогается.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.UNDO_URL || 'http://127.0.0.1:41213';
const KEY = 'ddg_home_scene_settings_v1';
const browser = await chromium.launch({ headless: true, args: process.env.PLANT_GPU_BACKEND === 'metal' ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${origin}/home/edit`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ouroborosControls && document.querySelector('[data-testid^="focus-domain-"]'));

    // Растения → Стриженые формы → первый объект → «Перенос» (G).
    const domains = await page.$$eval('[data-testid^="focus-domain-"]', (els) => els.map((e) => e.dataset.testid));
    await page.click(`[data-testid="${domains.find((d) => /green|plant/i.test(d)) ?? domains[1]}"]`);
    await page.getByRole('button', { name: /Стриженые формы|Clipped shapes/i }).first().click();
    const picked = await page.evaluate(() => {
        const select = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => /Выбрать|Select/.test(o.textContent)));
        const option = select && [...select.options].find((o) => o.value);
        if (!option) return null;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option.value;
    });
    assert.ok(picked, 'нет стриженой формы для выбора');
    await page.keyboard.press('g');
    await page.waitForFunction(() => window.__ouroborosGizmo?.controls && window.__ouroborosGizmo?.proxy);
    await page.waitForTimeout(500);

    const readX = () => page.evaluate(([key, id]) => (JSON.parse(localStorage.getItem(key) || 'null')?.topiaryObjects ?? []).find((o) => o.id === id)?.x ?? null, [KEY, picked]);
    const x0 = await readX();
    assert.equal(typeof x0, 'number', 'координата формы не прочиталась из черновика');

    // Протяжка ручками без мыши: 20 движений по 5 см в одном захвате.
    await page.evaluate(async () => {
        const { controls, proxy } = window.__ouroborosGizmo;
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        controls.dispatchEvent({ type: 'dragging-changed', value: true }); await frame();
        for (let i = 0; i < 20; i += 1) { proxy.position.x += 0.05; controls.dispatchEvent({ type: 'objectChange' }); await frame(); }
        controls.dispatchEvent({ type: 'dragging-changed', value: false }); await frame();
    });
    await page.waitForTimeout(400);
    const x1 = await readX();
    assert.ok(Math.abs(x1 - x0 - 1) < 0.02, `протяжка не сдвинула форму на 1 м: ${x0} → ${x1}`);

    let steps = 0, x = x1;
    while (steps < 30 && Math.abs(x - x0) > 1e-6) { await page.keyboard.press('Meta+z'); await page.waitForTimeout(120); x = await readX(); steps += 1; }
    const report = { object: picked, x0, x1, undoStepsToRestore: steps, undoEnabledAfter: await page.$eval('[data-testid="focus-undo"]', (b) => !b.disabled), errors };
    console.log(JSON.stringify(report));
    assert.deepEqual(errors, []);
    assert.equal(steps, 1, 'протяжка должна отменяться одним шагом');
    assert.equal(report.undoEnabledAfter, false, 'после отмены протяжки стек должен быть пуст');
} finally {
    await browser.close();
}
