/* 012S S21 點 — dependency-free rules engine and information-limited opponents. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S21 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const SUITS = ['♠', '♥', '♦', '♣'];
  const NAMES = ['你', '電腦 1', '電腦 2', '電腦 3', '電腦 4'];
  const STYLES = ['玩家', '穩健', '均衡', '進取', '算計'];
  function deck() {
    const cards = [];
    SUITS.forEach((suit, si) => {
      for (let rank = 1; rank <= 13; rank++) cards.push({ id: `${si}-${rank}`, rank, suit, joker: false });
    });
    for (let n = 0; n < 3; n++) cards.push({ id: `joker-${n}`, rank: 0, suit: '', joker: true });
    return cards;
  }
  function shuffle(cards, rng = Math.random) {
    const a = cards.map(c => ({ ...c }));
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function wrap(total) { return total === 0 ? 0 : (total - 1) % 21 + 1; }
  function score(cards) {
    let base = 0, aces = 0;
    for (const c of cards) {
      if (c.joker || c.rank == null) continue;
      base += Math.min(c.rank, 10);
      if (c.rank === 1) aces++;
    }
    let best = -1, total = base, highAces = 0;
    for (let n = 0; n <= aces; n++) {
      const raw = base + 10 * n, value = wrap(raw);
      if (value > best) { best = value; total = raw; highAces = n; }
    }
    return { value: best, total, highAces, aces, wraps: Math.max(0, Math.ceil(total / 21) - 1) };
  }
  function rankLabel(c) { return c.joker ? '鬼牌' : `${({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[c.rank] || c.rank}${c.suit}`; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function log(s, message, type = 'info') {
    s.events.push({ id: ++s.eventId, message, type });
    if (s.events.length > 100) s.events.shift();
  }
  class Game {
    constructor(config = {}, rng = Math.random) {
      const opponents = Number(config.opponents ?? 2), target = Number(config.target ?? 5);
      if (!Number.isInteger(opponents) || opponents < 1 || opponents > 4) throw Error('電腦對手須為 1 至 4 位');
      if (![5, 10].includes(target)) throw Error('勝利門檻須為 5 分或 10 分');
      this.config = { opponents, target, extras: Boolean(config.extras) };
      this.rng = rng;
      this.state = {
        version: VERSION, round: 0, starter: 0, actor: 0, phase: 'idle', pending: null,
        players: Array.from({ length: opponents + 1 }, (_, id) => ({ id, name: NAMES[id], style: STYLES[id], human: id === 0, hand: [], stopped: false, score: 0 })),
        deck: [], events: [], eventId: 0, dealStep: 0, settlementStage: '', result: null
      };
      this.nextRound();
    }
    static restore(saved) {
      if (saved?.version !== VERSION || !saved.config || !saved.state) throw Error('存檔版本不符');
      const game = Object.create(Game.prototype);
      game.config = clone(saved.config); game.state = clone(saved.state); game.rng = Math.random;
      assertState(game);
      return game;
    }
    save() { return { version: VERSION, config: clone(this.config), state: clone(this.state) }; }
    nextRound(orderedDeck) {
      const s = this.state;
      if (!['idle', 'roundOver'].includes(s.phase)) throw Error('目前不能開始下一局');
      s.round++; s.starter = (s.round - 1) % s.players.length; s.actor = s.starter;
      s.deck = orderedDeck ? clone(orderedDeck) : shuffle(deck(), this.rng);
      s.phase = 'deal'; s.dealStep = 0; s.pending = null; s.result = null; s.settlementStage = '';
      s.players.forEach(p => { p.hand = []; p.stopped = false; });
      log(s, `第 ${s.round} 局開始，由${s.players[s.starter].name}先抽牌。`, 'round');
    }
    step() {
      const s = this.state;
      if (s.phase === 'deal') {
        const n = s.players.length, index = (s.starter + s.dealStep % n) % n;
        const hidden = s.dealStep < n; s.dealStep++; s.actor = index;
        const c = this.take(index, hidden);
        log(s, hidden ? `${s.players[index].name}拿到一張底牌。` : `${s.players[index].name}抽到 ${rankLabel(c)}。`, hidden ? 'info' : 'draw');
        if (this.checkTriple(index)) return;
        if (c.joker && !hidden && this.trigger(index, c.id, 'deal')) return;
        this.finishDeal();
      } else if (s.phase === 'settlement') {
        if (s.settlementStage === 'revealJokers') {
          const hiddenJokers = [];
          s.players.forEach(p => p.hand.forEach(c => { if (c.hidden && c.joker) hiddenJokers.push({ owner: p.id, card: c }); }));
          hiddenJokers.forEach(({ card }) => { card.hidden = false; });
          s.settlementStage = 'revealAll';
          if (hiddenJokers.length >= 2) {
            hiddenJokers.forEach(({ card }) => { card.used = true; });
            log(s, `${hiddenJokers.length} 張底牌鬼牌同時翻出，全部抵銷，不發動換牌或升級。`, 'joker');
          } else if (hiddenJokers.length === 1) {
            const { owner, card } = hiddenJokers[0];
            log(s, `${s.players[owner].name}翻出唯一的底牌鬼牌。其他底牌繼續蓋住。`, 'joker');
            if (!this.checkTriple(owner)) this.trigger(owner, card.id, 'settlement');
          } else log(s, '沒有底牌鬼牌，準備翻開底牌比點數。');
        } else if (s.settlementStage === 'revealAll') this.endRound(null, 'points');
      } else throw Error('此階段沒有自動步驟');
    }
    take(owner, hidden) {
      const s = this.state, p = s.players[owner];
      if (!s.deck.length || p.hand.length >= 10) throw Error('不能再抽牌');
      const c = { ...s.deck.shift(), hidden, used: false };
      p.hand.push(c); return c;
    }
    finishDeal() {
      const s = this.state;
      if (s.phase === 'deal' && s.dealStep >= s.players.length * 2) {
        s.phase = 'turn'; s.actor = s.starter;
        log(s, '起手完成。每回合選擇加一張牌，或停牌。');
      }
    }
    draw() {
      const s = this.state;
      if (s.phase !== 'turn' || s.players[s.actor].stopped) throw Error('現在不能加牌');
      const owner = s.actor, c = this.take(owner, false);
      log(s, `${s.players[owner].name}抽到 ${rankLabel(c)}。`, c.joker ? 'joker' : 'draw');
      if (this.checkTriple(owner)) return;
      if (c.joker && this.trigger(owner, c.id, 'turn')) return;
      this.completeTurn(owner);
    }
    stop() {
      const s = this.state;
      if (s.phase !== 'turn' || s.players[s.actor].stopped) throw Error('現在不能停牌');
      const owner = s.actor; s.players[owner].stopped = true;
      log(s, `${s.players[owner].name}選擇停牌。`, 'stop'); this.completeTurn(owner);
    }
    trigger(owner, sourceId, returnPhase) {
      const s = this.state, p = s.players[owner], card = p.hand.find(c => c.id === sourceId);
      card.used = true;
      const allowJoker = this.config.extras && p.hand.filter(c => c.joker && !c.hidden).length >= 2;
      s.pending = { owner, sourceId, returnPhase, allowJoker };
      if (this.targets().length < 2) {
        log(s, `${p.name}的鬼牌立即處理：可交換的明牌不足兩張，效果不發動。`, 'joker');
        s.pending = null; return false;
      }
      s.phase = 'swap';
      log(s, `${p.name}必須立即換牌${allowJoker ? '，第二鬼可交換其他公開鬼牌' : ''}。`, 'joker');
      return true;
    }
    targets() {
      const s = this.state, pending = s.pending;
      if (!pending) return [];
      return s.players.flatMap(p => p.hand.filter(c => !c.hidden && c.id !== pending.sourceId && (!c.joker || pending.allowJoker)).map(c => ({ owner: p.id, card: c })));
    }
    swap(first, second) {
      const s = this.state;
      if (s.phase !== 'swap' || !s.pending) throw Error('現在不能換牌');
      const targets = this.targets(), a = targets.find(t => t.card.id === first), b = targets.find(t => t.card.id === second);
      if (!a || !b || first === second) throw Error('請選擇兩張合法且不同的明牌');
      const pending = s.pending, pa = s.players[a.owner], pb = s.players[b.owner];
      const ia = pa.hand.findIndex(c => c.id === first), ib = pb.hand.findIndex(c => c.id === second);
      [pa.hand[ia], pb.hand[ib]] = [pb.hand[ib], pa.hand[ia]];
      log(s, `${s.players[pending.owner].name}交換了${pa.name}的 ${rankLabel(a.card)} 與${pb.name}的 ${rankLabel(b.card)}。`, 'swap');
      if (pending.returnPhase === 'turn') {
        for (const id of new Set([a.owner, b.owner])) {
          const p = s.players[id];
          if (p.stopped && p.hand.length < 10) { p.stopped = false; log(s, `${p.name}被換牌，恢復行動機會。`, 'reopen'); }
        }
      }
      s.pending = null;
      for (const p of s.players) if (this.checkTriple(p.id)) return;
      s.phase = pending.returnPhase;
      if (s.phase === 'turn') this.completeTurn(pending.owner);
      else if (s.phase === 'deal') this.finishDeal();
    }
    completeTurn(owner) {
      const s = this.state, p = s.players[owner];
      if (p.hand.length >= 10 && !p.stopped) { p.stopped = true; log(s, `${p.name}已滿 10 張，自動停牌。`, 'stop'); }
      if (s.players.every(p => p.stopped)) {
        s.phase = 'settlement'; s.settlementStage = 'revealJokers';
        log(s, '所有人停牌，立即封盤。從現在起不能補牌。', 'seal');
      } else {
        s.phase = 'turn';
        for (let n = 1; n <= s.players.length; n++) {
          const id = (owner + n) % s.players.length;
          if (!s.players[id].stopped) { s.actor = id; break; }
        }
      }
    }
    checkTriple(owner) {
      const s = this.state;
      if (!this.config.extras || ['roundOver', 'matchOver'].includes(s.phase)) return false;
      if (s.players[owner].hand.filter(c => c.joker).length === 3) {
        log(s, `${s.players[owner].name}公開三張鬼牌，直接贏得本局！`, 'triple');
        this.endRound([owner], 'triple'); return true;
      }
      return false;
    }
    endRound(winners, kind) {
      const s = this.state;
      if (s.result) throw Error('這一局已結算');
      s.players.forEach(p => { p.stopped = true; p.hand.forEach(c => { c.hidden = false; }); });
      const points = s.players.map(p => score(p.hand).value), highest = Math.max(...points);
      if (!winners) winners = s.players.filter(p => points[p.id] === highest).map(p => p.id);
      winners.forEach(id => s.players[id].score++);
      const matchWinners = s.players.filter(p => p.score >= this.config.target).map(p => p.id);
      s.pending = null;
      s.result = { winners, points, kind, matchWinners };
      s.phase = matchWinners.length ? 'matchOver' : 'roundOver';
      log(s, `${winners.map(id => s.players[id].name).join('、')}${kind === 'triple' ? '以三鬼獨贏' : winners.length > 1 ? '並列最高' : '贏得本局'}，各加 1 分。`, 'result');
      if (matchWinners.length) log(s, `${matchWinners.map(id => s.players[id].name).join('、')}達到 ${this.config.target} 分，${matchWinners.length > 1 ? '並列' : ''}整場獲勝。`, 'match');
    }
    view(owner) {
      const s = this.state;
      const known = new Set();
      const players = s.players.map(p => ({ ...p, hand: p.hand.map(c => {
        if (p.id === owner || !c.hidden) { known.add(c.id); return { ...c }; }
        return { hidden: true };
      }) }));
      return {
        owner, config: { ...this.config }, phase: s.phase, pending: s.pending ? { ...s.pending } : null,
        players, unknown: deck().filter(c => !known.has(c.id)), deckCount: s.deck.length
      };
    }
  }
  function assertState(game) {
    const s = game.state, c = game.config;
    if (![1, 2, 3, 4].includes(c.opponents) || ![5, 10].includes(c.target)) throw Error('無效設定');
    if (!s || s.version !== VERSION || s.players.length !== c.opponents + 1) throw Error('無效玩家資料');
    if (!['deal', 'turn', 'swap', 'settlement', 'roundOver', 'matchOver'].includes(s.phase)) throw Error('無效遊戲階段');
    const all = [...s.deck, ...s.players.flatMap(p => p.hand)];
    if (all.length !== 55 || new Set(all.map(c => c.id)).size !== 55) throw Error('牌組數量不符');
    const valid = new Map(deck().map(c => [c.id, c]));
    for (const card of all) {
      const template = valid.get(card.id);
      if (!template || template.rank !== card.rank || template.suit !== card.suit || template.joker !== card.joker) throw Error('無效卡牌');
    }
    if (!Number.isInteger(s.actor) || !s.players[s.actor] || !Number.isInteger(s.round) || s.round < 1) throw Error('無效回合');
    s.players.forEach((p, id) => {
      if (p.id !== id || p.human !== (id === 0) || p.hand.length > 10 || p.hand.filter(c => c.hidden).length > 1 || !Number.isInteger(p.score) || p.score < 0 || p.score > c.target) throw Error('無效手牌');
    });
    if (s.phase === 'swap' && (!s.pending || !s.players[s.pending.owner] || !s.players[s.pending.owner].hand.some(c => c.id === s.pending.sourceId && c.joker && !c.hidden && c.used))) throw Error('無效換牌狀態');
    return true;
  }
  function distribution(hand, unknown) {
    if (!hand.some(c => c.rank == null)) return [{ value: score(hand).value, chance: 1 }];
    const publicCards = hand.filter(c => c.rank != null), counts = new Map();
    for (const c of unknown) {
      const n = score([...publicCards, c]).value; counts.set(n, (counts.get(n) || 0) + 1);
    }
    return [...counts].map(([value, count]) => ({ value, chance: count / unknown.length }));
  }
  function winChance(value, opponents) {
    return opponents.reduce((p, dist) => p * dist.filter(x => x.value <= value).reduce((a, x) => a + x.chance, 0), 1);
  }
  function chooseDraw(view) {
    const me = view.players[view.owner], current = score(me.hand).value;
    if (me.hand.length >= 10 || current === 21 || !view.deckCount) return false;
    if (current < 14) return true;
    const opponents = view.players.filter(p => p.id !== view.owner).map(p => distribution(p.hand, view.unknown));
    const stop = winChance(current, opponents);
    const future = view.unknown.reduce((sum, c) => {
      let utility = winChance(score([...me.hand, c]).value, opponents);
      if (c.joker) utility += view.config.extras && me.hand.some(x => x.joker) ? .20 : .04;
      return sum + utility;
    }, 0) / view.unknown.length;
    const margin = ({ '穩健': .055, '均衡': .025, '進取': -.015, '算計': .015 })[me.style] ?? .025;
    return future > stop + margin || (current < 18 && me.hand.length < 6 && stop < .35);
  }
  function chooseSwap(view) {
    const pending = view.pending;
    if (!pending) throw Error('沒有待處理鬼牌');
    const targets = view.players.flatMap(p => p.hand.filter(c => !c.hidden && c.id !== pending.sourceId && (!c.joker || pending.allowJoker)).map(c => ({ owner: p.id, card: c })));
    if (targets.length < 2) return null;
    let best = [targets[0].card.id, targets[1].card.id], bestValue = -Infinity;
    const cache = new Map();
    function dist(hand) {
      const key = hand.map(c => c.id || '?').sort().join('|');
      if (!cache.has(key)) cache.set(key, distribution(hand, view.unknown));
      return cache.get(key);
    }
    for (let a = 0; a < targets.length; a++) for (let b = a + 1; b < targets.length; b++) {
      const first = targets[a], second = targets[b];
      if (first.owner === second.owner) continue;
      const hands = view.players.map(p => p.hand.map(c => c.id === first.card.id ? second.card : c.id === second.card.id ? first.card : c));
      const myHand = hands[view.owner];
      let utility;
      if (view.config.extras && myHand.filter(c => c.joker).length === 3) utility = 100;
      else {
        const distributions = hands.map(dist);
        const value = score(myHand).value;
        utility = winChance(value, distributions.filter((_, i) => i !== view.owner));
        for (const p of view.players) if (p.id !== view.owner) {
          const theirWin = distributions[p.id].reduce((sum, v) => sum + v.chance * winChance(v.value, distributions.filter((_, i) => i !== p.id)), 0);
          utility -= .16 * theirWin * (p.score + 1) / view.config.target;
        }
        utility += value / 10000;
      }
      if (utility > bestValue + 1e-10) { bestValue = utility; best = [first.card.id, second.card.id]; }
    }
    return best;
  }
  return { VERSION, Game, deck, shuffle, wrap, score, rankLabel, assertState, chooseDraw, chooseSwap, distribution };
});
