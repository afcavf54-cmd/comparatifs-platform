/* Captain Parrainage — logique de la home (maquette) branchée Supabase */
(function () {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function setAll(sel, v) { all(sel).forEach(function (e) { e.textContent = v; }); }

  function hue(str) { var h = 0, s = String(str || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function logoBg(o) { return o.couleur || ('oklch(0.5 0.13 ' + hue(o.marque) + ')'); }

  // Carte offre compacte (markup identique à la maquette — aperçu hero)
  function heroCard(o) {
    var dep = o.sans_depot
      ? '<span style="padding:3px 8px;border-radius:999px;background:#E3F7F3;color:#0B7F6F;font:500 11px/1.2 Lexend,sans-serif">Sans dépôt</span>'
      : '<span style="padding:3px 8px;border-radius:999px;background:#FFF3DA;color:#7A5300;font:500 11px/1.2 Lexend,sans-serif">Dépôt requis</span>';
    var logo = o.logo_url
      ? '<span style="flex:0 0 auto;width:40px;height:40px;border-radius:12px;overflow:hidden;display:block"><img src="' + CP.esc(o.logo_url) + '" alt="" style="width:100%;height:100%;object-fit:cover"></span>'
      : '<span style="flex:0 0 auto;width:40px;height:40px;border-radius:12px;background:' + CP.esc(logoBg(o)) + ';color:#fff;display:grid;place-items:center;font:600 13px/1 Lexend,sans-serif"><span>' + CP.esc(CP.initials(o.marque)) + '</span></span>';
    return '<li style="flex:0 0 auto;height:104px;background:#fff;border-radius:18px;padding:14px 16px;border:1px solid #E6ECF4;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;align-items:center;gap:12px">' + logo +
        '<div style="flex:1 1 0%;min-width:0">' +
          '<p style="margin:0;font:500 15px/1.2 Lexend,sans-serif">' + CP.esc(o.marque) + '</p>' +
          '<p style="margin:2px 0 0;font:400 12px/1.2 Lexend,sans-serif;color:#5B6B84">' + CP.esc(o.categorie || '') + '</p>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<span style="font:600 24px/1 Lexend,sans-serif;letter-spacing:-0.02em">' + (o.montant ? CP.fmtEUR(o.montant) : '') + '</span>' + dep +
        '</div>' +
      '</div></li>';
  }

  // Carte verrouillée compacte (hero) : montant + catégorie visibles, marque masquée
  function lockedHeroCard(o) {
    var dep = o.sans_depot
      ? '<span style="padding:3px 8px;border-radius:999px;background:#E3F7F3;color:#0B7F6F;font:500 11px/1.2 Lexend,sans-serif">Sans dépôt</span>'
      : '<span style="padding:3px 8px;border-radius:999px;background:#FFF3DA;color:#7A5300;font:500 11px/1.2 Lexend,sans-serif">Dépôt requis</span>';
    return '<li style="position:relative;flex:0 0 auto;height:104px;background:#fff;border-radius:18px;padding:14px 16px;border:1px solid #E6ECF4;display:flex;flex-direction:column;gap:10px;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<span style="flex:0 0 auto;width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#9fb2cf,#c9d6e8);color:#fff;display:grid;place-items:center;font:600 15px/1 Lexend,sans-serif">★</span>' +
        '<div style="flex:1 1 0%;min-width:0">' +
          '<p style="margin:0;font:500 15px/1.2 Lexend,sans-serif;color:#8A99B1">Offre à débloquer</p>' +
          '<p style="margin:2px 0 0;font:400 12px/1.2 Lexend,sans-serif;color:#9CA9BE">' + CP.esc(o.categorie || '') + '</p>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<span style="font:600 24px/1 Lexend,sans-serif;letter-spacing:-0.02em;color:#142B4F">' + (o.montant ? CP.fmtEUR(o.montant) : '') + '</span>' + dep +
        '</div>' +
      '</div>' +
      '<span style="position:absolute;top:10px;right:12px;font-size:14px">🔒</span>' +
    '</li>';
  }

  function successPanel(email) {
    return '<div style="text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;padding:8px 0">' +
      '<span style="width:56px;height:56px;border-radius:50%;background:#E3F7F3;color:#0B7F6F;display:grid;place-items:center;font-size:26px">✉️</span>' +
      '<p style="margin:0;font:600 20px/1.2 Lexend,sans-serif;color:#142B4F">Plus qu’une étape : confirmez votre email</p>' +
      '<p style="margin:0;font:400 14px/1.5 Lexend,sans-serif;color:#5B6B84">Nous venons d’envoyer un lien de confirmation à <strong>' + CP.esc(email) + '</strong>. Cliquez dessus pour créer votre mot de passe et débloquer la liste complète.</p>' +
      '<p style="margin:0;font:400 12px/1.4 Lexend,sans-serif;color:#7A89A1">Pensez à vérifier vos spams. Le lien expire après quelques minutes.</p>' +
    '</div>';
  }

  async function boot() {
    if (!window.CP) return;

    // membre connecté → CTA vers l'espace
    var session = null; try { session = await CP.getSession(); } catch (e) {}
    if (session) {
      all('a[href="/connexion/"]').forEach(function (a) { a.href = '/membre/'; a.textContent = 'Mon espace'; });
    }

    // Stats
    var s = null; try { s = await CP.getStats(); } catch (e) {}
    if (s) {
      setAll('.cp-total', CP.fmtEUR(s.total_montant));
      setAll('.cp-nodep', CP.fmtEUR(s.total_sans_depot_montant));
      var total = s.total_offres, nodep = s.total_sans_depot_offres || 0, dep = Math.max(0, total - nodep),
          locked = (s.verrouillees != null ? s.verrouillees : total);
      // Compteur "N offres" (header aperçu + bouton) via hook explicite,
      // ce qui préserve l'icône SVG du bouton.
      setAll('.cp-count-total', total);
      // Onglets de la carte aperçu
      all('button').forEach(function (b) {
        var t = (b.textContent || '').trim();
        if (/^Toutes les offres/.test(t)) b.textContent = 'Toutes les offres · ' + total;
        else if (/^Sans dépôt ·/.test(t)) b.textContent = 'Sans dépôt · ' + nodep;
        else if (/^Avec dépôt ·/.test(t)) b.textContent = 'Avec dépôt · ' + dep;
      });
      // "+ N offres débloquées après inscription"
      all('span').forEach(function (sp) {
        if (sp.textContent === 'offres débloquées') { var p = sp.previousElementSibling; if (p) p.textContent = locked; }
      });
    }

    // Offres aperçu (hero) : vraies données. Les offres en accès libre
    // s'affichent avec leur marque (appât) ; les autres en teaser masqué
    // (montant + catégorie visibles, marque cachée) pour créer la frustration.
    // Les onglets Toutes / Sans dépôt / Avec dépôt filtrent la liste.
    var ul = $('#cpHeroOffers');
    if (ul) {
      var free = [], pub = [];
      try { free = await CP.getOffers(); } catch (e) {}
      try { pub = await CP.getOffersPublic(); } catch (e) {}
      var lockedOffers = pub.filter(function (o) { return !o.acces_libre; });
      // Repli : si la RPC teaser ne renvoie rien mais que les stats indiquent
      // des offres verrouillées, on affiche des cartes verrouillées génériques
      // (sans montant) pour que la frustration reste visible.
      if (!lockedOffers.length && s && s.verrouillees > 0) {
        for (var i = 0; i < s.verrouillees; i++) lockedOffers.push({ _generic: true });
      }
      // Liste unifiée {offre, verrouillée, sans_dépôt} pour le filtrage par onglet.
      var items = free.map(function (o) { return { o: o, locked: false, nodep: !!o.sans_depot }; })
        .concat(lockedOffers.map(function (o) { return { o: o, locked: true, nodep: !!o.sans_depot }; }));

      function renderHero(filter) {
        if (!items.length) return;
        var list = items.filter(function (x) {
          return filter === 'nodep' ? x.nodep : filter === 'dep' ? !x.nodep : true;
        });
        ul.innerHTML = list.length
          ? list.slice(0, 6).map(function (x) { return x.locked ? lockedHeroCard(x.o) : heroCard(x.o); }).join('')
          : '<li style="flex:0 0 auto;padding:28px 16px;text-align:center;color:#8A99B1;font:400 14px/1.4 Lexend,sans-serif">Aucune offre dans cette catégorie pour le moment.</li>';
      }

      // Onglets cliquables (Toutes / Sans dépôt / Avec dépôt)
      var tabs = [];
      all('button').forEach(function (b) {
        var t = (b.textContent || '').trim();
        if (/^Toutes les offres/.test(t)) tabs.push({ b: b, f: 'all' });
        else if (/^Sans dépôt/.test(t)) tabs.push({ b: b, f: 'nodep' });
        else if (/^Avec dépôt/.test(t)) tabs.push({ b: b, f: 'dep' });
      });
      function activate(f) {
        tabs.forEach(function (t) {
          var on = t.f === f;
          t.b.setAttribute('aria-pressed', on ? 'true' : 'false');
          t.b.style.background = on ? 'rgb(20, 43, 79)' : 'rgb(255, 255, 255)';
          t.b.style.color = on ? 'rgb(255, 255, 255)' : 'rgb(20, 43, 79)';
          t.b.style.borderColor = on ? 'rgb(20, 43, 79)' : 'rgb(216, 225, 238)';
        });
        renderHero(f);
      }
      tabs.forEach(function (t) { t.b.addEventListener('click', function () { activate(t.f); }); });

      renderHero('all');
    }

    // Form
    var form = $('#cpForm');
    if (form) {
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var email = ($('#cpEmail').value || '').trim();
        var consent = $('#cpConsent') ? $('#cpConsent').checked : true;
        var btn = $('#cpBtn');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { flash('Saisissez une adresse email valide.'); return; }
        if (!consent) { flash('Cochez la case pour accepter de recevoir nos emails.'); return; }
        var old = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }
        try {
          await CP.signup(email, consent);
          form.innerHTML = ''; form.insertAdjacentHTML('afterbegin', successPanel(email));
        } catch (e) {
          flash((e && e.message) || 'Une erreur est survenue, réessayez.');
          if (btn) { btn.disabled = false; btn.textContent = old; }
        }
      });
    }
  }

  function flash(msg) {
    var form = document.getElementById('cpForm'); if (!form) { alert(msg); return; }
    var el = form.querySelector('.cp-flash');
    if (!el) { el = document.createElement('div'); el.className = 'cp-flash'; el.style.cssText = 'font:500 13px/1.4 Lexend,sans-serif;color:#D90F22;background:#FDE7E8;border-radius:12px;padding:10px 12px'; form.appendChild(el); }
    el.textContent = msg;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
