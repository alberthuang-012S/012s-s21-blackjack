(function () {
  'use strict';
  const E = window.S21, T = window.S21Tutorial, $ = id => document.getElementById(id);
  const STORE = '012s-s21-tutorial-v1';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let progress = { version: T.VERSION, completed: [], lastLesson: 0, session: null };
  let session = null, open = false, previous = null, storageWorks = true, inspectCards = false, focusedOpponent = 1;
  const opponentPanel = window.S21OpponentPanel('tutorial-opponents');
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
    $('tutorial-start-label').textContent = '第一次玩？快速上手';
    $('tutorial-entry-note').textContent = '重點一頁看懂，也可選擇練習。';
  }
  function enter() {
    if (open) { showQuick(); return; }
    previous = { setup: $('setup').hidden, game: $('game').hidden, home: $('home-button').hidden, footer: $('save-status').textContent };
    window.dispatchEvent(new CustomEvent('s21:tutorial-visibility', { detail: { open: true } }));
    open = true; $('setup').hidden = true; $('game').hidden = true; $('home-button').hidden = true; $('tutorial').hidden = false;
    document.body.classList.add('tutorial-mode');
    $('tutorial-exit').textContent = previous.game ? '返回首頁' : '返回牌桌';
    $('tutorial-lesson-exit').textContent = previous.game ? '返回首頁' : '返回牌桌';
    showQuick();
  }
  function exit() {
    opponentPanel.close();
    if (!open) return;
    persist(); open = false; session = null; inspectCards = false; $('tutorial').hidden = true;
    $('setup').hidden = previous.setup; $('game').hidden = previous.game; $('home-button').hidden = previous.home;
    $('save-status').textContent = previous.footer;
    document.body.classList.remove('tutorial-mode');
    window.dispatchEvent(new CustomEvent('s21:tutorial-visibility', { detail: { open: false } }));
    $(previous.game ? 'tutorial-start' : 'tutorial-menu-button').focus({ preventScroll: true });
  }
  function showQuick() {
    if (session) persist(); session = null; inspectCards = false;
    $('tutorial-quick').hidden = false; $('tutorial-menu').hidden = true; $('tutorial-lesson').hidden = true;
    $('tutorial-go').textContent = previous.game ? '開始對戰 →' : '回到牌桌 →';
    $('save-status').textContent = previous.game ? '快速上手 · 選用練習不計分' : '正式牌局已暫停';
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('quick-title').focus({ preventScroll: true });
  }
  function showMenu() {
    if (session) persist(); session = null; inspectCards = false;
    $('tutorial-quick').hidden = true; $('tutorial-menu').hidden = false; $('tutorial-lesson').hidden = true;
    const count = new Set(progress.completed).size;
    $('tutorial-progress-label').textContent = `已完成 ${count} / 6 段`;
    $('tutorial-progress').value = count;
    const canResume = progress.session && !progress.session.completed;
    $('tutorial-resume').hidden = !canResume;
    if (canResume) $('tutorial-resume').textContent = `接著學第 ${progress.session.index + 1} 段 · ${T.LESSONS[progress.session.index].title} →`;
    $('tutorial-chapters').innerHTML = T.LESSONS.map((lesson, index) => `<button type="button" class="tutorial-chapter${progress.completed.includes(index) ? ' complete' : ''}" data-lesson="${index}"><span class="tutorial-chapter-number">${String(index + 1).padStart(2, '0')}</span><span class="tutorial-chapter-symbol" aria-hidden="true">${escape(lesson.symbol)}</span><strong>${escape(lesson.title)}</strong><small>${escape(lesson.summary)}</small><span class="tutorial-chapter-state">${progress.completed.includes(index) ? '已完成 ✓ · 可重玩' : '開始練習 →'}</span></button>`).join('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('tutorial-main-title').focus({ preventScroll: true });
    $('save-status').textContent = previous.game ? '教學不計分 · 進度會保留' : '正式牌局已暫停 · 教學不計分';
  }
  function startLesson(index, resume = false) {
    session = resume && progress.session ? T.Session.restore(progress.session) : new T.Session(index); inspectCards = false; focusedOpponent = 1;
    $('tutorial-quick').hidden = true; $('tutorial-menu').hidden = true; $('tutorial-lesson').hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    render(true);
  }
  function cardHTML(card, owner, index) {
    const hidden = card.hidden && owner !== 0, selectable = Boolean(session.copy.expected && session.game.targets().some(t => t.card.id === card.id));
    const canSelect = selectable && !inspectCards;
    const marked = session.selected.indexOf(card.id), source = session.game.state.pending?.sourceId === card.id;
    const expected = session.copy.expected?.includes(card.id);
    const artSrc = !hidden ? (window.S21_CARD_ART?.[card.id] || `assets/cards/${encodeURIComponent(card.id)}.webp`) : '';
    const classes = ['playing-card', artSrc ? 'art-card' : '', hidden ? 'card-back' : card.joker && !artSrc ? 'joker' : '', !hidden && ['♥', '♦'].includes(card.suit) ? 'red' : '',
      card.hidden && owner === 0 ? 'private' : '', card.used && card.joker ? 'used' : '', canSelect ? 'targetable' : '',
      marked >= 0 ? 'selected' : '', expected ? 'tutorial-suggested' : ''].filter(Boolean).join(' ');
    const tag = card.hidden ? owner === 0 ? '私有底牌' : '底牌' : source ? '發動中' : index === 0 ? '底牌已翻' : card.joker && card.used ? '已使用' : '';
    const corner = card.joker ? 'JOKER' : `${({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[card.rank] || card.rank}<span class="card-suit">${escape(card.suit)}</span>`;
    const inside = hidden ? '<span class="card-center">S</span><span class="card-bottom">底牌</span>' : artSrc ? `<img class="card-art" src="${artSrc}" alt="" draggable="false">${card.joker ? '<span class="joker-art-label">鬼牌 · 0點</span>' : ''}${tag ? `<span class="card-art-tag">${escape(tag)}</span>` : ''}` : `<span class="card-corner">${corner}</span><span class="card-center">${card.joker ? '鬼' : escape(card.suit)}</span><span class="card-bottom">${tag}</span>`;
    const name = `${owner === 0 ? '你' : `電腦 ${owner}`}的${hidden ? '底牌' : E.rankLabel(card)}${canSelect ? '，可選擇交換' : ''}`;
    if (canSelect) return `<button type="button" class="${classes}" data-tcard="${escape(card.id)}" data-selection="${marked + 1}" aria-label="${escape(name)}" aria-pressed="${marked >= 0}">${inside}</button>`;
    if (!hidden) return `<button type="button" class="${classes}" data-view-card="${escape(card.id)}" data-view-label="${escape(name)}" data-selection="${marked + 1}" aria-label="${escape(name)}，查看大圖">${inside}</button>`;
    return `<div class="${classes}" role="img" aria-label="${escape(name)}">${inside}</div>`;
  }
  function playerHTML(p) {
    const s = session.game.state, hidden = p.hand.some(c => c.hidden), mine = p.id === 0, final = Boolean(s.result), value = E.score(p.hand);
    const activeOwner = s.phase === 'swap' ? s.pending.owner : s.phase === 'turn' ? s.actor : s.phase === 'deal' ? (s.starter + s.dealStep % s.players.length) % s.players.length : -1;
    const active = p.id === activeOwner;
    const status = final ? s.result.winners.includes(p.id) ? '+1 分' : '本局 +0' : active && s.phase === 'swap' ? '鬼牌選擇' : p.stopped ? '已停牌' : active ? mine ? '輪到你' : '行動中' : '等待中';
    const heading = `<div class="player-heading"><span class="player-name">${escape(p.name)}<small>${mine ? 'YOUR HAND' : '教學對手'}</small></span><span class="hand-header-right">${mine ? `<span class="own-point" id="tutorial-own-point">${value.value}<small>最佳點數</small></span>` : ''}<span class="player-status">${status}</span></span></div>`;
    const visibleBase = p.hand.filter(c => !c.hidden).reduce((n, c) => n + (c.joker ? 0 : Math.min(c.rank, 10)), 0);
    const detail = mine ? `牌面合計 ${value.total}${value.total > 21 ? ` → 繞回 ${value.value} 點` : ''}` : final ? `最後點數 ${value.value}` : hidden ? `明牌基數 ${visibleBase} ＋底牌` : `公開點數 ${value.value}`;
    const meta = `<div class="player-meta"><span>${detail}</span><span>${p.hand.length} / 10 張</span></div>`;
    return `<article class="${mine ? 'human-hand' : 'opponent'}${!mine && p.id === focusedOpponent ? ' opponent-focused' : ''}${active ? ' active' : ''}${final && s.result.winners.includes(p.id) ? ' winner' : ''}" ${mine ? `id="tutorial-own-hand" data-hand-count="${p.hand.length}"` : `aria-label="${escape(p.name)}手牌"`}>${heading}<div class="cards">${p.hand.map((c, i) => cardHTML(c, p.id, i)).join('') || '<span class="tutorial-empty">等待輪流發牌</span>'}</div>${meta}</article>`;
  }
  function render(focus = false) {
    const c = session.copy, s = session.game.state, lesson = T.LESSONS[session.index];
    if (!c.expected || s.phase !== 'swap') inspectCards = false;
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
    $('tutorial-action-title').textContent = session.completed ? '練習完成' : inspectCards ? '查看牌面' : c.expected ? '鬼牌選擇' : '依照上方提示操作';
    $('tutorial-action-detail').textContent = inspectCards ? '點選牌面看大圖，選好的牌會保留。' : c.expected ? '選擇明牌，或直接選擇不換牌。' : '這是練習牌局，不會影響正式比分。';
    $('tutorial-opponents-hint').textContent = c.expected ? inspectCards ? '點選明牌可放大查看' : '依提示選擇明牌，可切換查看大圖' : '點選明牌可放大查看';
    const actionButton = a => `<button type="button" class="${a.kind === 'secondary' ? 'secondary-button' : 'primary-button'}" data-tutorial-action="${a.id}" ${a.id === 'swap' && session.selected.length !== 2 ? 'disabled' : ''}>${escape(a.id === 'swap' ? '確認交換' : a.label)}</button>`;
    const lessonActions = session.completed
      ? `<p class="tutorial-success">✓ 已完成第 ${session.index + 1} 段教學</p><button type="button" class="primary-button" data-tutorial-action="${session.index < 5 ? 'next-lesson' : 'exit'}">${session.index < 5 ? '前往下一段 →' : previous.game ? '返回設定 →' : '回原牌局試試 →'}</button><button type="button" class="secondary-button" data-tutorial-action="menu">查看所有教學</button>`
      : c.actions.map(actionButton).join('');
    const swapChoice = c.expected && s.phase === 'swap' && !session.completed;
    const swapAction = c.actions.find(a => a.id === 'swap'), skipAction = c.actions.find(a => a.id === 'skip-swap');
    $('tutorial-actions').innerHTML = inspectCards
      ? '<button type="button" class="primary-button" data-tutorial-ui="inspect-off">返回換牌</button>'
      : swapChoice && swapAction && skipAction
        ? `<button type="button" class="secondary-button" data-tutorial-ui="inspect">看大圖</button>${actionButton(skipAction)}<button type="button" class="secondary-button" data-tutorial-ui="clear" ${session.selected.length ? '' : 'disabled'}>重選</button>${actionButton(swapAction)}`
        : lessonActions;
    $('tutorial-scoreboard').innerHTML = s.players.map(p => `<div class="score-chip${p.id === 0 ? ' mine' : ''}"><strong>${escape(p.name)}</strong><span class="score-number">${p.score}<small>教學分數</small></span></div>`).join('');
    $('tutorial-board').dataset.focus = c.focus || '';
    $('tutorial-board').dataset.step = session.step;
    const opponents = s.players.slice(1);
    $('tutorial-opponent-tabs').style.setProperty('--opponents', opponents.length);
    $('tutorial-opponent-tabs').innerHTML = window.S21OpponentTabs(opponents, focusedOpponent, session.selected, 'data-tutorial-opponent');
    $('tutorial-opponents').innerHTML = opponents.map(playerHTML).join('');
    opponentPanel.update(window.S21OpponentTabs(opponents, focusedOpponent, session.selected, 'data-tutorial-panel-opponent'), $('tutorial-action-bar').innerHTML.replace(/\sid="[^"]*"/g, '').replaceAll('data-tutorial-action=', 'data-tutorial-panel-action=').replaceAll('data-tutorial-ui=', 'data-tutorial-panel-ui='), `電腦 ${focusedOpponent} · 完整手牌`);
    $('tutorial-hand-container').innerHTML = playerHTML(s.players[0]);
    $('tutorial-board-note').textContent = s.phase === 'settlement' || s.pending?.returnPhase === 'settlement' ? '已封盤 · 不可補牌' : s.phase === 'swap' ? '鬼牌立即決定換或不換' : s.result ? '此情境已結算 · 不計入正式比分' : '電腦已暫停 · 由你逐步操作';
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
  $('tutorial-practice').addEventListener('click', showMenu);
  $('tutorial-quick-back').addEventListener('click', showQuick);
  $('tutorial-go').addEventListener('click', () => {
    const fromSetup = previous.game;
    exit();
    if (fromSetup) $('setup-form').requestSubmit();
  });
  $('tutorial-exit').addEventListener('click', exit);
  $('tutorial-lesson-exit').addEventListener('click', exit);
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
    const opponent = event.target.closest('[data-tutorial-opponent],[data-tutorial-panel-opponent]');
    if (opponent && session) {
      focusedOpponent = Number(opponent.dataset.tutorialOpponent || opponent.dataset.tutorialPanelOpponent); render();
      opponentPanel.show();
      return;
    }
    const ui = event.target.closest('[data-tutorial-ui],[data-tutorial-panel-ui]');
    if (ui && session) {
      if (ui.disabled) return;
      const action = ui.dataset.tutorialUi || ui.dataset.tutorialPanelUi;
      if (action === 'clear') { session.selected = []; session.feedback = ''; }
      else inspectCards = action === 'inspect';
      render(); return;
    }
    const target = event.target.closest('[data-tcard]');
    if (target && session) { session.select(target.dataset.tcard); render(); return; }
    const button = event.target.closest('[data-tutorial-action],[data-tutorial-panel-action]');
    if (!button || button.disabled || !session) return;
    const action = button.dataset.tutorialAction || button.dataset.tutorialPanelAction;
    opponentPanel.close();
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
