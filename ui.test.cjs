/* Offline browser integration checks. No packages or browsers are downloaded. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const runtime = createRequire(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json'));
const { chromium } = runtime('playwright');
const E = require('./engine.js');
const STORE = '012s-s21-game-v1', PREFS = '012s-s21-preferences-v1';
const bundle = path.join(__dirname, '..', 'outputs', 'S21點', 'S21點_單機版.html');
const url = pathToFileURL(bundle).href;
const artifacts = path.join(__dirname, '..', '.work', 's21-web');
fs.mkdirSync(artifacts, { recursive: true });
const errors = [];
const card = (rank, suit = '♠') => E.deck().find(c => c.rank === rank && c.suit === suit);
const joker = n => E.deck().find(c => c.id === `joker-${n}`);
function fixture(hands, extras = false) {
  const g = new E.Game({ opponents: hands.length - 1, extras }), used = new Set();
  g.state.players.forEach((p, i) => {
    p.hand = hands[i].map((c, ci) => { used.add(c.id); return { ...c, hidden: ci === 0, used: c.joker && ci !== 0 }; });
    p.stopped = false;
  });
  g.state.deck = E.deck().filter(c => !used.has(c.id)); g.state.phase = 'turn'; g.state.actor = 0;
  g.state.dealStep = hands.length * 2; g.state.result = null; g.state.pending = null;
  return g;
}
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORE); }
async function overflow(page, name) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name); }
async function open(browser, saved, viewport = { width: 1440, height: 1100 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ saved, STORE, PREFS }) => {
    localStorage.setItem(PREFS, JSON.stringify({ fast: true }));
    if (saved && !localStorage.getItem(STORE)) localStorage.setItem(STORE, JSON.stringify(saved));
  }, { saved, STORE, PREFS });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.evaluate(() => document.fonts.ready);
  return { context, page };
}
async function screenshot(page, name) {
  await overflow(page, name); await page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: true });
}
async function playMatch(page) {
  for (let i = 0; i < 1600; i++) {
    const saved = await state(page), s = saved.state;
    if (s.phase === 'matchOver') return saved;
    if (s.phase === 'roundOver') await page.locator('[data-action="next-round"]').click();
    else if (s.phase === 'swap' && s.pending.owner === 0) {
      const g = E.Game.restore(saved), pair = E.chooseSwap(g.view(0));
      for (const id of pair) await page.locator(`[data-card="${id}"]`).click();
      await page.locator('[data-action="swap"]').click();
    } else if (s.phase === 'turn' && s.actor === 0) {
      const g = E.Game.restore(saved), action = E.chooseDraw(g.view(0)) ? 'draw' : 'stop';
      await page.locator(`[data-action="${action}"]`).click();
    } else await page.waitForFunction(({ id, STORE }) => JSON.parse(localStorage.getItem(STORE)).state.eventId !== id, { id: s.eventId, STORE });
  }
  throw Error('Browser match did not finish');
}
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const { context, page } = await open(browser, null, { width, height: 1000 });
      await screenshot(page, `home-${width}`);
      await page.locator('#rules-button').click(); assert(await page.locator('#rules-dialog').isVisible());
      await page.keyboard.press('Escape'); assert(!await page.locator('#rules-dialog').isVisible());
      await page.locator('input[name="opponents"][value="4"]').check();
      await page.locator('input[name="target"][value="10"]').check();
      await page.locator('#extras').check(); await page.locator('.start-button').click();
      await page.waitForFunction(key => !!localStorage.getItem(key), STORE);
      const saved = await state(page); assert.equal(saved.config.opponents, 4); assert.equal(saved.config.target, 10); assert(saved.config.extras);
      await page.locator('#pause-button').click();
      await screenshot(page, `table-${width}`);
      await context.close();
    }
    // Largest hand layout and mandatory, human-controlled exchange.
    const numbers = E.deck().filter(c => !c.joker);
    const g = fixture([[...numbers.slice(0, 9), joker(0)], ...Array.from({ length: 4 }, (_, i) => numbers.slice(9 + i * 10, 19 + i * 10))]);
    g.state.players.slice(1).forEach(p => { p.stopped = true; });
    g.state.phase = 'swap'; g.state.pending = { owner: 0, sourceId: joker(0).id, returnPhase: 'turn', allowJoker: false };
    for (const width of [320, 390, 768, 1440]) {
      const { context, page } = await open(browser, g.save(), { width, height: 1100 });
      await page.locator('#resume-button').click();
      assert.equal(await page.locator('#opponents .opponent').count(), 4);
      assert.equal(await page.locator('.card-back').count(), 4);
      assert.equal(await page.locator('#human-hand .playing-card').count(), 10);
      assert(await page.locator('[data-action="swap"]').isDisabled());
      const targets = g.targets();
      await page.locator(`[data-card="${targets[0].card.id}"]`).click();
      await page.locator(`[data-card="${targets[targets.length - 1].card.id}"]`).click();
      assert(!(await page.locator('[data-action="swap"]').isDisabled()));
      await screenshot(page, `ten-cards-swap-${width}`);
      await page.reload(); await page.locator('#resume-button').click();
      assert.equal((await state(page)).state.phase, 'swap');
      assert.equal(await page.locator('.playing-card.selected').count(), 0);
      await page.locator(`[data-card="${targets[0].card.id}"]`).click();
      await page.locator(`[data-card="${targets[targets.length - 1].card.id}"]`).click();
      await page.locator('[data-action="swap"]').click();
      await page.waitForFunction(key => ['roundOver', 'matchOver'].includes(JSON.parse(localStorage.getItem(key)).state.phase), STORE);
      await screenshot(page, `result-${width}`); await context.close();
    }
    // Optional upgrade UI: normal card exchanges for an already-used public joker.
    const special = fixture([[card(2), joker(0), card(8), joker(1)], [card(3), joker(2), card(10)]], true);
    special.state.players[0].score = 4; special.state.phase = 'swap';
    special.state.pending = { owner: 0, sourceId: joker(1).id, returnPhase: 'turn', allowJoker: true };
    const { context: cx, page: sp } = await open(browser, special.save(), { width: 1440, height: 1000 });
    await sp.locator('#resume-button').click(); await sp.locator(`[data-card="${card(8).id}"]`).click();
    await sp.locator(`[data-card="${joker(2).id}"]`).click(); await sp.locator('[data-action="swap"]').click();
    assert.equal((await state(sp)).state.phase, 'matchOver');
    assert.equal((await state(sp)).state.result.kind, 'triple');
    await screenshot(sp, 'three-jokers-win'); await cx.close();
    // Actual dealing, computer decisions, user actions, consecutive rounds and full match.
    for (const opponents of [1, 4]) {
      const { context, page } = await open(browser, null, { width: 1440, height: 1100 });
      await page.locator(`input[name="opponents"][value="${opponents}"]`).check();
      await page.locator('#extras').check(); await page.locator('.start-button').click();
      const finished = await playMatch(page);
      assert(finished.state.result.matchWinners.length); assert(finished.state.players.some(p => p.score >= 5));
      await screenshot(page, `completed-${opponents}-opponents`);
      await page.locator('[data-action="new-match"]').click(); assert(await page.locator('#setup').isVisible());
      await context.close();
    }
    assert.deepEqual(errors, []); console.log('PASS: offline bundle, 1–4 opponents, 320–1440 px, full hands, swap selection, resume, three-joker victory, and full matches.');
    console.log('Screenshots: ' + artifacts);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
