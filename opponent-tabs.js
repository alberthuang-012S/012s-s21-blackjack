(function () {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Only face-up cards are included in the overview; private bottom cards stay private.
  window.S21OpponentTabs = function (players, focused, selected, attribute) {
    return players.map(p => {
      const visible = p.hand.filter(card => !card.hidden);
      const labels = visible.map(window.S21.rankLabel).join(' ');
      const chosen = p.hand.filter(card => selected.includes(card.id)).length;
      const detail = labels || '尚無明牌';
      const name = `${p.name}，${p.stopped ? '已停牌' : '牌局中'}，${p.hand.length} 張牌，明牌：${detail}${chosen ? `，已選 ${chosen} 張` : ''}`;
      return `<button type="button" class="opponent-tab${p.id === focused ? ' is-selected' : ''}" ${attribute}="${p.id}" aria-pressed="${p.id === focused}" aria-label="${escape(name)}" title="${escape(name)}"><span class="opponent-tab-heading"><strong>${escape(p.name)}</strong><span>${chosen ? `已選 ${chosen}` : `${p.stopped ? '已停牌' : '持牌'} · ${p.hand.length}張`}</span></span><span class="opponent-tab-cards">${visible.length ? visible.map(c => `<span class="rank-chip${['♥','♦'].includes(c.suit) ? ' red' : ''}">${escape(window.S21.rankLabel(c))}</span>`).join('') : escape(detail)}</span></button>`;
    }).join('');
  };

  window.S21OpponentPanel = function (gridId) {
    const grid = document.getElementById(gridId), placeholder = document.createComment('opponent hand position');
    grid.before(placeholder);
    const dialog = document.createElement('dialog');
    dialog.className = 'opponent-dialog'; dialog.id = `${gridId}-dialog`;
    dialog.setAttribute('aria-label', '對手完整手牌');
    dialog.innerHTML = '<div class="opponent-dialog-heading"><strong>對手完整手牌</strong><button type="button" class="secondary-button" data-panel-close>返回我的手牌</button></div><div class="opponent-tabs panel-tabs"></div><div class="panel-hand"></div><div class="panel-actions action-bar"></div>';
    let content = ['', '', '對手完整手牌'];
    function paint() {
      dialog.querySelector('.panel-tabs').innerHTML = content[0];
      dialog.querySelector('.panel-tabs').style.setProperty('--opponents', dialog.querySelector('.panel-tabs').children.length);
      dialog.querySelector('.panel-actions').innerHTML = content[1];
      dialog.querySelector('.opponent-dialog-heading strong').textContent = content[2];
    }
    placeholder.parentNode.append(dialog);
    function close() { if (dialog.open) dialog.close(); }
    dialog.querySelector('[data-panel-close]').addEventListener('click', close);
    dialog.addEventListener('close', () => { if (dialog.open) return; placeholder.after(grid); dialog.querySelector('.panel-tabs').innerHTML = ''; dialog.querySelector('.panel-actions').innerHTML = ''; window.dispatchEvent(new Event('s21:opponent-panel')); });
    const mobile = matchMedia('(max-width:700px)');
    mobile.addEventListener('change', close);
    return {
      get isOpen() { return dialog.open; },
      show() {
        if (!mobile.matches || dialog.open) return;
        paint(); dialog.querySelector('.panel-hand').append(grid); dialog.showModal();
        window.dispatchEvent(new Event('s21:opponent-panel'));
      },
      close,
      update(tabs, actions, title) {
        content = [tabs, actions, title]; if (dialog.open) paint();
      }
    };
  };
})();
