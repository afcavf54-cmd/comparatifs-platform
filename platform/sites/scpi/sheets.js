// ============================================================
// SHEETS SYNC — UTL Peipin / Comparatif SCPI
// Rôle minimal : liens d'affiliation uniquement
// Toutes les données sont dans le HTML (générées statiquement)
// ============================================================

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTSv0469bN0_2nPikgVhe825g74RbMjaVZFvjJnDSydA-C98NcrCJJiHZdX8-V9xeMW-cklNBRou3vK/pub?gid=0&single=true&output=csv";

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cols = []; let cur = '', inQ = false;
    for (let ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(r => r.slug);
}

async function loadSheetData() {
  try {
    const res = await fetch(SHEET_CSV_URL + '&t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const map = {};
    parseCSV(await res.text()).forEach(r => { map[r.slug] = r; });
    return map;
  } catch (e) {
    console.warn('[Sheets] ' + e.message);
    return null;
  }
}

function applyToComparePage(data, slugA, slugB) {
  if (!data) return;
  [{ slug: slugA, idx: 'a' }, { slug: slugB, idx: 'b' }].forEach(({ slug, idx }) => {
    const d = data[slug];
    if (!d) return;
    if (d.url_affiliation) {
      document.querySelectorAll('[data-amz-' + idx + ']').forEach(el => { el.href = d.url_affiliation; });
    }
    if (d.disponible === '0') {
      document.querySelectorAll('[data-amz-' + idx + ']').forEach(el => {
        el.style.opacity = '0.4'; el.style.pointerEvents = 'none';
        el.textContent = '⚠ Temporairement indisponible';
      });
    }
  });
}

function showLoader() { const el = document.getElementById('sheet-loader'); if (el) el.style.display = 'flex'; }
function hideLoader() { const el = document.getElementById('sheet-loader'); if (el) el.style.display = 'none'; }
