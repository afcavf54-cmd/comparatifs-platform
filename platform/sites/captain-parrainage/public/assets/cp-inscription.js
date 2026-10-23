/* Captain Parrainage — page d'inscription dédiée (rappel primes + formulaire) */
(function () {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function setAll(sel, v) { all(sel).forEach(function (e) { e.textContent = v; }); }

  function successPanel(email) {
    return '<div style="text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;padding:8px 0">' +
      '<span style="width:56px;height:56px;border-radius:50%;background:#E3F7F3;color:#0B7F6F;display:grid;place-items:center;font-size:26px">✉️</span>' +
      '<p style="margin:0;font:600 20px/1.2 Lexend,sans-serif;color:#142B4F">Plus qu’une étape : confirmez votre email</p>' +
      '<p style="margin:0;font:400 14px/1.5 Lexend,sans-serif;color:#5B6B84">Nous venons d’envoyer un lien de confirmation à <strong>' + CP.esc(email) + '</strong>. Cliquez dessus pour créer votre mot de passe et débloquer la liste complète.</p>' +
      '<p style="margin:0;font:400 12px/1.4 Lexend,sans-serif;color:#7A89A1">Pensez à vérifier vos spams. Le lien expire après quelques minutes.</p>' +
    '</div>';
  }

  function flash(form, msg) {
    if (!form) { alert(msg); return; }
    var el = form.querySelector('.cp-flash');
    if (!el) { el = document.createElement('div'); el.className = 'cp-flash'; el.style.cssText = 'font:500 13px/1.4 Lexend,sans-serif;color:#D90F22;background:#FDE7E8;border-radius:12px;padding:10px 12px'; form.appendChild(el); }
    el.textContent = msg;
  }

  async function boot() {
    if (!window.CP) return;
    // Déjà connecté → direction l'espace membre.
    var session = null; try { session = await CP.getSession(); } catch (e) {}
    if (session) { window.location.href = '/membre/'; return; }

    // Rappel dynamique des primes.
    var s = null; try { s = await CP.getStats(); } catch (e) {}
    if (s) {
      setAll('.cp-total', CP.fmtEUR(s.total_montant));
      setAll('.cp-nodep', CP.fmtEUR(s.total_sans_depot_montant));
      setAll('.cp-count', s.total_offres);
    }

    // Formulaire d'inscription.
    all('form').forEach(function (form) {
      var email = form.querySelector('input[type="email"]'); if (!email) return;
      var consent = form.querySelector('input[type="checkbox"]');
      var btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var val = (email.value || '').trim();
        var ok = consent ? consent.checked : true;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val)) { flash(form, 'Saisissez une adresse email valide.'); return; }
        if (!ok) { flash(form, 'Cochez la case pour accepter de recevoir nos emails.'); return; }
        var old = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Envoi en cours…'; }
        try {
          await CP.signup(val, ok);
          form.innerHTML = ''; form.insertAdjacentHTML('afterbegin', successPanel(val));
        } catch (e) {
          flash(form, (e && e.message) || 'Une erreur est survenue, réessayez.');
          if (btn) { btn.disabled = false; btn.textContent = old; }
        }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
