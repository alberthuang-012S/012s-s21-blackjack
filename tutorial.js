(function () {
  'use strict';
  const E = window.S21, T = window.S21Tutorial, $ = id => document.getElementById(id);
  const STORE = '012s-s21-tutorial-v1';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let progress = { version: T.VERSION, completed: [], lastLesson: 0, session: null };
  let session = null, open = false, previous = null, storageWorks = true;
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (data?.version === T.VERSION && Array.isArray(data.completed)) {
      progress = { ...progress, ...data, completed: data.completed.filter(n => Number.isInteger(n) && n >= 0 && n < 6) };
      if (progress.session) T.Session.restore(progress.session);
    }
  } catch (_) { progress = { version: T.VERSION, completed: [], lastLesson: 0, session: null }; }
  function persist() {
    if (session) { progress.session = session.save(); progress.lastLesson = session.index; }
    try { localStorage.setItem(STORE, JSON.stringify(progress)); storageWorks = true; } catch (_) { storageWorks = false; }
    updateEntry();
  }
  function updateEntry() {
    const count = new Set(progress.completed).size;
    $('tutorial-start-label').textContent = count === 6 ? '重玩引導教學' : progress.session ? `繼續教學 · 已完成 ${count}/6` : '第一次玩？開始教學';
    $('tutorial-entry-note').textContent = count === 6 ? '六段已完成，也能隨時重玩單一情境。' : '固定牌面，邊玩邊學；不計入正式比分。';
  }
  function enter() {
    if (open) { showMenu(); return; }
    previous = { setup: $('setup').hidden, game: $('game').hidden, home: $('home-button').hidden, footer: $('save-status').textContent };
    window.dispatchEvent(new CustomEvent('s21:tutorial-visibility', { detail: { open: true } }));
    open = true; $('setup').hidden = true; $('game').hidden = true; $('home-button').hidden = true; $('tutorial').hidden = false;
    document.body.classList.add('tutorial-mode');
    $('tutorial-exit').textContent = previous.game ? '返回首頁' : '返回牌桌';
    showMenu(); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function exit() {
    if (!open) return;
    persist(); open = false; session = null; $('tutorial').hidden = true;
    $('setup').hidden = previous.setup; $('game').hidden = previous.game; $('home-button').hidden = previous.home;
    $('save-status').textContent = previous.footer;
    document.body.classList.remove('tutorial-mode');
    window.dispatchEvent(new CustomEvent('s21:tutorial-visibility', { detail: { open: false } }));
    $(previous.game ? 'tutorial-start' : 'tutorial-menu-button').focus({ preventScroll: true });
  }
  function showMenu() {
    if (session) persist(); session = null;
    $('tutorial-menu').hidden = false; $('tutorial-lesson').hidden = true;
    const count = new Set(progress.completed).size;
    $('tutorial-progress-label').textContent = `已完成 ${count} / 6 段`;
    $('tutorial-progress').value = count;
    const canResume = progress.session && !progress.session.completed;
    $('tutorial-resume').hidden = !canResume;
    if (canResume) $('tutorial-resume').textContent = `接著學第 ${progress.session.index + 1} 段 · ${T.LESSONS[progress.session.index].title} →`;
    $('tutorial-chapters').innerHTML = T.LESSONS.map((lesson, index) => `<button type="button" class="tutorial-chapter${progress.completed.includes(index) ? ' complete' : ''}" data-lesson="${index}"><span class="tutorial-chapter-number">${String(index + 1).padStart(2, '0')}</span><span class="tutorial-chapter-symbol" aria-hidden="true">${escape(lesson.symbol)}</span><strong>${escape(lesson.title)}</strong><small>${escape(lesson.summary)}</small><span class="tutorial-chapter-state">${progress.completed.includes(index) ? '已完成 ✓ · 可重玩' : '開始練習 →'}</span></button>`).join('');
    $('tutorial-main-title').focus({ preventScroll: true });
    $('save-status').textContent = previous.game ? '教學不計分 · 進度會保留' : '正式牌局已暫停 · 教學不計分';
  }
  function startLesson(index, resume = false) {
    session = resume && progress.session ? T.Session.restore(progress.session) : new T.Session(index);
    $('tutorial-menu').hidden = true; $('tutorial-lesson').hidden = false;
    render(true);
  }
  function cardHTML(card, owner, index) {
    const hidden = card.hidden && owner !== 0, canSelect = session.copy.expected && session.game.targets().some(t => t.card.id === card.id);
    const marked = session.selected.indexOf(card.id), source = session.game.state.pending?.sourceId === card.id;
    const expected = session.copy.expected?.includes(card.id);
    const classes = ['playing-card', hidden ? 'card-back' : card.joker ? 'joker' : '', !hidden && ['♥', '♦'].includes(card.suit) ? 'red' : '',
      card.hidden && owner === 0 ? 'private' : '', card.used && card.joker ? 'used' : '', canSelect ? 'targetable' : '',
      marked >= 0 ? 'selected' : '', expected ? 'tutorial-suggested' : ''].filter(Boolean).join(' ');
    const tag = card.hidden ? owner === 0 ? '私有底牌' : '底牌' : source ? '發動中' : index === 0 ? '底牌已翻' : card.joker && card.used ? '已使用' : '明牌';
    const corner = card.joker ? 'JOKER' : `${({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[card.rank] || card.rank}<span class="card-suit">${escape(card.suit)}</span>`;
    const inside = hidden ? '<span class="card-center">S</span><span class="card-bottom">底牌</span>' : `<span class="card-corner">${corner}</span><span class="card-center">${card.joker ? '鬼' : escape(card.suit)}</span><span class="card-bottom">${tag}</span>`;
    const name = `${owner === 0 ? '你' : `電腦 ${owner}`}的${hidden ? '底牌' : E.rankLabel(card)}${canSelect ? '，可選擇交換' : ''}`;
    return canSelect ? `<button type="button" class="${classes}" data-tcard="${escape(card.id)}" data-selection="${marked + 1}" aria-label="${escape(name)}" aria-pressed="${marked >= 0}">${inside}</button>` : `<div class="${classes}" role="img" aria-label="${escape(name)}">${inside}</div>`;
  }
  function playerHTML(p) {
    const hidden = p.hand.some(c => c.hidden), mine = p.id === 0, final = Boolean(session.game.state.result), value = E.score(p.hand);
    const status = final ? session.game.state.result.winners.includes(p.id) ? '+1 分' : '+0 分' : p.stopped ? '已停牌' : session.game.state.pending?.owner === p.id ? '鬼牌發動' : '等待教學操作';
    const heading = `<div class="player-heading"><span class="player-name">${escape(p.name)}<small>${mine ? 'YOUR HAND' : '教學對手'}</small></span><span class="hand-header-right">${mine ? `<span class="own-point" id="tutorial-own-point">${value.value}<small>最佳點數</small></span>` : ''}<span class="player-status">${status}</span></span></div>`;
    const detail = mine ? `牌面合計 ${value.total}${value.total > 21 ? ` → 繞回 ${value.value} 點` : ''}` : hidden ? '底牌保持蓋住' : `最後點數 ${value.value}`;
    const meta = `<div class="player-meta"><span>${detail}</span><span>${p.hand.length} / 10 張</span></div>`;
    return `<article class="${mine ? 'human-hand' : 'opponent'}${final && session.game.state.result.winners.includes(p.id) ? ' winner' : ''}" ${mine ? 'id="tutorial-own-hand"' : ''}>${heading}<div class="cards">${p.hand.map((c, i) => cardHTML(c, p.id, i)).join('') || '<span class="tutorial-empty">等待輪流發牌</span>'}</div>${meta}</article>`;
  }
  function render(focus = false) {
    const c = session.copy, s = session.game.state, lesson = T.LESSONS[session.index];
    const focused = document.activeElement?.dataset.tcard;
    $('tutorial-lesson-number').textContent = `第 ${session.index + 1} / 6 段`;
    $('tutorial-lesson-title').textContent = lesson.title;
    $('tutorial-instructions').textContent = session.completed ? '這一段，學會了。' : c.title;
    $('tutorial-description').textContent = c.body;
    $('tutorial-feedback').textContent = session.feedback;
    $('tutorial-feedback').hidden = !session.feedback;
    $('tutorial-equation').hidden = !c.equation;
    $('tutorial-equation').innerHTML = (c.equation || []).map(part => `<span>${escape(part)}</span>`).join('');
    $('tutorial-selection').hidden = !c.expected;
    $('tutorial-selection').textContent = `已選 ${session.selected.length} / 2 張${session.selected.length ? ' · ' + session.selected.map(id => E.rankLabel(session.game.targets().find(t => t.card.id === id).card)).join(' ↔ ') : ''}`;
    $('tutorial-actions').innerHTML = session.completed
      ? `<p class="tutorial-success">✓ 已完成第 ${session.index + 1} 段教學</p><button type="button" class="primary-button" data-tutorial-action="${session.index < 5 ? 'next-lesson' : 'exit'}">${session.index < 5 ? '前往下一段 →' : previous.game ? '直接開桌 →' : '回原牌局試試 →'}</button><button type="button" class="secondary-button" data-tutorial-action="menu">查看所有教學</button>`
      : c.actions.map(a => `<button type="button" class="${a.kind === 'secondary' ? 'secondary-button' : 'primary-button'}" data-tutorial-action="${a.id}" ${a.id === 'swap' && session.selected.length !== 2 ? 'disabled' : ''}>${escape(a.label)}</button>`).join('');
    $('tutorial-scoreboard').innerHTML = s.players.map(p => `<div class="score-chip${p.id === 0 ? ' mine' : ''}"><strong>${escape(p.name)}</strong><span class="score-number">${p.score}<small>教學分數</small></span></div>`).join('');
    $('tutorial-board').dataset.focus = c.focus || '';
    $('tutorial-board').dataset.step = session.step;
    $('tutorial-opponents').innerHTML = s.players.slice(1).map(playerHTML).join('');
    $('tutorial-hand-container').innerHTML = playerHTML(s.players[0]);
    $('tutorial-board-note').textContent = s.phase === 'settlement' || s.pending?.returnPhase === 'settlement' ? '已封盤 · 不可補牌' : s.phase === 'swap' ? '鬼牌必須立即處理' : s.result ? '此情境已結算 · 不計入正式比分' : '電腦已暫停 · 由你逐步操作';
    $('tutorial-log').textContent = s.events.at(-1)?.message || '教學牌面已準備好。';
    progress.session = session.save(); progress.lastLesson = session.index;
    if (session.completed && !progress.completed.includes(session.index)) progress.completed.push(session.index);
    persist();
    $('save-status').textContent = storageWorks ? '教學進度已儲存 · 正式比分不受影響' : '教學可正常進行 · 此瀏覽器未開放進度儲存';
    if (focused) document.querySelector(`[data-tcard="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    else if (focus) $('tutorial-instructions').focus({ preventScroll: true });
  }
  $('tutorial-start').addEventListener('click', enter);
  $('tutorial-menu-button').addEventListener('click', enter);
  $('tutorial-exit').addEventListener('click', exit);
  $('tutorial-all').addEventListener('click', showMenu);
  $('tutorial-resume').addEventListener('click', () => startLesson(progress.lastLesson, true));
  $('tutorial-replay').addEventListener('click', () => startLesson(session.index));
  $('tutorial-skip').addEventListener('click', () => {
    persist();
    if (session.index < 5) startLesson(session.index + 1);
    else { showMenu(); $('tutorial-progress-label').textContent += ' · 尚未完成的情境可隨時補學'; }
  });
  $('tutorial').addEventListener('click', event => {
    const chapter = event.target.closest('[data-lesson]');
    if (chapter) { startLesson(Number(chapter.dataset.lesson)); return; }
    const target = event.target.closest('[data-tcard]');
    if (target && session) { session.select(target.dataset.tcard); render(); return; }
    const button = event.target.closest('[data-tutorial-action]');
    if (!button || button.disabled || !session) return;
    const action = button.dataset.tutorialAction;
    if (action === 'next-lesson') { startLesson(session.index + 1); return; }
    if (action === 'menu') { showMenu(); return; }
    if (action === 'exit') { exit(); return; }
    session.act(action); render(true);
  });
  // The logo returns to the original view, without opening the game's restart dialog.
  $('brand').addEventListener('click', event => { if (open) { event.preventDefault(); exit(); } });
  window.addEventListener('beforeunload', () => { if (open) persist(); });
  updateEntry();
})();
