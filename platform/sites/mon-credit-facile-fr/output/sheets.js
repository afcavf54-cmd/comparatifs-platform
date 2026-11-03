// ============================================================
// GOOGLE SHEETS SYNC — cadeauclic.com
// URL CSV : à jour à chaque visite, aucun backend requis
// ============================================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTME0FHxMGhf6OloQTGMz4b7ST3X_2REAKQWr3ddYp2NvnJvSxEF9JYRQVc1kf_D4spfoNR_HbmrpkG/pub?output=csv";

// Parse CSV brut → tableau d'objets
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    // Gestion des virgules dans les champs entre guillemets
    const cols = [];
    let cur = '', inQ = false;
    for (let ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(r => r.slug && r.slug !== '');
}

// Charge et retourne les données du Sheet sous forme { slug: {...} }
async function loadSheetData() {
  try {
    const res = await fetch(SHEET_CSV_URL + '&t=' + Date.now()); // cache-bust
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    const map = {};
    rows.forEach(r => { map[r.slug] = r; });
    console.log('[Sheets] ' + rows.length + ' modèles chargés depuis Google Sheets');
    return map;
  } catch (e) {
    console.warn('[Sheets] Fallback données statiques (' + e.message + ')');
    return null;
  }
}

// Applique les données Sheet sur une page comparatif (pages/*.html)
// nameA et nameB = noms complets des modèles ("Cybex Balios S")
function applyToComparePage(sheetData, slugA, slugB) {
  if (!sheetData) return;

  const dA = sheetData[slugA];
  const dB = sheetData[slugB];

  [{ d: dA, slug: slugA, idx: 'a' }, { d: dB, slug: slugB, idx: 'b' }].forEach(({ d, slug, idx }) => {
    if (!d) return;

    // --- Prix ---
    document.querySelectorAll('[data-price-' + idx + ']').forEach(el => {
      el.textContent = d.prix ? d.prix + '€' : el.textContent;
      if (d.promo && d.promo !== '') {
        const promoEl = el.closest('.model-price');
        if (promoEl) {
          const old = document.createElement('span');
          old.style.cssText = 'text-decoration:line-through;color:#A09890;font-size:14px;font-weight:400;margin-right:6px';
          old.textContent = d.promo + '€';
          promoEl.prepend(old);
        }
      }
    });

    // --- Prix dans le tableau comparatif ---
    document.querySelectorAll('[data-table-price-' + idx + ']').forEach(el => {
      if (d.prix) el.innerHTML = '<strong>' + d.prix + '€</strong>' + (d.promo ? ' <span style="text-decoration:line-through;color:#A09890;font-size:12px">' + d.promo + '€</span>' : '');
    });

    // --- Liens Amazon ---
    document.querySelectorAll('[data-amz-' + idx + ']').forEach(el => {
      if (d.url_amazon && d.url_amazon !== '') {
        el.href = d.url_amazon;
        el.removeAttribute('aria-disabled');
        el.style.opacity = '';
      }
    });

    // --- Photos ---
    document.querySelectorAll('[data-photo-' + idx + ']').forEach(el => {
      if (d.photo_url && d.photo_url !== '') {
        el.src = d.photo_url;
        el.style.display = 'block';
      }
    });

    // --- Note Amazon ---
    document.querySelectorAll('[data-note-' + idx + ']').forEach(el => {
      if (d.note_amazon) el.textContent = d.note_amazon + '/5';
    });

    // --- Disponibilité ---
    if (d.disponible === '0') {
      document.querySelectorAll('[data-amz-' + idx + ']').forEach(el => {
        el.style.opacity = '0.4';
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-disabled', 'true');
        el.textContent = '⚠ Indisponible sur Amazon';
      });
    }
  });

  // Prix dans les selects du comparateur (index.html uniquement)
  if (window.MODELS) {
    Object.keys(sheetData).forEach(slug => {
      const d = sheetData[slug];
      const nomComplet = Object.keys(window.MODELS).find(n => toSlug(n) === slug);
      if (nomComplet && window.MODELS[nomComplet]) {
        if (d.prix) window.MODELS[nomComplet].price = d.prix;
        if (d.url_amazon) window.MODELS[nomComplet].amazon = d.url_amazon;
        if (d.photo_url) window.MODELS[nomComplet].photo = d.photo_url;
        if (d.note_amazon) window.MODELS[nomComplet].stars = d.note_amazon;
        if (d.disponible === '0') window.MODELS[nomComplet].unavailable = true;
      }
    });
    // Rerender les selects avec prix à jour
    if (typeof refreshSelects === 'function') refreshSelects();
  }
}

// Applique les données Sheet sur la page index (comparateur)
function applyToIndexPage(sheetData) {
  if (!sheetData || !window.MODELS) return;
  applyToComparePage(sheetData, null, null); // déclenche la mise à jour MODELS
}

function toSlug(s) {
  return s.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[éèê]/g, 'e')
    .replace(/[àâ]/g, 'a')
    .replace(/[ùû]/g, 'u')
    .replace(/[^a-z0-9-]/g, '');
}

// Loader visuel
function showLoader() {
  const el = document.getElementById('sheet-loader');
  if (el) el.style.display = 'flex';
}
function hideLoader() {
  const el = document.getElementById('sheet-loader');
  if (el) el.style.display = 'none';
}
