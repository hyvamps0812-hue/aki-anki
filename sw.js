// AKI暗記 service worker (SPEC §10)
// HTML/ナビゲーションは network-first（オンライン時は常に最新を取得、オフライン時のみキャッシュ）。
// 開発中に古い版が表示され続ける問題を防ぐ。フォント等の静的アセットは stale-while-revalidate。
const CACHE = 'aki-anki-v2';
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return; // AI API 等それ以外の外部通信には触れない

  const isHTML = e.request.mode === 'navigate'
    || (sameOrigin && (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')));

  if (isHTML) {
    // network-first: オンラインなら最新HTMLを返しつつキャッシュ更新。失敗時のみキャッシュ。
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((h) => h || caches.match('./index.html')))
    );
    return;
  }

  // assets + fonts: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const refresh = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
