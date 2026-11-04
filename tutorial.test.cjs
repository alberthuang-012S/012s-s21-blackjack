const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const T = require('./tutorial-model.js');
function move(session, action) {
  assert.equal(session.act(action), true, `${session.index}/${session.step}: ${action}`);
  E.assertState(session.game);
  const restored = T.Session.restore(session.save());
  assert.deepEqual(restored.save(), session.save(), 'Each actual teaching state can be resumed.');
}
function swapExpected(session) {
  session.copy.expected.forEach(id => assert(session.select(id)));
  move(session, 'swap');
}
test('lesson 1 deals one card per player per circle, without revealing opponent bottoms', () => {
  const s = new T.Session(0);
  move(s, 'deal-bottom');
  assert(s.game.state.players.every(p => p.hand.length === 1 && p.hand[0].hidden));
  move(s, 'deal-open');
  assert.equal(E.score(s.game.state.players[0].hand).value, 18);
  assert(s.game.state.players.every(p => p.hand.length === 2 && p.hand[0].hidden && !p.hand[1].hidden));
  move(s, 'finish'); assert(s.completed);
});
test('lesson 2 really draws seven and wraps twenty-five to four', () => {
  const s = new T.Session(1); move(s, 'draw');
  assert.equal(s.game.state.players[0].hand.length, 3);
  assert.deepEqual(E.score(s.game.state.players[0].hand), { value: 4, total: 25, highAces: 0, aces: 0, wraps: 1 });
});
test('lesson 3 compares one-ace and independent two-ace choices, and wrong answers do not advance', () => {
  const s = new T.Session(2), initial = s.game.save();
  assert.equal(s.act('ace-1'), false); assert.equal(s.step, 'start'); assert(s.feedback);
  assert.deepEqual(s.game.save(), initial);
  move(s, 'ace-11'); assert.equal(E.score(s.game.state.players[0].hand).value, 20);
  move(s, 'multiple-aces');
  assert.equal(s.act('aces-high'), false); assert.equal(s.act('aces-low'), false);
  move(s, 'aces-mixed'); assert.equal(E.score(s.game.state.players[0].hand).value, 21);
});
test('lesson 4 requires the actual public-card exchange and rejects off-script selections without changing the game', () => {
  const s = new T.Session(3); move(s, 'draw-joker');
  assert.equal(s.game.state.phase, 'swap');
  assert.equal(s.select('joker-0'), false); assert.equal(s.select('0-6'), false);
  s.select('0-9'); s.select('2-5'); const before = s.game.save();
  assert.equal(s.act('swap'), false); assert.deepEqual(s.game.save(), before); assert(s.feedback);
  s.selected = []; swapExpected(s);
  assert(s.game.state.players[1].hand.some(c => c.id === '3-10'));
  assert(s.game.state.players[2].hand.some(c => c.id === '3-7'));
  assert.equal(s.game.state.players[0].hand.length, 3);
});
test('lesson 5 restores a stopped human in the correct turn order and permits either choice', () => {
  for (const choice of ['draw-again', 'stop-again']) {
    const s = new T.Session(4); move(s, 'stop');
    assert(s.game.state.players[0].stopped);
    move(s, 'watch-swap');
    assert(!s.game.state.players[0].stopped); assert.equal(s.game.state.actor, 0);
    assert.equal(E.score(s.game.state.players[0].hand).value, 17);
    move(s, choice); assert.equal(s.step, 'result');
  }
});
test('lesson 6 preserves sealed bottoms, forbids redrawing, scores unequal-size tied hands, and cancels multiple bottom jokers', () => {
  const s = new T.Session(5); move(s, 'reveal-joker');
  assert.equal(s.game.state.phase, 'swap');
  assert(s.game.state.players[1].hand[0].hidden && s.game.state.players[2].hand[0].hidden);
  swapExpected(s); assert(s.game.state.players.every(p => p.stopped));
  assert.throws(() => s.game.draw());
  move(s, 'reveal-all');
  assert.deepEqual(s.game.state.result.winners, [1, 2]);
  assert.deepEqual(s.game.state.players.map(p => p.score), [0, 1, 1]);
  assert.equal(s.game.state.players[1].hand.length, 3); assert.equal(s.game.state.players[2].hand.length, 4);
  move(s, 'cancel-example'); assert.equal(s.game.state.pending, null);
  assert(s.game.state.players[0].hand[0].used && s.game.state.players[1].hand[0].used);
  move(s, 'finish'); assert(s.completed);
});
test('tutorial sessions do not mutate a formal match, and invalid checkpoints are rejected', () => {
  const formal = new E.Game({ opponents: 4, target: 10, extras: true }), saved = formal.save();
  const practice = new T.Session(1); move(practice, 'draw'); move(practice, 'finish');
  assert.deepEqual(formal.save(), saved);
  assert.throws(() => new T.Session(-1)); assert.throws(() => new T.Session(6));
  assert.throws(() => T.Session.restore({ version: 1, index: 6, step: 'start', selected: [] }));
  const corrupt = new T.Session(0).save(); corrupt.game.state.deck[0].rank = 99;
  assert.throws(() => T.Session.restore(corrupt));
});
