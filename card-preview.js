(function () {
  'use strict';
  const dialog = document.getElementById('card-preview-dialog');
  const title = document.getElementById('card-preview-title');
  const picture = document.getElementById('card-preview-image');
  const artFor = id => window.S21_CARD_ART?.[id] || `assets/cards/${encodeURIComponent(id)}.webp`;
  document.querySelectorAll('[data-hero-art]').forEach(img => { img.src = artFor(img.dataset.heroArt); });
  document.addEventListener('click', event => {
    const card = event.target.closest('[data-view-card]');
    if (!card || dialog.open) return;
    const label = card.dataset.viewLabel || card.getAttribute('aria-label') || '牌面';
    title.textContent = label;
    picture.src = artFor(card.dataset.viewCard);
    picture.alt = `${label}的放大牌面`;
    dialog.showModal();
    window.dispatchEvent(new CustomEvent('s21:preview-visibility', { detail: { open: true } }));
  });
  document.getElementById('card-preview-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    window.dispatchEvent(new CustomEvent('s21:preview-visibility', { detail: { open: false } }));
  });
})();
