/* ===========================================================================
   Captain Parrainage — logique partagée (Supabase + data + auth)
   Dépend de : window.CP_CONFIG ({url,key,site}) défini inline AVANT ce script,
   et de @supabase/supabase-js (UMD) chargé AVANT ce script (window.supabase).
   =========================================================================== */
(function () {
  'use strict';
  // Config : window.CP_CONFIG (injecté par la home Jinja) sinon fallback
  // (clés publiques — mêmes valeurs que le config.yaml ; à garder synchro).
  var cfg = window.CP_CONFIG || {
    url: 'https://mwdvflviamvagftpotgx.supabase.co',
    key: 'sb_publishable_hEyZDIt6QnDLn89HVrGUpw_AkvBdnuR',
    site: 'https://www.captain-parrainage.com'
  };
  var sb = null;
  try {
    if (window.supabase && cfg.url && cfg.key) {
      sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
  } catch (e) { console.error('[CP] init supabase', e); }

  var SITE = (cfg.site || '').replace(/\/+$/, '');

  function fmtEUR(n) {
    n = Number(n) || 0;
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  }
  function fmtDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch (e) { return d; }
  }

  // ── Données ──────────────────────────────────────────────────────────────
  async function getStats() {
    if (!sb) return null;
    var r = await sb.rpc('get_parrainages_stats');
    if (r.error) { console.error('[CP] stats', r.error); return null; }
    return r.data;
  }
  // Offres teaser (anon) : montant/catégorie visibles, marque+lien masqués.
  async function getOffersPublic() {
    if (!sb) return [];
    var r = await sb.rpc('get_offers_public');
    if (r.error) { console.error('[CP] offers_public', r.error); return []; }
    return r.data || [];
  }
  // RLS décide : anon → seulement acces_libre ; membre connecté → tout.
  async function getOffers() {
    if (!sb) return [];
    var r = await sb.from('parrainages').select('*').eq('actif', true)
      .order('en_avant', { ascending: false }).order('ordre', { ascending: true }).order('montant', { ascending: false });
    if (r.error) { console.error('[CP] offers', r.error); return []; }
    return r.data || [];
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function getSession() {
    if (!sb) return null;
    var r = await sb.auth.getSession();
    return r.data ? r.data.session : null;
  }
  // Inscription : envoie un lien de confirmation (magic link) qui ramène sur /confirmer/
  async function signup(email, consent) {
    if (!sb) throw new Error('Service indisponible.');
    var r = await sb.auth.signInWithOtp({
      email: email,
      options: {
        emailRedirectTo: SITE + '/confirmer/',
        data: { newsletter_opt_in: !!consent }
      }
    });
    if (r.error) throw r.error;
    return true;
  }
  async function setPassword(pw) {
    if (!sb) throw new Error('Service indisponible.');
    var r = await sb.auth.updateUser({ password: pw });
    if (r.error) throw r.error;
    return true;
  }
  async function login(email, pw) {
    if (!sb) throw new Error('Service indisponible.');
    var r = await sb.auth.signInWithPassword({ email: email, password: pw });
    if (r.error) throw r.error;
    return r.data;
  }
  async function logout() { if (sb) await sb.auth.signOut(); }

  // ── Rendu carte offre ──────────────────────────────────────────────────────
  function offerCardHTML(o) {
    var depot = o.sans_depot
      ? '<span class="badge badge-teal">Sans dépôt</span>'
      : '<span class="badge badge-navy">Dépôt requis</span>';
    var neuf = o.nouveau ? '<span class="badge badge-gold">Nouveau</span>' : '';
    var logo = o.logo_url
      ? '<img class="offer-logo" src="' + esc(o.logo_url) + '" alt="' + esc(o.marque) + '" style="object-fit:cover">'
      : '<div class="offer-logo" style="background:' + esc(o.couleur || '#142B4F') + '">' + esc(initials(o.marque)) + '</div>';
    var montant = o.montant ? '<div class="offer-amount">Jusqu\'à ' + fmtEUR(o.montant) + '</div>' : '';
    return '' +
      '<div class="offer">' +
        '<div class="offer-top">' + logo +
          '<div><div class="offer-name">' + esc(o.marque) + '</div>' +
          (o.categorie ? '<div class="offer-cat">' + esc(o.categorie) + '</div>' : '') + '</div>' +
        '</div>' +
        montant +
        '<div class="offer-badges">' + neuf + depot + '</div>' +
        (o.conditions ? '<div class="offer-cond">' + esc(o.conditions) + '</div>' : '') +
        '<div class="offer-foot">' +
          '<span class="offer-verif">Vérifiée le ' + esc(fmtDate(o.verifie_le)) + '</span>' +
          '<a class="btn btn-gold" href="' + esc(o.lien) + '" target="_blank" rel="nofollow noopener">Voir l\'offre</a>' +
        '</div>' +
      '</div>';
  }
  // Carte verrouillée (données masquées — aucune vraie donnée exposée)
  function lockedCardHTML() {
    return '' +
      '<div class="offer locked">' +
        '<div class="offer-blur">' +
          '<div class="offer-top"><div class="offer-logo">★★</div><div><div class="offer-name">Offre premium</div><div class="offer-cat">Banque</div></div></div>' +
          '<div class="offer-amount">Jusqu\'à ••• €</div>' +
          '<div class="offer-badges"><span class="badge badge-teal">Sans dépôt</span></div>' +
        '</div>' +
        '<div class="lock-overlay"><div class="lock-ico">🔒</div><strong>Offre à débloquer</strong>' +
          '<a class="btn btn-navy" href="/#inscription">S\'inscrire gratuitement</a></div>' +
      '</div>';
  }

  window.CP = {
    sb: sb, cfg: cfg, site: SITE,
    fmtEUR: fmtEUR, esc: esc, initials: initials, fmtDate: fmtDate,
    getStats: getStats, getOffers: getOffers,
    getSession: getSession, signup: signup, setPassword: setPassword, login: login, logout: logout,
    getOffersPublic: getOffersPublic,
    offerCardHTML: offerCardHTML, lockedCardHTML: lockedCardHTML
  };
})();
