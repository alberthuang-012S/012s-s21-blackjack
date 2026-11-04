const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const deps = createRequire(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json'));
const { chromium } = deps('playwright');
const E = require('./engine.js');
const T = require('./tutorial-model.js');
const GAME = '012s-s21-game-v1', TUTORIAL = '012s-s21-tutorial-v1';
const url = pathToFileURL(path.join(__dirname, '..', 'outputs', 'S21點', 'S21點_單機版.html')).href;
const out = path.join(__dirname, '..', '.work', 's21-tutorial'); fs.mkdirSync(out, { recursive: true });
const errors = [];
async function open(browser, width = 1440, saved = null) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ saved, GAME }) => {
    localStorage.setItem('012s-s21-preferences-v1', JSON.stringify({ fast: false }));
    if (saved && !localStorage.getItem(GAME)) localStorage.setItem(GAME, JSON.stringify(saved));
  }, { saved, GAME });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); return { context, page };
}
async function data(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), TUTORIAL); }
async function act(page, action) { await page.locator(`[data-tutorial-action="${action}"]`).click(); }
async function shot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' horizontal overflow');
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
}
async function swap(page) {
  for (const id of ['3-7', '3-10']) await page.locator(`[data-tcard="${id}"]`).click();
  await act(page, 'swap');
}
async function finishChapter(page) {
  await act(page, 'finish'); assert.equal((await data(page)).session.completed, true);
  assert(await page.locator('.tutorial-success').isVisible());
}
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    // Entire six-chapter learning path, including interactive wrong-answer recovery.
    const { context, page } = await open(browser);
    await page.locator('#tutorial-start').click(); await shot(page, 'menu-desktop');
    assert.equal(await page.locator('[data-lesson]').count(), 6);
    await page.locator('[data-lesson="0"]').click();
    await act(page, 'deal-bottom'); assert.equal(await page.locator('#tutorial-opponents .card-back').count(), 2);
    await act(page, 'deal-open'); assert.equal((await data(page)).session.game.state.players[0].hand.length, 2);
    await shot(page, 'lesson-1-private-cards'); await finishChapter(page);
    await act(page, 'next-lesson'); await act(page, 'draw');
    assert.equal(E.score((await data(page)).session.game.state.players[0].hand).value, 4);
    await shot(page, 'lesson-2-wrap'); await finishChapter(page);
    await act(page, 'next-lesson'); await act(page, 'ace-1'); assert(await page.locator('#tutorial-feedback').isVisible());
    assert.equal((await data(page)).session.step, 'start');
    await act(page, 'ace-11'); await act(page, 'multiple-aces'); await act(page, 'aces-high');
    assert.equal((await data(page)).session.step, 'multiple'); await act(page, 'aces-mixed');
    await shot(page, 'lesson-3-aces'); await finishChapter(page);
    await act(page, 'next-lesson'); await act(page, 'draw-joker');
    assert(await page.locator('[data-tutorial-action="swap"]').isDisabled());
    await page.locator('[data-tcard="0-9"]').click(); await page.locator('[data-tcard="2-5"]').click();
    await act(page, 'swap'); assert(await page.locator('#tutorial-feedback').isVisible());
    // Clear those choices, then choose the requested targets.
    await page.locator('[data-tcard="0-9"]').click(); await page.locator('[data-tcard="2-5"]').click();
    await page.locator('[data-tcard="3-7"]').click();
    await page.reload(); assert(await page.locator('#setup').isVisible());
    await page.locator('#tutorial-start').click(); await page.locator('#tutorial-resume').click();
    assert.equal((await data(page)).session.step, 'select');
    assert.equal(await page.locator('#tutorial .playing-card.selected').count(), 1);
    await page.locator('[data-tcard="3-10"]').click(); await shot(page, 'lesson-4-swap');
    await act(page, 'swap'); await finishChapter(page);
    await act(page, 'next-lesson'); await act(page, 'stop'); await act(page, 'watch-swap');
    assert.equal((await data(page)).session.game.state.actor, 0);
    assert.equal((await data(page)).session.game.state.players[0].stopped, false);
    await shot(page, 'lesson-5-reopened'); await act(page, 'draw-again'); await finishChapter(page);
    await act(page, 'next-lesson'); await act(page, 'reveal-joker');
    assert.equal(await page.locator('#tutorial-opponents .card-back').count(), 2);
    await swap(page); assert.equal(await page.locator('[data-tutorial-action="draw"]').count(), 0);
    await act(page, 'reveal-all'); await shot(page, 'lesson-6-tied-score');
    assert.deepEqual((await data(page)).session.game.state.players.map(p => p.score), [0, 1, 1]);
    await act(page, 'cancel-example'); assert.equal((await data(page)).session.game.state.pending, null);
    await finishChapter(page); assert.equal((await data(page)).completed.length, 6);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), GAME), null, 'Training never creates a formal score save.');
    await act(page, 'menu'); assert.equal(await page.locator('.tutorial-chapter.complete').count(), 6);
    await page.locator('[data-lesson="4"]').click(); await page.locator('#tutorial-replay').click();
    assert.equal((await data(page)).session.step, 'start');
    await page.locator('#tutorial-skip').click(); assert.equal((await data(page)).session.index, 5);
    await page.locator('#tutorial-exit').click(); assert(await page.locator('#setup').isVisible());
    await page.reload(); assert.equal(await page.locator('#tutorial-start-label').textContent(), '重玩引導教學');
    await context.close();
    // Small screens: controls and actual target cards remain usable without overflow.
    for (const width of [320, 390, 768]) {
      const { context, page } = await open(browser, width);
      await page.locator('#tutorial-start').click(); await shot(page, `menu-${width}`);
      await page.locator('[data-lesson="3"]').click(); await act(page, 'draw-joker');
      await page.locator('[data-tcard="3-7"]').click(); await page.locator('[data-tcard="3-10"]').click();
      await shot(page, `exchange-${width}`); await act(page, 'swap'); await finishChapter(page);
      await act(page, 'menu'); await page.locator('[data-lesson="5"]').click();
      await act(page, 'reveal-joker'); await swap(page); await act(page, 'reveal-all');
      await shot(page, `settlement-${width}`); await context.close();
    }
    // Opening training from a live CPU turn freezes the exact match and resumes it on exit.
    const formal = new T.Session(1).game; formal.state.actor = 1; formal.state.players[0].score = 2;
    const live = await open(browser, 1440, formal.save());
    await live.page.locator('#resume-button').click(); await live.page.locator('#tutorial-menu-button').click();
    const frozen = await live.page.evaluate(key => localStorage.getItem(key), GAME);
    await live.page.locator('[data-lesson="1"]').click(); await act(live.page, 'draw');
    await live.page.waitForTimeout(1100);
    assert.equal(await live.page.evaluate(key => localStorage.getItem(key), GAME), frozen, 'The original CPU never progresses during training.');
    await live.page.locator('#tutorial-exit').click(); assert(await live.page.locator('#game').isVisible());
    await live.page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).state.eventId !== id, { key: GAME, id: JSON.parse(frozen).state.eventId });
    assert.equal((await live.page.evaluate(key => JSON.parse(localStorage.getItem(key)), GAME)).state.players[0].score, 2);
    await live.context.close();
    assert.deepEqual(errors, []);
    console.log('PASS: six playable lessons, wrong answers, resume mid-swap, replay/skip, 320–1440 px, and isolated/preserved live match.');
    console.log('Screenshots: ' + out);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
