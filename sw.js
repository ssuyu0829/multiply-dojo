/* ============================================================
   sw.js — 讓遊戲離線也能玩
   ------------------------------------------------------------
   改版時把 VERSION 加一，舊快取會自動清掉。
   ============================================================ */

const VERSION = 'dojo-v3';   // v3：關閉分階段解鎖，accuracy 菜單也開全 81 題

const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'manifest.json',
  'fonts/bungee.woff2',
  'fonts/chakra-700.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/main.js',
  'js/store.js',
  'js/engine.js',
  'js/ui.js',
  'js/sound.js',
  'js/column.js',
  'js/sync.js',
  'js/config.js',
  'js/modes/sprint60.js',
  'js/modes/perfect.js',
  'js/modes/bughunt.js',
  'js/modes/reverse.js',
  'js/modes/columnpuzzle.js',
  'js/modes/weekly.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 字型與圖示永遠不會變 → 快取優先 */
const IMMUTABLE = /\.(woff2|png|ico)$/;

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 資料上傳一律走網路，絕不快取
  if (e.request.method !== 'GET' || url.pathname.includes('/rest/v1/')) return;
  if (url.origin !== location.origin) return;

  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetchAndCache(e.request)));
    return;
  }

  /* 程式碼與畫面：網路優先，2.5 秒拿不到才用快取。
     ------------------------------------------------------------
     ⚠ 原本寫成「快取優先、背景更新」，結果改了程式要開兩次才生效，
       開發時更是整個被舊版鎖死。離線照樣可用，但只要有網路就一定拿到新版。 */
  e.respondWith(
    Promise.race([
      fetchAndCache(e.request),
      new Promise(r => setTimeout(() => r(null), 2500))
    ])
      .then(res => res || caches.match(e.request))
      .then(res => res || caches.match(e.request))
      .then(res => res || fetch(e.request))
  );
});

function fetchAndCache(req) {
  return fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => null);
}
