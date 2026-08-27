// Service worker push notifications (Viseoweb)
self.addEventListener('push', function(e){
  var d = {};
  try { d = e.data.json(); } catch(err){ d = { title: 'Notification', body: e.data ? e.data.text() : '' }; }
  var title = d.title || 'monelor.com';
  var opts = { body: d.body || '', icon: d.icon || '/favicon.png', badge: '/favicon.png',
               data: { url: d.url || '/' }, tag: d.tag || undefined };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({type:'window'}).then(function(cl){
    for (var i=0;i<cl.length;i++){ if(cl[i].url===url && 'focus' in cl[i]) return cl[i].focus(); }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
