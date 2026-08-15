// functions/p/[code].js — Page de partage d'une simulation de dividendes.
// Servie par Cloudflare Pages Functions sur monelor.com/p/<code>.
//
// Le <code> encode le portefeuille en base64url de "id:qty,id:qty,..." — donc
// AUCUNE base de données : la page est auto-suffisante et consultable pour toujours.
//
// Rôle : générer les balises Open Graph / Twitter CÔTÉ SERVEUR (pour que
// Facebook, X, LinkedIn affichent un bel aperçu), puis rediriger l'utilisateur
// vers le simulateur prérempli. Les robots lisent les balises, l'humain arrive
// sur le simulateur avec son portefeuille chargé.

const DATA_URL = 'https://raw.githubusercontent.com/afcavf54-cmd/comparatifs-platform/main/platform/sites/monelor-com/dividendes-actions.json';
const BASE = 'https://www.monelor.com';

function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtEur0(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n || 0));
}

export async function onRequest(context) {
  const code = context.params.code || '';

  let portfolio = '';
  try { portfolio = b64urlDecode(code); } catch (_) { portfolio = ''; }
  const pairs = portfolio.split(',')
    .map(p => { const [id, q] = p.split(':'); return { id: (id || '').trim(), qty: parseFloat(q) || 0 }; })
    .filter(p => p.id && p.qty > 0);

  // Valeurs par défaut (si le code est invalide)
  let title = 'Simulateur de dividendes — Monelor';
  let desc = "Estime les dividendes annuels de ton portefeuille d'actions et crée ta simulation gratuitement.";

  if (pairs.length) {
    try {
      const res = await fetch(DATA_URL, { cf: { cacheTtl: 300 } });
      const data = await res.json();
      const byId = {};
      (data.actions || []).forEach(a => { byId[String(a.id)] = a; });
      let divs = 0, invest = 0;
      const positions = [];
      pairs.forEach(p => {
        const a = byId[p.id];
        if (a) {
          const d = (Number(a.dividend) || 0) * p.qty;
          divs += d;
          invest += (Number(a.price) || 0) * p.qty;
          positions.push({ name: a.name, div: d });
        }
      });
      positions.sort((x, y) => y.div - x.div);
      const yieldPct = invest > 0 ? (divs / invest * 100) : 0;
      const medals = ['🥇', '🥈', '🥉'];
      const top = positions.slice(0, 3).map((p, i) => `${medals[i]} ${p.name}`).join(' · ');
      title = `Mon portefeuille génère ${fmtEur0(divs)} de dividendes par an`;
      desc = `Rendement ${yieldPct.toFixed(2).replace('.', ',')} %.${top ? ' ' + top + '.' : ''} Découvre la simulation et crée la tienne gratuitement sur Monelor.`;
    } catch (_) { /* on garde les valeurs par défaut */ }
  }

  const shareUrl = `${BASE}/p/${encodeURIComponent(code)}`;
  // Stage 1 : image statique. Stage 2 : remplacer par l'URL de l'image dynamique (@vercel/og).
  const ogImage = `${BASE}/og-dividendes.jpg`;
  const simUrl = `${BASE}/simulateur-dividendes/#p=${encodeURIComponent(portfolio)}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(shareUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Monelor">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(shareUrl)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta http-equiv="refresh" content="0; url=${esc(simUrl)}">
<script>location.replace(${JSON.stringify(simUrl)});</script>
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;color:#000921;background:#fff">
<p>Redirection vers le simulateur…</p>
<p><a href="${esc(simUrl)}">Voir la simulation</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
