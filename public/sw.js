const CACHE='community-atlas-shell-v2';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/manifest.webmanifest','/icons/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim();});
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/'))return; if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/')));} });
