/* Captain Parrainage — header + footer communs injectés (harmonisation de
   toutes les pages). Autonome, aucune dépendance. Remplace le <header> et le
   <footer> existants s'il y en a, sinon les ajoute. Logo = /logo.png (avec
   repli texte si absent). */
(function () {
  'use strict';
  var LINKS = [
    { href: '/', label: 'Accueil' },
    { href: '/offres/', label: 'Meilleures offres' },
    { href: '/#comment-ca-marche', label: 'Comment ça marche' }
  ];
  var path = location.pathname.replace(/\/+$/, '') || '/';

  function logoHTML(h) {
    return '<a href="/" aria-label="Captain Parrainage" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
      '<img src="/logo.png" alt="Captain Parrainage" style="height:' + h + 'px;width:auto;object-fit:contain;display:block" ' +
      'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{innerHTML:\'Captain<span style=&quot;color:#13BFA6&quot;>Parrainage</span>\',style:\'font:600 20px/1.02 Lexend,sans-serif;color:#fff;letter-spacing:-0.01em\'}))">' +
    '</a>';
  }

  function header() {
    var nav = LINKS.map(function (l) {
      var active = (l.href.replace(/\/+$/, '') || '/') === path;
      return '<a href="' + l.href + '" style="color:#fff;text-decoration:none;padding:10px 0;border-bottom:3px solid ' + (active ? '#13BFA6' : 'transparent') + '">' + l.label + '</a>';
    }).join('');
    var h = document.createElement('header');
    h.setAttribute('data-cp-chrome', '1');
    h.style.cssText = 'position:sticky;top:0;z-index:30;background:#082044;border-bottom:1px solid rgba(255,255,255,0.08)';
    h.innerHTML =
      '<div style="max-width:1200px;margin:0 auto;padding:0 clamp(16px,4vw,40px);height:76px;display:flex;align-items:center;gap:clamp(16px,3vw,40px)">' +
        logoHTML(42) +
        '<nav class="cp-chrome-nav" aria-label="Navigation principale" style="flex:0 0 auto;white-space:nowrap;display:flex;gap:32px;font:600 13px/1 Lexend,sans-serif;text-transform:uppercase;letter-spacing:0.08em;background:transparent;position:static;height:auto;padding:0;top:auto">' + nav + '</nav>' +
        '<a href="/inscription/" style="margin-left:auto;flex:0 0 auto;display:inline-flex;align-items:center;height:44px;padding:0 clamp(14px,3vw,20px);border-radius:999px;background:#F9BD43;color:#082044;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;font:600 13px/1 Lexend,sans-serif;white-space:nowrap">Recevoir les offres gratuites</a>' +
      '</div>';
    return h;
  }

  function footer() {
    var f = document.createElement('footer');
    f.setAttribute('data-cp-chrome', '1');
    f.style.cssText = 'background:#082044;color:#C9D4E5;padding:clamp(36px,5vw,56px) 0 28px;font-family:Lexend,system-ui,sans-serif';
    f.innerHTML =
      '<div style="max-width:1200px;margin:0 auto;padding:0 clamp(16px,4vw,40px);display:flex;flex-wrap:wrap;gap:28px 48px;justify-content:space-between">' +
        '<div style="flex:1 1 260px;min-width:0">' +
          '<div style="margin-bottom:12px">' + logoHTML(40) + '</div>' +
          '<p style="margin:0;max-width:340px;font:400 13px/1.6 Lexend,sans-serif;color:#8FA2BE">Les meilleures offres de parrainage et primes de bienvenue, sélectionnées chaque semaine. Certaines récupérables sans dépôt.</p>' +
        '</div>' +
        '<nav aria-label="Pied de page" style="display:flex;gap:40px;flex-wrap:wrap;background:transparent;position:static;height:auto;padding:0;top:auto;z-index:auto;align-items:flex-start">' +
          '<div style="display:flex;flex-direction:column;gap:10px;font:400 14px/1 Lexend,sans-serif">' +
            '<span style="font:600 12px/1 Lexend,sans-serif;text-transform:uppercase;letter-spacing:0.08em;color:#6E809C;margin-bottom:2px">Navigation</span>' +
            '<a href="/" style="color:#C9D4E5;text-decoration:none">Accueil</a>' +
            '<a href="/offres/" style="color:#C9D4E5;text-decoration:none">Meilleures offres</a>' +
            '<a href="/inscription/" style="color:#C9D4E5;text-decoration:none">Inscription</a>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:10px;font:400 14px/1 Lexend,sans-serif">' +
            '<span style="font:600 12px/1 Lexend,sans-serif;text-transform:uppercase;letter-spacing:0.08em;color:#6E809C;margin-bottom:2px">Informations</span>' +
            '<a href="/mentions-legales" style="color:#C9D4E5;text-decoration:none">Mentions légales</a>' +
            '<a href="/politique-confidentialite" style="color:#C9D4E5;text-decoration:none">Politique de confidentialité</a>' +
            '<a href="/contact" style="color:#C9D4E5;text-decoration:none">Contact</a>' +
          '</div>' +
        '</nav>' +
      '</div>' +
      '<div style="max-width:1200px;margin:28px auto 0;padding:18px clamp(16px,4vw,40px) 0;border-top:1px solid rgba(255,255,255,0.08);font:400 12px/1.5 Lexend,sans-serif;color:#6E809C">© ' + new Date().getFullYear() + ' Captain Parrainage</div>';
    return f;
  }

  function apply() {
    if (!document.getElementById('cp-chrome-style')) {
      var st = document.createElement('style'); st.id = 'cp-chrome-style';
      st.textContent = '@media (max-width:820px){.cp-chrome-nav{display:none !important}}';
      document.head.appendChild(st);
    }
    var oldH = document.querySelector('header:not([data-cp-chrome])');
    var newH = header();
    if (oldH) oldH.replaceWith(newH); else document.body.insertBefore(newH, document.body.firstChild);
    var oldF = document.querySelector('footer:not([data-cp-chrome])');
    var newF = footer();
    if (oldF) oldF.replaceWith(newF); else document.body.appendChild(newF);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
