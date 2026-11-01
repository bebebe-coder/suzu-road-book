/* sw.js — オフラインで開けるようにするためのキャッシュ。
   珠洲は電波の届きにくい場所があるため、一度開いた地図タイルも取っておく。

   ※サービスワーカーは HTTPS か localhost でしか動かない。
     LAN内のHTTPでスマホから開いた場合は登録されず、オフライン対応だけが効かない。
   ※Cache Storage は環境によっては使えない（プライベートブラウズ、容量逼迫など）。
     その場合もアプリが壊れないよう、キャッシュの失敗はすべて素通しにする。 */

const VERSION  = 'v10';
const SHELL    = 'srb-shell-' + VERSION;
const TILES    = 'srb-tiles-' + VERSION;
const TILE_MAX = 500;                // 取っておくタイルの上限

const SPOT_IDS = [
  'suzunari', 'mitsukejima', 'rokugozaki', 'suzumisaki', 'susujinja',
  'suzuyaki', 'hachigasaki', 'endenmura', 'gojiraiwa', 'kinoura'
];

const SHELL_FILES = [
  './', './index.html', './style.css',
  './spots.js', './store.js', './badge.js', './backup.js', './app.js',
  './manifest.json', './img/credits.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
].concat(SPOT_IDS.map((id) => './img/' + id + '.jpg'));

/** Cache Storage が使えない環境では null を返す */
async function openCache(name) {
  try {
    return await caches.open(name);
  } catch (e) {
    return null;
  }
}

async function matchIn(cache, req) {
  if (!cache) return null;
  try { return (await cache.match(req)) || null; } catch (e) { return null; }
}

function putIn(cache, req, res) {
  if (!cache) return;
  try { cache.put(req, res).catch(() => {}); } catch (e) { /* 入らなくても動かす */ }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await openCache(SHELL);
    if (c) {
      // 1件でも失敗すると addAll ごと落ちるため、1件ずつ入れる
      await Promise.all(SHELL_FILES.map((u) =>
        c.add(new Request(u, { cache: 'reload' })).catch(() => {})
      ));
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k)));
    } catch (err) { /* 掃除できなくても動かす */ }
    await self.clients.claim();
  })());
});

/** 古いものから捨てて上限に収める */
async function trim(cache, max) {
  if (!cache) return;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
  } catch (e) { /* 失敗しても動かす */ }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 地図タイル：一度取れたものは取っておく
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith((async () => {
      const c   = await openCache(TILES);
      const hit = await matchIn(c, req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          putIn(c, req, res.clone());
          trim(c, TILE_MAX);
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isLeaflet  = url.hostname === 'unpkg.com';
  if (!sameOrigin && !isLeaflet) return;      // それ以外は素通し

  /* アプリ本体。
     以前はキャッシュを先に返していたが、直したものが実機に出てこなくなる。
     （新しいものに入れ替わるのは次に開いたときなので、必ず1回ぶん古いものが出る）
     通信があるときは必ず新しいものを取りに行き、取れないときだけキャッシュを使う。
     写真とアイコンは中身が変わらないので、これまでどおりキャッシュを先に返す。 */
  const isAsset = sameOrigin && /\/(img|icons)\//.test(url.pathname);

  e.respondWith((async () => {
    const c = await openCache(SHELL);
    if (isAsset || isLeaflet) {
      const hit = await matchIn(c, req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) putIn(c, req, res.clone());
      return res;
    } catch (err) {
      return (await matchIn(c, req)) ||
             new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
