const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
function rng(seed = 1) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }
function card(rank, suit = '♠') { return E.deck().find(c => c.rank === rank && c.suit === suit); }
const joker = n => E.deck().find(c => c.id === `joker-${n}`);
function scenario(hands, options = {}, phase = 'turn') {
  const g = new E.Game({ opponents: hands.length - 1, ...options }, rng());
  const assigned = new Set();
  g.state.players.forEach((p, i) => {
    p.hand = hands[i].map((input, ci) => {
      const entry = input.card ? input : { card: input };
      assert(!assigned.has(entry.card.id)); assigned.add(entry.card.id);
      return { ...entry.card, hidden: entry.hidden ?? ci === 0, used: entry.used ?? false };
    });
    p.stopped = false;
  });
  g.state.deck = E.deck().filter(c => !assigned.has(c.id));
  g.state.phase = phase; g.state.actor = 0; g.state.dealStep = hands.length * 2;
  g.state.result = null; g.state.pending = null; g.state.settlementStage = '';
  E.assertState(g); return g;
}
function nextCard(g, c) {
  const index = g.state.deck.findIndex(x => x.id === c.id); assert(index >= 0);
  g.state.deck.unshift(g.state.deck.splice(index, 1)[0]);
}
function act(g, forcedDraw = false) {
  const s = g.state;
  if (['deal', 'settlement'].includes(s.phase)) g.step();
  else if (s.phase === 'swap') g.swap(...E.chooseSwap(g.view(s.pending.owner)));
  else if (s.phase === 'turn') { if (forcedDraw || E.chooseDraw(g.view(s.actor))) g.draw(); else g.stop(); }
  else if (s.phase === 'roundOver') g.nextRound();
  E.assertState(g);
}

test('55 unique cards, three jokers, shuffle preserves the complete deck', () => {
  const a = E.deck(); assert.equal(a.length, 55); assert.equal(a.filter(c => c.joker).length, 3);
  assert.equal(new Set(a.map(c => c.id)).size, 55);
  assert.deepEqual(E.shuffle(a, rng()).map(c => c.id).sort(), a.map(c => c.id).sort());
});
test('modulo scoring and independent flexible aces choose the best wrapped score', () => {
  assert.equal(E.wrap(0), 0); assert.equal(E.wrap(21), 21); assert.equal(E.wrap(22), 1); assert.equal(E.wrap(42), 21); assert.equal(E.wrap(43), 1);
  assert.equal(E.score([card(1), card(10), card(11), card(12)]).value, 20);
  assert.equal(E.score([card(1), card(1, '♥'), card(9)]).value, 21);
  assert.equal(E.score([card(1), card(8), card(7)]).value, 16);
  assert.equal(E.score([joker(0), joker(1)]).value, 0);
});
test('initial deal is one card per player per circle with private first cards', () => {
  const g = new E.Game({ opponents: 4 }, rng(9));
  g.state.deck.sort((a, b) => Number(a.joker) - Number(b.joker));
  for (let step = 0; step < 10; step++) {
    g.step();
    const lengths = g.state.players.map(p => p.hand.length);
    assert(Math.max(...lengths) - Math.min(...lengths) <= 1);
  }
  assert.equal(g.state.phase, 'turn');
  g.state.players.forEach(p => { assert.equal(p.hand.length, 2); assert(p.hand[0].hidden); assert(!p.hand[1].hidden); });
});
test('an early joker fizzles immediately without two legal cards and never waits', () => {
  const g = new E.Game({ opponents: 1 }, rng());
  const order = [card(2), card(3), joker(0)];
  const ids = new Set(order.map(c => c.id));
  g.state.deck = [...order, ...E.deck().filter(c => !ids.has(c.id))];
  g.step(); g.step(); g.step();
  assert.equal(g.state.phase, 'deal'); assert.equal(g.state.pending, null); assert.equal(g.state.players[0].hand[1].used, true);
});
test('a drawn joker immediately requires two public cards; hidden and ghost targets are rejected', () => {
  const g = scenario([[card(2), card(8)], [card(3), card(10)], [card(4), card(7)]]);
  nextCard(g, joker(0)); g.draw();
  assert.equal(g.state.phase, 'swap'); assert.equal(g.state.players[0].hand.length, 3);
  assert(!g.targets().some(t => t.card.hidden || t.card.joker));
  assert.throws(() => g.draw());
  assert.throws(() => g.swap(card(2).id, card(10).id));
  g.swap(card(10).id, card(7).id);
  assert.equal(g.state.players[1].hand[1].rank, 7); assert.equal(g.state.players[2].hand[1].rank, 10);
  assert.equal(g.state.players[0].hand.length, 3); assert.equal(g.state.actor, 1);
});
test('stopped targets below the cap reopen in turn order', () => {
  const g = scenario([[card(2), card(8)], [card(3), card(10)], [card(4), card(7)]]);
  g.state.players[1].stopped = true; nextCard(g, joker(0)); g.draw();
  g.swap(card(10).id, card(7).id);
  assert.equal(g.state.players[1].stopped, false); assert.equal(g.state.actor, 1);
});
test('the tenth card triggers a joker before its owner automatically stops; no replacement draw', () => {
  const pool = E.deck().filter(c => !c.joker);
  const g = scenario([pool.slice(0, 9), pool.slice(9, 11)]);
  nextCard(g, joker(0)); g.draw(); assert.equal(g.state.phase, 'swap');
  const pair = g.targets().slice(0, 2).map(t => t.card.id); g.swap(...pair);
  assert.equal(g.state.players[0].hand.length, 10); assert.equal(g.state.players[0].stopped, true);
  assert.equal(g.state.actor, 1);
});
test('full players stay stopped when swapped', () => {
  const pool = E.deck().filter(c => !c.joker);
  const g = scenario([pool.slice(0, 2), pool.slice(2, 12), pool.slice(12, 14)]);
  g.state.players[1].stopped = true; nextCard(g, joker(0)); g.draw();
  g.swap(g.state.players[1].hand[1].id, g.state.players[2].hand[1].id);
  assert.equal(g.state.players[1].stopped, true); assert.equal(g.state.actor, 2);
});
test('a unique bottom joker acts before other bottoms are revealed; settlement swaps never reopen players', () => {
  const g = scenario([[joker(0), card(8)], [card(3), card(10)]]);
  g.state.players.forEach(p => { p.stopped = true; });
  g.state.phase = 'settlement'; g.state.settlementStage = 'revealJokers';
  g.step(); assert.equal(g.state.phase, 'swap'); assert(g.state.players[1].hand[0].hidden);
  assert(!g.state.pending.allowJoker); g.swap(card(8).id, card(10).id);
  assert(g.state.players.every(p => p.stopped)); assert.equal(g.state.phase, 'settlement');
  assert.throws(() => g.draw()); g.step(); assert.equal(g.state.phase, 'roundOver');
});
test('multiple bottom jokers cancel before any optional upgrade', () => {
  const g = scenario([[joker(0), joker(1)], [joker(2), card(10)]], { extras: true });
  g.state.players.forEach(p => { p.stopped = true; });
  g.state.phase = 'settlement'; g.state.settlementStage = 'revealJokers';
  g.step(); assert.equal(g.state.phase, 'settlement'); assert.equal(g.state.pending, null);
  assert(g.state.players.every(p => p.hand[0].used)); g.step(); assert.equal(g.state.result.kind, 'points');
});
test('optional second public joker can trade an ordinary card for a used third joker and win exclusively', () => {
  const g = scenario([[card(2), { card: joker(0), used: true }, card(8)], [card(3), { card: joker(2), used: true }, card(10)]], { extras: true });
  nextCard(g, joker(1)); g.draw(); assert(g.state.pending.allowJoker);
  assert(g.targets().some(t => t.card.id === joker(2).id));
  assert(!g.targets().some(t => t.card.id === joker(1).id));
  g.swap(card(8).id, joker(2).id);
  assert.equal(g.state.phase, 'roundOver'); assert.equal(g.state.result.kind, 'triple');
  assert.deepEqual(g.state.result.winners, [0]); assert.deepEqual(g.state.players.map(p => p.score), [1, 0]);
  assert.equal(g.state.pending, null); assert(g.state.players[0].hand.find(c => c.id === joker(2).id).used);
});
test('natural three jokers including a concealed bottom immediately win before exchanging', () => {
  const g = scenario([[joker(0), { card: joker(1), used: true }], [card(3), card(10)]], { extras: true });
  nextCard(g, joker(2)); g.draw();
  assert.equal(g.state.result.kind, 'triple'); assert.equal(g.state.pending, null);
});
test('a sole bottom joker can become the second public joker and upgrade during settlement', () => {
  const g = scenario([[joker(0), { card: joker(1), used: true }, card(8)], [card(3), { card: joker(2), used: true }, card(10)]], { extras: true });
  g.state.phase = 'settlement'; g.state.settlementStage = 'revealJokers'; g.state.players.forEach(p => { p.stopped = true; });
  g.step(); assert(g.state.pending.allowJoker); assert(g.state.players[1].hand[0].hidden);
  g.swap(card(8).id, joker(2).id); assert.equal(g.state.result.kind, 'triple');
});
test('equal highest points score together regardless of hand counts, and simultaneous target crossings share the match', () => {
  const g = scenario([[card(1), card(10)], [card(2), card(9), card(10, '♥')], [card(3), card(7)]], { target: 5 });
  g.state.players[0].score = 4; g.state.players[1].score = 4;
  g.endRound(null, 'points');
  assert.deepEqual(g.state.result.winners, [0, 1]); assert.deepEqual(g.state.result.matchWinners, [0, 1]);
  assert.equal(g.state.phase, 'matchOver'); assert.throws(() => g.nextRound());
});
test('points reset each round, match scores stay, and the starting player rotates', () => {
  const g = scenario([[card(1), card(10)], [card(3), card(7)]]);
  g.endRound(null, 'points'); g.nextRound();
  assert.equal(g.state.round, 2); assert.equal(g.state.starter, 1); assert.equal(g.state.actor, 1);
  assert.equal(g.state.players[0].score, 1); assert(g.state.players.every(p => !p.stopped && p.hand.length === 0));
});
test('save restore preserves pending decisions, rejects malformed cards, and AI cannot see private opponent cards or deck order', () => {
  const g = scenario([[card(2), card(8)], [card(3), card(10)]]);
  nextCard(g, joker(0)); g.draw(); const saved = g.save(), copy = E.Game.restore(saved);
  assert.deepEqual(copy.save(), saved);
  const view = g.view(1);
  assert.deepEqual(view.players[0].hand[0], { hidden: true });
  assert(!('deck' in view)); assert(view.players[1].hand[0].rank === 3);
  assert.equal(view.unknown.length, 51);
  const before = JSON.stringify(view); const pair = E.chooseSwap(view);
  assert.equal(JSON.stringify(view), before); assert(pair.every(id => g.targets().some(t => t.card.id === id)));
  const bad = g.save(); bad.state.players[0].hand[0].rank = 99; assert.throws(() => E.Game.restore(bad));
});
test('computer decisions are identical if unseen opponent bottoms and deck cards exchange places', () => {
  const g = scenario([[card(2), card(8)], [card(3), card(10)]]), before = g.view(1);
  const hidden = g.state.players[0].hand[0], fromDeck = g.state.deck[4];
  g.state.players[0].hand[0] = { ...fromDeck, hidden: true, used: false };
  g.state.deck[4] = { id: hidden.id, rank: hidden.rank, suit: hidden.suit, joker: hidden.joker };
  const after = g.view(1); assert.deepEqual(before, after);
  assert.equal(E.chooseDraw(before), E.chooseDraw(after));
});
test('all opponent counts and both rule modes complete full matches without loops, missing cards, or repeated scoring', { timeout: 120000 }, () => {
  for (let opponents = 1; opponents <= 4; opponents++) for (const extras of [false, true]) for (let seed = 1; seed <= 8; seed++) {
    const g = new E.Game({ opponents, target: seed % 2 ? 5 : 10, extras }, rng(100 * opponents + seed));
    let actions = 0;
    while (g.state.phase !== 'matchOver' && actions++ < 6000) act(g);
    assert.equal(g.state.phase, 'matchOver', `opponents=${opponents}, extras=${extras}, seed=${seed}`);
    assert(g.state.result.matchWinners.length > 0);
  }
});
test('all players can pursue the ten-card cap with three-ghost rules without deadlocking', { timeout: 120000 }, () => {
  for (let seed = 1; seed <= 15; seed++) {
    const g = new E.Game({ opponents: 4, extras: true }, rng(seed));
    let actions = 0;
    while (!g.state.result && actions++ < 100) act(g, true);
    assert(g.state.result); assert(g.state.players.every(p => p.hand.length <= 10));
  }
});
