(function () {
  'use strict';
  const G = window.S21, $ = id => document.getElementById(id);
  const STORE = '012s-s21-game-v1', PREFS = '012s-s21-preferences-v1';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let game = null, saved = null, selected = [], paused = false, tutorialOpen = false, timer = null, revision = 0, lastAnnounced = '';
  let preferences = { fast: false }, saveWorks = true;
  try { preferences = { ...preferences, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch (_) { /* Storage is optional. */ }
  $('fast-mode').checked = Boolean(preferences.fast);
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const restored = G.Game.restore(JSON.parse(raw)); saved = restored.save(); }
  } catch (_) { $('save-status').textContent = '舊存檔無法讀取，可以重新開桌。'; }
  function updateResume() {
    $('resume-button').hidden = !saved;
    if (saved) $('resume-button').innerHTML = `${saved.state.phase === 'matchOver' ? '查看上一場結果' : '繼續上次的牌局'} <span>↗</span>`;
  }
  updateResume();
  function save() {
    if (!game) return;
    saved = game.save();
    try { localStorage.setItem(STORE, JSON.stringify(saved)); saveWorks = true; }
    catch (_) { saveWorks = false; }
    $('save-status').textContent = saveWorks ? '已自動儲存在此瀏覽器' : '此瀏覽器未開放存檔，仍可正常遊玩';
  }
  function clearTimer() { revision++; if (timer) clearTimeout(timer); timer = null; }
  function activeOwner() {
    const s = game.state;
    if (s.phase === 'swap') return s.pending.owner;
    if (s.phase === 'turn') return s.actor;
    if (s.phase === 'deal') return (s.starter + s.dealStep % s.players.length) % s.players.length;
    return -1;
  }
  function automatic() {
    if (!game || paused || tutorialOpen || $('game').hidden || document.hidden || $('rules-dialog').open || $('restart-dialog').open) return false;
    const s = game.state;
    return ['deal', 'settlement'].includes(s.phase) || s.phase === 'turn' && s.actor !== 0 || s.phase === 'swap' && s.pending.owner !== 0;
  }
  function schedule() {
    clearTimer();
    if (!automatic()) return;
    const token = revision, phase = game.state.phase;
    const delay = preferences.fast ? (phase === 'deal' ? 70 : 130) : phase === 'deal' ? 230 : phase === 'settlement' ? 950 : 750;
    timer = setTimeout(() => {
      if (token !== revision || !automatic()) return;
      try {
        const s = game.state;
        if (['deal', 'settlement'].includes(s.phase)) game.step();
        else if (s.phase === 'swap') {
          const pair = G.chooseSwap(game.view(s.pending.owner));
          game.swap(pair[0], pair[1]);
        } else if (s.phase === 'turn') {
          if (G.chooseDraw(game.view(s.actor))) game.draw(); else game.stop();
        }
        selected = []; render();
      } catch (error) { fail(error); }
    }, delay);
  }
  function fail(error) {
    paused = true; clearTimer();
    $('phase-title').textContent = '牌局已暫停';
    $('phase-description').textContent = '可以重新整理頁面讀取存檔，或重新設定牌局。';
    $('save-status').textContent = `無法繼續：${error.message}`;
    $('pause-button').textContent = '繼續';
    console.error(error);
  }
  function start(config, existing) {
    clearTimer();
    game = existing || new G.Game(config); paused = false; selected = [];
    $('setup').hidden = true; $('game').hidden = false; $('home-button').hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' }); render();
  }
  function returnHome() {
    clearTimer(); paused = false; selected = [];
    $('setup').hidden = false; $('game').hidden = true; $('home-button').hidden = true;
    if (game) {
      const form = $('setup-form');
      form.elements.opponents.value = String(game.config.opponents);
      form.elements.target.value = String(game.config.target); form.elements.extras.checked = game.config.extras;
    }
    updateResume(); $('hero-title').focus?.(); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function status(p) {
    const s = game.state;
    if (s.result) return s.result.winners.includes(p.id) ? '+1 分' : '本局 +0';
    if (activeOwner() === p.id && s.phase === 'swap') return '鬼牌換牌';
    if (p.stopped) return p.hand.length >= 10 ? '滿 10 張' : '已停牌';
    if (activeOwner() === p.id) return s.phase === 'deal' ? '抽牌中' : p.human ? '輪到你' : '思考中';
    return '等待中';
  }
  function cardHTML(card, owner, index, legalIds) {
    const s = game.state, mine = owner === 0;
    const concealed = card.hidden && !mine, isPrivate = card.hidden && mine;
    const selecting = s.phase === 'swap' && s.pending.owner === 0;
    const canSelect = selecting && legalIds.has(card.id), selection = selected.indexOf(card.id);
    const classes = ['playing-card', concealed ? 'card-back' : card.joker ? 'joker' : '',
      !concealed && ['♥', '♦'].includes(card.suit) ? 'red' : '', isPrivate ? 'private' : '',
      card.joker && card.used && !concealed ? 'used' : '', canSelect ? 'targetable' : '',
      selection >= 0 ? 'selected' : '', selecting && !canSelect ? 'ineligible' : ''].filter(Boolean).join(' ');
    const pendingSource = s.pending?.sourceId === card.id;
    const tag = concealed ? '底牌' : isPrivate ? '私有底牌' : pendingSource ? '發動中' : index === 0 ? '底牌' : card.joker && card.used ? '已使用' : '';
    const display = concealed ? '底牌' : G.rankLabel(card);
    const label = `${game.state.players[owner].name}的${isPrivate ? '私有底牌 ' : ''}${display}${canSelect ? '，可選擇交換' : ''}`;
    const corner = card.joker ? 'JOKER' : `${({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[card.rank] || card.rank}<span class="card-suit">${escape(card.suit)}</span>`;
    const content = concealed ? '<span class="card-center">S</span><span class="card-bottom">底牌</span>' : `<span class="card-corner">${corner}</span><span class="card-center">${card.joker ? '鬼' : escape(card.suit)}</span><span class="card-bottom">${tag}</span>`;
    if (canSelect) return `<button type="button" class="${classes}" data-card="${escape(card.id)}" data-selection="${selection + 1}" aria-label="${escape(label)}" aria-pressed="${selection >= 0}">${content}</button>`;
    return `<div class="${classes}" role="img" aria-label="${escape(label)}">${content}</div>`;
  }
  function playerHTML(p, mine, legalIds) {
    const s = game.state, active = activeOwner() === p.id, winner = s.result?.winners.includes(p.id);
    const value = G.score(p.hand), visible = p.hand.filter(c => !c.hidden);
    const base = visible.reduce((n, c) => n + (c.joker ? 0 : Math.min(c.rank, 10)), 0);
    const heading = `<div class="player-heading"><span class="player-name">${escape(p.name)}<small>${mine ? 'YOUR HAND' : escape(p.style)}</small></span><span class="hand-header-right">${mine ? `<span class="own-point">${value.value}<small>目前最佳點數</small></span>` : ''}<span class="player-status">${status(p)}</span></span></div>`;
    const scoreText = mine ? `牌面合計 ${value.total}${value.total > 21 ? ` → 繞回 ${value.value} 點` : ''}${value.aces ? ` · ${value.highAces} 張 A 算 11` : ''}` : s.result ? `<span class="final-point">${value.value}<small> 點</small></span>` : p.hand.some(c => c.hidden) ? `明牌基數 ${base} ＋底牌` : `公開點數 ${value.value}`;
    const meta = `<div class="player-meta"><span>${scoreText}</span><span>${p.hand.length} / 10 張${mine && !s.result ? ' · 底牌只有你可見' : ''}</span></div>`;
    if (mine) {
      $('human-hand').className = `human-hand${active ? ' active' : ''}${winner ? ' winner' : ''}`;
      return `${heading}<div class="cards">${p.hand.map((c, i) => cardHTML(c, p.id, i, legalIds)).join('')}</div>${meta}`;
    }
    return `<article class="opponent${active ? ' active' : ''}${winner ? ' winner' : ''}" aria-label="${escape(p.name)}手牌">${heading}<div class="cards">${p.hand.map((c, i) => cardHTML(c, p.id, i, legalIds)).join('')}</div>${meta}</article>`;
  }
  function phaseCopy() {
    const s = game.state, actor = s.players[activeOwner()];
    if (s.result) {
      if (s.phase === 'matchOver') return ['MATCH COMPLETE', '這場較量，有了答案。', '所有底牌已翻開，可以查看最後一局的牌面。'];
      return ['ROUND COMPLETE', '這一手，塵埃落定。', '下一局將全部重洗，累積分數保留。'];
    }
    if (paused) return ['PAUSED', '先歇一手。', '按「繼續」回到目前的抽牌或換牌階段。'];
    if (s.phase === 'deal') return ['DEALING', s.dealStep < s.players.length ? '第一圈，先抽底牌。' : '第二圈，明牌上桌。', `${actor.name}依序抽一張，鬼牌會立即處理。`];
    if (s.phase === 'swap') return [s.pending.allowJoker ? 'JOKER UPGRADE' : 'JOKER EXCHANGE', actor.human ? '選兩張明牌，改寫局勢。' : `${actor.name}正在選擇換牌。`, s.pending.returnPhase === 'settlement' ? '封盤換牌：其餘底牌仍蓋住，完成後不能補牌。' : s.pending.allowJoker ? '第二鬼升級：可選其他公開鬼牌，底牌仍不可交換。' : '可以交換任意兩人的明牌，底牌與鬼牌不能交換。'];
    if (s.phase === 'settlement') return ['TABLE SEALED', '封盤。先看鬼牌，再看底牌。', s.settlementStage === 'revealJokers' ? '所有人已停牌，先同時翻出底牌鬼牌。' : '底牌鬼牌已處理，準備比較最後點數。'];
    return ['YOUR NEXT MOVE', actor.human ? '這一手，繼續還是收手？' : `${actor.name}正在考慮下一手。`, actor.human ? '加一張，也可能繞回。停牌後仍可能被換牌。' : `${actor.style}風格 · 只看自己的底牌與場上明牌。`];
  }
  function actionHTML() {
    const s = game.state;
    if (s.result) return `<div class="action-copy"><strong>${s.phase === 'matchOver' ? '整場已結束' : '準備下一局？'}</strong><small>${s.phase === 'matchOver' ? '可以重新選擇對手人數與規則。' : `下一局由${s.players[(s.starter + 1) % s.players.length].name}先抽牌。`}</small></div><div class="action-buttons"><button type="button" class="primary-button" data-action="${s.phase === 'matchOver' ? 'new-match' : 'next-round'}">${s.phase === 'matchOver' ? '再開一桌 →' : '下一局 →'}</button></div>`;
    if (paused) return '<div class="action-copy"><strong>牌局已暫停</strong><small>目前進度已保留，按繼續再出發。</small></div><div class="action-buttons"><button class="primary-button" data-action="resume" type="button">繼續牌局</button></div>';
    if (s.phase === 'swap' && s.pending.owner === 0) {
      const lookup = game.targets();
      const names = selected.map(id => { const t = lookup.find(t => t.card.id === id); return `${s.players[t.owner].name} ${G.rankLabel(t.card)}`; });
      return `<div class="action-copy"><strong>立即換牌 · 已選 ${selected.length} / 2 張</strong><small>點選牌面選擇，選過的牌可再點一次取消。</small>${names.length ? `<div class="selection-chips">${escape(names.join(' ↔ '))}</div>` : ''}</div><div class="action-buttons"><button type="button" class="secondary-button" data-action="clear" ${!selected.length ? 'disabled' : ''}>重選</button><button type="button" class="primary-button" data-action="swap" ${selected.length !== 2 ? 'disabled' : ''}>確認交換 ↔</button></div>`;
    }
    if (s.phase === 'turn' && s.actor === 0) return `<div class="action-copy"><strong>輪到你 · 最佳 ${G.score(s.players[0].hand).value} 點</strong><small>還能抽 ${10 - s.players[0].hand.length} 張；每回合只抽一張。</small></div><div class="action-buttons"><button type="button" class="secondary-button" data-action="stop">停牌</button><button type="button" class="primary-button draw-button" data-action="draw">加一張 ＋</button></div>`;
    const who = activeOwner() >= 0 ? s.players[activeOwner()].name : '';
    return `<div class="action-copy"><strong><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>${s.phase === 'settlement' ? '正在處理封盤結算' : s.phase === 'deal' ? '每人依序抽一張牌' : `${escape(who)}的回合`}</strong><small>你的底牌不會公開給電腦。可以展開下方牌桌紀錄。</small></div><div class="action-buttons"><button type="button" class="secondary-button" data-action="pause">暫停</button></div>`;
  }
  function render() {
    if (!game) return;
    const s = game.state;
    const focusedCard = document.activeElement?.dataset.card;
    $('round-number').textContent = s.round;
    $('match-mode').textContent = `先得 ${game.config.target} 分${game.config.extras ? ' · 三鬼規則開啟' : ' · 基本規則'}`;
    $('scoreboard').style.setProperty('--players', s.players.length);
    $('scoreboard').innerHTML = s.players.map(p => `<div class="score-chip${p.human ? ' mine' : ''}"><strong>${escape(p.name)}<small>${p.human ? 'YOU' : escape(p.style)}</small></strong><span class="score-number">${p.score}<small>/ ${game.config.target}</small></span></div>`).join('');
    const legalIds = new Set(game.targets().map(t => t.card.id));
    selected = selected.filter(id => legalIds.has(id));
    $('opponents').style.setProperty('--opponents', game.config.opponents);
    $('opponents').innerHTML = s.players.slice(1).map(p => playerHTML(p, false, legalIds)).join('');
    $('human-hand').innerHTML = playerHTML(s.players[0], true, legalIds);
    $('deck-count').textContent = `牌庫 ${s.deck.length} 張`;
    $('table-label').textContent = s.result ? '本局已結束' : s.phase === 'settlement' || s.pending?.returnPhase === 'settlement' ? '已封盤 · 不能加牌' : '輪流抽牌 · 最多 10 張';
    const [eyebrow, title, description] = phaseCopy();
    $('phase-eyebrow').textContent = eyebrow; $('phase-title').textContent = title; $('phase-description').textContent = description;
    $('pause-button').textContent = paused ? '繼續' : '暫停'; $('pause-button').disabled = Boolean(s.result);
    $('action-bar').innerHTML = actionHTML();
    $('result-panel').hidden = !s.result;
    if (s.result) {
      const result = s.result, match = result.matchWinners.length > 0;
      const names = (match ? result.matchWinners : result.winners).map(id => s.players[id].name).join('、');
      const heading = `${names}${match ? result.matchWinners.length > 1 ? '並列整場獲勝' : '贏得整場！' : result.kind === 'triple' ? '三鬼勝利！' : result.winners.length > 1 ? '並列贏得本局' : '贏得本局'}`;
      $('result-panel').innerHTML = `<div><p class="eyebrow">${match ? 'MATCH WINNER' : 'ROUND RESULT'}</p><h2>${escape(heading)}</h2><p>${result.kind === 'triple' ? '集齊三鬼，獨得 1 分；其餘玩家本局不加分。' : '最高點者各加 1 分，不比較持牌張數。'}${match ? ` 已達 ${game.config.target} 分門檻。` : ''}</p></div>`;
    }
    const events = s.events.slice(-18).reverse();
    $('events').innerHTML = events.map(e => `<li>${escape(e.message)}</li>`).join('');
    $('latest-event').textContent = events[0]?.message || '';
    const announcement = `${title} ${description}`;
    if (announcement !== lastAnnounced) { $('announcer').textContent = announcement; lastAnnounced = announcement; }
    if (focusedCard) document.querySelector(`[data-card="${CSS.escape(focusedCard)}"]`)?.focus({ preventScroll: true });
    save(); schedule();
  }
  $('setup-form').addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget;
    start({ opponents: Number(form.elements.opponents.value), target: Number(form.elements.target.value), extras: form.elements.extras.checked });
  });
  $('resume-button').addEventListener('click', () => { if (saved) start(null, G.Game.restore(saved)); });
  document.addEventListener('click', event => {
    const card = event.target.closest('[data-card]');
    if (card && game?.state.phase === 'swap' && game.state.pending.owner === 0 && !paused) {
      const id = card.dataset.card;
      if (selected.includes(id)) selected = selected.filter(c => c !== id);
      else if (selected.length < 2) selected.push(id);
      render(); return;
    }
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled || !game) return;
    try {
      const action = button.dataset.action;
      if (action === 'draw') game.draw();
      else if (action === 'stop') game.stop();
      else if (action === 'swap') { game.swap(selected[0], selected[1]); selected = []; }
      else if (action === 'clear') selected = [];
      else if (action === 'pause' || action === 'resume') paused = action === 'pause';
      else if (action === 'next-round') { selected = []; game.nextRound(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (action === 'new-match') { returnHome(); return; }
      render();
    } catch (error) { fail(error); }
  });
  $('pause-button').addEventListener('click', () => { paused = !paused; render(); });
  $('fast-mode').addEventListener('change', event => {
    preferences.fast = event.target.checked;
    try { localStorage.setItem(PREFS, JSON.stringify(preferences)); } catch (_) { /* Preferences are optional. */ }
    if (game) schedule();
  });
  $('rules-button').addEventListener('click', () => { clearTimer(); $('rules-dialog').showModal(); });
  function closeRules() { $('rules-dialog').close(); }
  $('close-rules').addEventListener('click', closeRules); $('understood-button').addEventListener('click', closeRules);
  $('rules-dialog').addEventListener('close', () => schedule());
  function requestHome(event) {
    event?.preventDefault();
    if ($('game').hidden) return;
    if (game.state.phase === 'matchOver') returnHome();
    else { clearTimer(); $('restart-dialog').showModal(); }
  }
  $('home-button').addEventListener('click', requestHome); $('brand').addEventListener('click', requestHome);
  $('cancel-restart').addEventListener('click', () => $('restart-dialog').close());
  $('confirm-restart').addEventListener('click', () => { $('restart-dialog').close(); returnHome(); });
  $('restart-dialog').addEventListener('close', () => { if (!$('game').hidden) schedule(); });
  document.addEventListener('visibilitychange', () => { clearTimer(); if (!document.hidden && game && !$('game').hidden) schedule(); });
  window.addEventListener('s21:tutorial-visibility', event => {
    tutorialOpen = event.detail.open;
    clearTimer();
    if (!tutorialOpen && game && !$('game').hidden) schedule();
  });
  window.addEventListener('beforeunload', () => { if (game) save(); });
})();
