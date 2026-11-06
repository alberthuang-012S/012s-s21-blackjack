/* Fixed, separate practice tables; every move uses the normal S21 rules engine. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.S21Tutorial = factory(root.S21);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  const VERSION = 1;
  const LESSONS = [
    { title: '認識牌桌', summary: '底牌、明牌與你的最佳點數', symbol: '♠' },
    { title: '抽牌與繞回', summary: '親手將 25 點繞回 4 點', symbol: '↻' },
    { title: 'A 的彈性點數', summary: '比較 1 與 11，取最高結果', symbol: 'A' },
    { title: '鬼牌選擇換牌', summary: '交換明牌，或選擇不換', symbol: '鬼' },
    { title: '停牌後再回來', summary: '被換牌後，重新決定下一手', symbol: '↩' },
    { title: '封盤與加分', summary: '先處理鬼牌，再翻底牌比點數', symbol: '+1' }
  ];
  const card = (rank, suit = '♠') => E.deck().find(c => c.rank === rank && c.suit === suit);
  const joker = n => E.deck().find(c => c.id === `joker-${n}`);
  function table(hands, top = []) {
    const game = new E.Game({ opponents: 2 }), used = new Set();
    game.state.players.forEach((p, i) => {
      p.hand = hands[i].map((c, n) => {
        if (!c || used.has(c.id)) throw Error('教學牌面重複');
        used.add(c.id); return { ...c, hidden: n === 0, used: c.joker && n !== 0 };
      });
      p.stopped = false;
    });
    for (const c of top) { if (used.has(c.id)) throw Error('教學牌庫重複'); used.add(c.id); }
    game.state.deck = [...top.map(c => ({ ...c })), ...E.deck().filter(c => !used.has(c.id))];
    game.state.phase = 'turn'; game.state.actor = 0; game.state.dealStep = 6;
    game.state.events = []; game.state.eventId = 0; game.state.result = null; game.state.pending = null;
    E.assertState(game); return game;
  }
  function sealTable(cancelled = false) {
    const game = cancelled
      ? table([[joker(0), card(9)], [joker(1), card(8)], [card(6, '♣'), card(10)]])
      : table([[joker(0), card(9)], [card(6), card(5, '♦'), card(7, '♣')], [card(8, '♥'), card(4, '♦'), card(2, '♣'), card(10, '♣')]]);
    game.state.players.forEach(p => { p.stopped = true; });
    game.state.phase = 'settlement'; game.state.settlementStage = 'revealJokers';
    return game;
  }
  const copy = (title, body, actions, extra = {}) => ({ title, body, actions: actions.map(([id, label, kind]) => ({ id, label, kind: kind || 'primary' })), ...extra });
  const STEPS = [
    {
      start: copy('先發底牌，一人一張。', '這是固定的三人教學牌桌。先完成第一圈：每人只抽一張，依序輪到下一位。', [['deal-bottom', '發第一圈底牌']], { focus: 'board' }),
      bottom: copy('這張底牌，只有你能看。', '你的底牌是 8♠，標有「私有底牌」。兩位電腦的底牌仍蓋住；正式對局也不會把你的底牌交給電腦。', [['deal-open', '發第二圈明牌']], { focus: 'hand' }),
      board: copy('看懂你的牌，也看懂牌桌。', '你現在是 8＋10＝18 點。第二圈的牌是明牌，大家都看得到。下方是目前最佳點數，上方記錄整場累積分數；兩者不同。', [['finish', '學會了，下一課']], { focus: 'point', equation: ['8', '＋', '10', '＝', '18'] })
    },
    {
      start: copy('18 點，再抽一張會怎樣？', '這一課先不追求勝利。按「加一張」，看看抽到 7 之後，超過 21 的點數如何繞回。', [['draw', '加一張 ＋']], { focus: 'actions' }),
      result: copy('25 點，繞回 4 點。', '18＋7＝25；超過 21，就扣掉 21，得到 4 點。你不會爆牌，但原本不錯的點數也可能下降。每人最多持有 10 張，鬼牌也算張數。', [['finish', '學會了，下一課']], { focus: 'point', equation: ['25', '−', '21', '＝', '4'] })
    },
    {
      start: copy('這張 A，要算 1 還是 11？', '你的牌是 A、K、Q、J。試著比較兩種算法，選出繞回後點數較高的一種。這裡是教學比較題；正式對局會自動選最佳算法。', [['ace-1', 'A 算 1 點', 'secondary'], ['ace-11', 'A 算 11 點']], { focus: 'hand' }),
      single: copy('A 算 11，這一手有 20 點。', 'A 算 1：31→10 點；A 算 11：41→20 點。重點是比較「繞回後」的結果，加牌或換牌後都會重新計算。', [['multiple-aces', '再看看兩張 A']], { focus: 'point', equation: ['41', '−', '21', '＝', '20'] }),
      multiple: copy('兩張 A 不必取相同點數。', '現在是 A、A、9。哪一種組合最好？每張 A 都可以分別算 1 或 11。', [['aces-low', '兩張都算 1', 'secondary'], ['aces-mixed', '一張 1、一張 11'], ['aces-high', '兩張都算 11', 'secondary']], { focus: 'hand' }),
      result: copy('1＋11＋9，正好 21 點。', '兩張都算 1 是 11 點；一張 1、一張 11 是 21 點；兩張都算 11 則 31→10 點。正式對局會自動幫你取 21。', [['finish', '學會了，下一課']], { focus: 'point', equation: ['1', '＋11＋9', '＝', '21'] })
    },
    {
      start: copy('這次會抽到鬼牌。', '鬼牌算 0 點，抽到時立即選擇換牌或不換牌；效果不能保留，也不額外補抽。先按「加一張」。', [['draw-joker', '加一張 ＋']], { focus: 'actions' }),
      select: copy('可以只交換別人的牌。', '可點選電腦 1 的 7♣ 與電腦 2 的 10♣，再確認交換；也可以選擇不換牌。底牌與鬼牌不能選。', [['swap', '確認交換 ↔'], ['skip-swap', '不換牌', 'secondary']], { focus: 'targets', expected: ['3-7', '3-10'] }),
      skipped: copy('你選擇不換牌。', '這張鬼牌仍算已使用，留在手上占一張，算 0 點；本回合結束，不能留到下一回合再用。你也可以重新練習換牌。', [['practice-swap', '再試一次換牌'], ['finish', '學會了，下一課', 'secondary']], { focus: 'hand' }),
      result: copy('兩位對手的明牌互換了。', '你的點數沒有變，但手上多了一張 0 點鬼牌。一般對局能交換任意兩張合法明牌，也可以選擇不換；同一人再次抽到鬼牌，仍須立即決定。', [['finish', '學會了，下一課']], { focus: 'board' })
    },
    {
      start: copy('18 點，先試著停牌。', '停牌會暫時跳過你的行動，但明牌仍可能被鬼牌交換。先按「停牌」。', [['stop', '停牌']], { focus: 'actions' }),
      stopped: copy('你停牌了，但這局還沒封盤。', '電腦 1 接下來抽到鬼牌，會把你的 10♦ 與電腦 2 的 9♣ 交換。按下一步，觀察自己的點數和狀態。', [['watch-swap', '看看電腦的換牌']], { focus: 'hand' }),
      reopened: copy('17 點，輪到你重新決定。', '你的明牌被換過，且未滿 10 張，所以恢復行動。電腦 2 停牌後，依原順序輪到你。你可以再抽一張，或再次停牌；滿 10 張則不能再抽。', [['draw-again', '再加一張 ＋'], ['stop-again', '再次停牌', 'secondary']], { focus: 'actions' }),
      result: copy('要繼續還是收手，由你決定。', '被換牌後不用立刻補牌，也不插隊。只有在正常回合、未滿 10 張時能恢復行動。下一課會看到封盤後的不同限制。', [['finish', '學會了，下一課']], { focus: 'hand' })
    },
    {
      start: copy('所有人停牌，立即封盤。', '這一課有一張底牌鬼牌。先只翻出底牌是鬼牌的牌，其餘底牌保持蓋住；正式計分要等效果全部完成。', [['reveal-joker', '先翻底牌鬼牌']], { focus: 'board' }),
      select: copy('唯一一張底牌鬼牌，立即決定。', '可以交換電腦 1 的 7♣ 與電腦 2 的 10♣，也可以選擇不換牌。其他底牌仍不可交換；封盤後任何人都不能再補牌。', [['swap', '確認交換 ↔'], ['skip-swap', '不換牌', 'secondary']], { focus: 'targets', expected: ['3-7', '3-10'] }),
      skipped: copy('封盤時選擇不換牌。', '鬼牌已使用，牌面不交換，其餘底牌仍暫時蓋住；封盤後不能補牌。接著翻牌計分。', [['reveal-skip', '翻開其餘底牌']], { focus: 'board' }),
      'skip-result': copy('不換牌也能順利結算。', '這次電腦 1 以 18 點贏得本局並加 1 分。你可以重試封盤換牌，看看不同張數如何並列加分。', [['retry-seal', '重試封盤換牌'], ['finish', '完成六段教學', 'secondary']], { focus: 'scores' }),
      swapped: copy('封盤換牌完成，不能再抽。', '兩位電腦仍維持停牌，即使都未滿 10 張，也不恢復行動。現在才翻開其他底牌，比較最後點數。', [['reveal-all', '翻開其餘底牌']], { focus: 'board' }),
      tie: copy('都是 21 點，各加 1 分。', '電腦 1 有 3 張牌，電腦 2 有 4 張牌，但都得到 21 點。最高點數並列時，各加 1 分，不比較張數；先達 5 或 10 分贏得整場。', [['cancel-example', '再看多張底牌鬼牌']], { focus: 'scores', equation: ['21', '＝', '21', '各＋1'] }),
      cancelled: copy('兩張底牌鬼牌，同時抵銷。', '第二個情境中，兩位玩家同時翻出底牌鬼牌，全部不發動換牌。直接翻其餘底牌計分；封盤後依然不能補牌。', [['finish', '完成六段教學']], { focus: 'board' })
    }
  ];
  class Session {
    constructor(index = 0) {
      if (!Number.isInteger(index) || index < 0 || index >= LESSONS.length) throw Error('無效課程');
      this.index = index; this.step = 'start'; this.selected = []; this.feedback = ''; this.completed = false;
      if (index === 0) {
        this.game = new E.Game({ opponents: 2 });
        const order = [card(8), card(3, '♥'), card(6, '♣'), card(10, '♦'), card(9, '♣'), card(7, '♥')];
        const known = new Set(order.map(c => c.id));
        this.game.state.deck = [...order, ...E.deck().filter(c => !known.has(c.id))];
      } else if (index === 1) this.game = table([[card(8), card(10, '♦')], [card(2, '♥'), card(9, '♣')], [card(6, '♣'), card(7, '♥')]], [card(7)]);
      else if (index === 2) this.game = table([[card(1), card(13, '♣'), card(12, '♦'), card(11, '♥')], [card(2), card(7)], [card(3), card(8)]]);
      else if (index === 3) this.game = table([[card(4, '♥'), card(9)], [card(6), card(5, '♦'), card(7, '♣')], [card(8, '♥'), card(4, '♦'), card(2, '♣'), card(10, '♣')]], [joker(0)]);
      else if (index === 4) this.game = table([[card(8), card(10, '♦')], [card(4), card(7)], [card(6, '♥'), card(9, '♣')]], [joker(0), card(2, '♣')]);
      else this.game = sealTable();
      E.assertState(this.game);
    }
    get copy() { return STEPS[this.index][this.step]; }
    save() { return { version: VERSION, index: this.index, step: this.step, selected: [...this.selected], completed: this.completed, game: this.game.save() }; }
    static restore(data) {
      if (data?.version !== VERSION || !Number.isInteger(data.index) || data.index < 0 || data.index >= LESSONS.length || !Object.hasOwn(STEPS[data.index], data.step) || !Array.isArray(data.selected)) throw Error('無效教學進度');
      const s = Object.create(Session.prototype);
      s.index = data.index; s.step = data.step; s.selected = data.selected.slice(0, 2); s.completed = Boolean(data.completed);
      s.game = E.Game.restore(data.game); s.feedback = '';
      if (s.selected.some(id => !s.game.targets().some(t => t.card.id === id))) s.selected = [];
      return s;
    }
    select(id) {
      if (!this.copy.expected || !this.game.targets().some(t => t.card.id === id)) return false;
      this.selected = this.selected.includes(id) ? this.selected.filter(x => x !== id) : this.selected.length < 2 ? [...this.selected, id] : [this.selected[1], id];
      this.feedback = ''; return true;
    }
    act(action) {
      if (this.completed || !this.copy.actions.some(a => a.id === action)) return false;
      this.feedback = '';
      if (action === 'finish') { this.completed = true; return true; }
      const g = this.game;
      if (action === 'deal-bottom') { for (let n = 0; n < 3; n++) g.step(); this.step = 'bottom'; }
      else if (action === 'deal-open') { for (let n = 0; n < 3; n++) g.step(); this.step = 'board'; }
      else if (action === 'draw') { g.draw(); this.step = 'result'; }
      else if (action === 'ace-1') { this.feedback = 'A 算 1 時，31→10 點。再試試算 11，看看繞回後能否更高。'; return false; }
      else if (action === 'ace-11') this.step = 'single';
      else if (action === 'multiple-aces') { this.game = table([[card(1), card(1, '♥'), card(9, '♣')], [card(2), card(7)], [card(3), card(8)]]); this.step = 'multiple'; }
      else if (action === 'aces-low' || action === 'aces-high') { this.feedback = action === 'aces-low' ? '兩張都算 1 是 11 點。試試讓其中一張 A 算 11。' : '兩張都算 11 是 31→10 點。每張 A 可以分別取值。'; return false; }
      else if (action === 'aces-mixed') this.step = 'result';
      else if (action === 'draw-joker') { g.draw(); this.step = 'select'; }
      else if (action === 'skip-swap') { g.skipSwap(); this.selected = []; this.step = 'skipped'; }
      else if (action === 'practice-swap') { this.game = new Session(3).game; this.step = 'start'; }
      else if (action === 'reveal-skip') { g.step(); this.step = 'skip-result'; }
      else if (action === 'retry-seal') { this.game = sealTable(); this.step = 'start'; }
      else if (action === 'swap') {
        if (this.selected.length !== 2 || !this.copy.expected.every(id => this.selected.includes(id))) {
          this.feedback = '這兩張在正式對局可能也能交換；這次請依提示，選電腦 1 的 7♣ 與電腦 2 的 10♣。'; return false;
        }
        g.swap(...this.selected); this.selected = []; this.step = this.index === 5 ? 'swapped' : 'result';
      } else if (action === 'stop') { g.stop(); this.step = 'stopped'; }
      else if (action === 'watch-swap') { g.draw(); g.swap(card(10, '♦').id, card(9, '♣').id); g.stop(); this.step = 'reopened'; }
      else if (action === 'draw-again' || action === 'stop-again') { if (action === 'draw-again') g.draw(); else g.stop(); this.step = 'result'; }
      else if (action === 'reveal-joker') { g.step(); this.step = 'select'; }
      else if (action === 'reveal-all') { g.step(); this.step = 'tie'; }
      else if (action === 'cancel-example') { this.game = sealTable(true); this.game.step(); this.step = 'cancelled'; }
      E.assertState(this.game); return true;
    }
  }
  return { VERSION, LESSONS, Session };
});
