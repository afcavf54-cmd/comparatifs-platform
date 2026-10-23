/* Captain Parrainage — page Offres / Espace membre (cartes maquette + Supabase)
   Mode : window.CP_MODE === 'member' (espace membre, gated, tout débloqué)
          sinon public (aperçu acces_libre + section verrou). */
(function () {
  'use strict';
  var MODE = window.CP_MODE || 'public';
  function $(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function hue(str) { var h = 0, s = String(str || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function logoBg(o) { return o.couleur || ('oklch(0.5 0.13 ' + hue(o.marque) + ')'); }
  function typeTag(o) { return o.type_prime ? ' · ' + CP.esc(o.type_prime) : ''; }
  function dontLine(o) {
    var m = Number(o.montant_sans_depot) || 0;
    return m > 0 ? '<p style="margin:4px 0 0;font:700 13px/1.2 Lexend,sans-serif;color:#D90F22">dont ' + CP.fmtEUR(m) + ' sans dépôt</p>' : '';
  }

  function condBullets(o) {
    var raw = (o.conditions || '').split(/\r?\n|\s*[;•·]\s*/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 4);
    if (!raw.length) return '';
    var check = '<span aria-hidden="true" style="color:#0B7F6F"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;vertical-align:-3px"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></span>';
    return '<ul aria-label="Conditions" style="list-style:none;margin:0;padding:14px 0 0;border-top:1px solid #EEF2F7;display:flex;flex-direction:column;gap:8px">' +
      raw.map(function (c) { return '<li style="display:flex;gap:8px;font:400 14px/1.4 Lexend,sans-serif;color:#3D4F6B">' + check + '<span>' + CP.esc(c) + '</span></li>'; }).join('') + '</ul>';
  }

  function badges(o) {
    var b = '';
    if (o.nouveau) b += '<span style="padding:5px 10px;border-radius:999px;background:#FFF3DA;color:#7A5300;font:600 12px/1 Lexend,sans-serif">Nouveau</span>';
    b += o.sans_depot
      ? '<span style="padding:5px 10px;border-radius:999px;background:#E3F7F3;color:#0B7F6F;font:600 12px/1 Lexend,sans-serif">Sans dépôt</span>'
      : '<span style="padding:5px 10px;border-radius:999px;background:#FFF3DA;color:#7A5300;font:600 12px/1 Lexend,sans-serif">Dépôt requis</span>';
    return b;
  }

  function fullCard(o) {
    var logo = o.logo_url
      ? '<span style="flex:0 0 auto;width:48px;height:48px;border-radius:14px;overflow:hidden;display:block"><img src="' + CP.esc(o.logo_url) + '" alt="" style="width:100%;height:100%;object-fit:cover"></span>'
      : '<span style="flex:0 0 auto;width:48px;height:48px;border-radius:14px;background:' + CP.esc(logoBg(o)) + ';color:#fff;display:grid;place-items:center;font:500 16px/1 Lexend,sans-serif"><span>' + CP.esc(CP.initials(o.marque)) + '</span></span>';
    var verif = o.verifie_le ? '<span style="font:400 12px/1 Lexend,sans-serif;color:#7A89A1">Vérifiée le ' + CP.esc(CP.fmtDate(o.verifie_le)) + '</span>' : '<span></span>';
    return '<li data-cat="' + CP.esc(o.categorie || 'Autres') + '" style="background:#fff;border-radius:24px;padding:22px;border:1px solid #E6ECF4;box-shadow:0 8px 24px rgba(8,32,68,0.06);display:flex;flex-direction:column;gap:16px">' +
      '<div style="display:flex;align-items:center;gap:12px">' + logo +
        '<div style="flex:1 1 0%;min-width:0"><h2 style="margin:0;font:500 17px/1.25 Lexend,sans-serif">' + CP.esc(o.marque) + '</h2>' +
        '<p style="margin:3px 0 0;font:400 13px/1.3 Lexend,sans-serif;color:#5B6B84">' + CP.esc(o.categorie || '') + typeTag(o) + '</p></div>' +
      '</div>' +
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><p style="margin:0 0 4px;font:400 13px/1.3 Lexend,sans-serif;color:#5B6B84">Prime jusqu\'à</p>' +
        '<p style="margin:0;font:500 40px/1 Lexend,sans-serif;letter-spacing:-0.02em">' + (o.montant ? CP.fmtEUR(o.montant) : '—') + '</p>' + dontLine(o) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + badges(o) + '</div>' +
      '</div>' +
      condBullets(o) +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:auto;padding-top:4px">' + verif +
        '<a href="' + CP.esc(o.lien || '#') + '" target="_blank" rel="nofollow noopener" style="padding:11px 20px;border-radius:999px;background:#F9BD43;color:#082044;text-transform:uppercase;letter-spacing:0.06em;font:600 13px/1 Lexend,sans-serif">Voir l\'offre</a>' +
      '</div></li>';
  }

  // Carte "verrouillée" : vraie carte avec marque + logo + conditions FLOUTÉS
  // (on n'a pas la marque/le lien côté anonyme), montant/catégorie/badges nets.
  // Se "défloute" automatiquement une fois connecté : la page affiche alors la
  // carte complète (fullCard) à la place.
  function lockedTeaser(o) {
    var logo = '<span style="position:relative;flex:0 0 auto;width:48px;height:48px;display:block">' +
        '<span style="position:absolute;inset:0;border-radius:14px;background:linear-gradient(135deg,#9fb2cf,#c9d6e8);filter:blur(6px)"></span>' +
        '<span style="position:absolute;inset:0;display:grid;place-items:center;color:#142B4F"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg></span>' +
      '</span>';
    return '<li data-cat="' + CP.esc(o.categorie || 'Autres') + '" style="background:#fff;border-radius:24px;padding:22px;border:1px solid #E6ECF4;box-shadow:0 8px 24px rgba(8,32,68,0.06);display:flex;flex-direction:column;gap:16px">' +
      '<div style="display:flex;align-items:center;gap:12px">' + logo +
        '<div style="flex:1 1 0%;min-width:0">' +
          '<h2 style="margin:0;font:500 17px/1.25 Lexend,sans-serif;color:#8A99B1;filter:blur(5px);user-select:none">Banque Partenaire</h2>' +
          '<p style="margin:3px 0 0;font:400 13px/1.3 Lexend,sans-serif;color:#5B6B84">' + CP.esc(o.categorie || '') + typeTag(o) + '</p></div>' +
      '</div>' +
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><p style="margin:0 0 4px;font:400 13px/1.3 Lexend,sans-serif;color:#5B6B84">Prime jusqu\'à</p>' +
        '<p style="margin:0;font:500 40px/1 Lexend,sans-serif;letter-spacing:-0.02em">' + (o.montant ? CP.fmtEUR(o.montant) : '•••') + '</p>' + dontLine(o) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + badges(o) + '</div></div>' +
      '<div style="padding:14px 0 0;border-top:1px solid #EEF2F7;display:flex;flex-direction:column;gap:8px;filter:blur(3px);user-select:none">' +
        '<span style="height:10px;border-radius:6px;background:#EEF2F7;width:85%"></span><span style="height:10px;border-radius:6px;background:#EEF2F7;width:65%"></span></div>' +
      '<a href="/#inscription" style="margin-top:auto;text-align:center;padding:11px 20px;border-radius:999px;background:#142B4F;color:#fff;text-transform:uppercase;letter-spacing:0.06em;font:600 13px/1 Lexend,sans-serif">🔒 Débloquer l\'offre</a></li>';
  }

  function setStats(s) {
    if (!s) return;
    all('.cp-total').forEach(function (e) { e.textContent = CP.fmtEUR(s.total_montant); });
    all('.cp-nodep').forEach(function (e) { e.textContent = CP.fmtEUR(s.total_sans_depot_montant); });
    var total = s.total_offres, free = s.acces_libre_offres || 0, locked = (s.verrouillees != null ? s.verrouillees : 0);
    all('.cp-count').forEach(function (e) { e.textContent = total; });
    all('.cp-free').forEach(function (e) { e.textContent = free; });
    all('.cp-locked').forEach(function (e) { e.textContent = locked; });
  }

  function renderFilters(offers, onPick) {
    var box = $('#cpFilters'); if (!box) return;
    var cats = {}; offers.forEach(function (o) { var c = o.categorie || 'Autres'; cats[c] = (cats[c] || 0) + 1; });
    var mk = function (label, val, n, active) {
      return '<button type="button" data-f="' + CP.esc(val) + '" style="height:40px;padding:0 16px;border-radius:999px;border:1.5px solid ' + (active ? '#142B4F' : '#D8E1EE') + ';background:' + (active ? '#142B4F' : '#fff') + ';color:' + (active ? '#fff' : '#142B4F') + ';font:500 13px/1 Lexend,sans-serif;cursor:pointer;white-space:nowrap">' + CP.esc(label) + (n != null ? ' · ' + n : '') + '</button>';
    };
    var html = mk('Toutes les offres', '', offers.length, true);
    Object.keys(cats).forEach(function (c) { html += mk(c, c, cats[c], false); });
    box.innerHTML = html;
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-f]'); if (!b) return;
      all('button[data-f]', box).forEach(function (x) { x.style.background = '#fff'; x.style.color = '#142B4F'; x.style.borderColor = '#D8E1EE'; });
      b.style.background = '#142B4F'; b.style.color = '#fff'; b.style.borderColor = '#142B4F';
      onPick(b.getAttribute('data-f'));
    });
  }

  async function boot() {
    if (!window.CP) return;
    var session = null; try { session = await CP.getSession(); } catch (e) {}
    // L'espace membre exige une connexion. La page publique NE redirige PLUS :
    // elle affiche tout et "défloute" sur place dès qu'on est connecté.
    if (MODE === 'member' && !session) { window.location.href = '/connexion/'; return; }

    var s = null; try { s = await CP.getStats(); } catch (e) {}
    setStats(s);

    var grid = $('#cpOffresList');
    var lockedGrid = $('#cpLockedList');
    var offers = [], teasers = [];
    if (session) {
      // Connecté : accès complet, toutes les offres en clair (RLS : authenticated voit tout).
      try { offers = await CP.getOffers(); } catch (e) {}
    } else {
      try { offers = await CP.getOffers(); } catch (e) {}            // acces_libre (complètes)
      try { teasers = await CP.getOffersPublic(); } catch (e) {}      // toutes (teaser), on garde les verrouillées → floutées
      teasers = teasers.filter(function (o) { return !o.acces_libre; });
    }
    // Section "débloquer la liste" : seulement pour les visiteurs non connectés
    // ayant des offres verrouillées à débloquer.
    var deb = $('#debloquer'); if (deb) deb.style.display = (!session && teasers.length > 0) ? '' : 'none';
    var cats = offers.concat(teasers);
    function paint(filter) {
      if (grid) {
        var it = filter ? offers.filter(function (o) { return (o.categorie || 'Autres') === filter; }) : offers;
        grid.innerHTML = it.map(fullCard).join('') || '<p style="color:#7A89A1;padding:10px">Aucune offre dans cette catégorie.</p>';
      }
      if (lockedGrid) {
        var lt = filter ? teasers.filter(function (o) { return (o.categorie || 'Autres') === filter; }) : teasers;
        lockedGrid.innerHTML = lt.map(lockedTeaser).join('');
      }
    }
    paint('');
    renderFilters(cats, paint);

    // Form d'inscription éventuel (CTA bas de page publique)
    all('form').forEach(function (form) {
      var email = form.querySelector('input[type=email]'); if (!email) return;
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var val = (email.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) { return; }
        var btn = form.querySelector('button[type=submit]'); if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }
        try { await CP.signup(val, true); if (btn) btn.textContent = 'Email envoyé ✓ vérifiez votre boîte'; }
        catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Réessayer'; } }
      });
    });

    // Espace membre : bouton déconnexion éventuel
    var lo = $('#cpLogout'); if (lo) lo.addEventListener('click', async function () { await CP.logout(); window.location.href = '/'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
