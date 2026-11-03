'use strict';

/* MY SUZU ROAD BOOK ― プロトタイプ
   記録は端末内のみ（記録＝localStorage、写真＝IndexedDB。store.js 参照）。
   サーバーへ送信するものは何もない。
   配色とレイアウト、機能は第4回MTG資料 p9〜p12 に合わせている。 */

const CHECKIN_M  = 300;    // チェックインできる距離
const REVEAL_M   = 2200;   // 近づくとスポットが見えてくる距離
const NEAR_M     = 1500;   // この距離まで近づくとスポットの詳細を出す
const HOLE_M     = 4000;   // 霧が晴れる半径
const HOLE_PX    = 62;     // 霧の穴の最小半径（広域表示でも穴が見えるように）
const FAR_M      = 60000;  // 珠洲からこれ以上離れていたら擬似位置に切り替える
const COIN_CHECKIN = 3;    // 初回チェックインでもらえるコイン
const CENTER     = [37.472, 137.255];

const PARAMS = new URLSearchParams(location.search);

let state   = Store.defaultState();
let me      = null;                   // 現在地 { lat, lng, mock }
let focusId = null;                   // シートに出しているスポット
let fogOff  = false;
let bookCat = 'all';                  // 図鑑の絞り込み

/* 写真の表示用URL。spotId -> objectURL。記録には入れず、起動のたびに作り直す */
const photoUrls = {};

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

const catName  = (id) => (CATEGORIES.filter((c) => c.id === id)[0] || { name: '' }).name;
const visited  = (s) => !!state.visits[s.id];
const nVisited = () => Object.keys(state.visits).length;
/** ガチャで魅力を知ったスポット（まだ訪れてはいない） */
const known    = (s) => (state.revealed || []).indexOf(s.id) >= 0;

/* ---------- 地図 ---------- */

const map = L.map('map', { zoomControl: false }).setView(CENTER, 11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

/* 霧。未訪問の地域は雲がかかって見えない（資料p9のダンジョン的手法） */
const fog = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fog');
  svg.style.zIndex = 450;
  svg.innerHTML = [
    '<defs>',
    '  <filter id="fog-soft" x="-40%" y="-40%" width="180%" height="180%">',
    '    <feGaussianBlur stdDeviation="14"/>',
    '  </filter>',
    '  <mask id="fog-mask" maskUnits="userSpaceOnUse">',
    '    <rect id="fog-rect" x="0" y="0" fill="#fff"/>',
    '    <g id="fog-holes" filter="url(#fog-soft)"></g>',
    '  </mask>',
    '</defs>',
    '<rect id="fog-fill" x="0" y="0" fill="#b9d2e4" opacity="0.93" mask="url(#fog-mask)"/>'
  ].join('\n');
  map.getContainer().appendChild(svg);
  return svg;
})();

function metersToPx(m, lat) {
  const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom());
  return m / mpp;
}

function drawFog() {
  if (fogOff) { fog.style.display = 'none'; return; }
  fog.style.display = '';

  const size = map.getSize();
  ['fog-rect', 'fog-fill'].forEach((id) => {
    const el = fog.querySelector('#' + id);
    el.setAttribute('width', size.x);
    el.setAttribute('height', size.y);
  });

  const holes = [];
  SPOTS.forEach((s) => { if (visited(s) || known(s)) holes.push([s.lat, s.lng, HOLE_M]); });
  if (me) holes.push([me.lat, me.lng, HOLE_M]);

  fog.querySelector('#fog-holes').innerHTML = holes.map((h) => {
    const p = map.latLngToContainerPoint([h[0], h[1]]);
    const r = Math.max(metersToPx(h[2], h[0]), HOLE_PX).toFixed(1);
    return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" fill="#000"/>';
  }).join('');
}

map.on('move zoom resize', drawFog);

/* 広域表示では名前を出さない（ピンが重なって読めなくなるため） */
function syncZoomClass() {
  map.getContainer().classList.toggle('z-far', map.getZoom() < 12);
}
map.on('zoomend', syncZoomClass);
syncZoomClass();

/* ---------- ピン ---------- */

let pins = [];

function onMap(s) {
  return fogOff || visited(s) || known(s) || (me && distance(me, s) <= REVEAL_M);
}

/** そのスポットの表示に使う画像。自分が撮った写真があればそれ、なければ紹介写真 */
function imageOf(s) {
  return photoUrls[s.id] || 'img/' + s.id + '.jpg';
}

function drawPins() {
  pins.forEach((l) => map.removeLayer(l));
  pins = [];

  SPOTS.forEach((s) => {
    if (!onMap(s)) return;
    // ガチャで知ったスポットも写真で出す。鍵のままでは何を引いたのか分からないため
    const html = (visited(s) || known(s))
      ? '<div class="pin-card' + (visited(s) ? '' : ' is-known') +
        '" style="background-image:url(\'' + imageOf(s) + '\')">' +
        (visited(s) ? '' : '<span class="pin-flag">未訪問</span>') + '</div>' +
        '<div class="pin-tail"></div><div class="pin-label">' + s.name + '</div>'
      : '<div class="pin-lock">🔒</div><div class="pin-tail"></div>' +
        '<div class="pin-label">' + s.name + '</div>';
    const h = (visited(s) || known(s)) ? 86 : 70;
    const marker = L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'pin', html: html, iconSize: [120, h], iconAnchor: [60, h / 2] })
    }).addTo(map);
    marker.on('click', () => { focusId = s.id; drawBottom(); });
    pins.push(marker);
  });

  if (me) {
    pins.push(L.marker([me.lat, me.lng], {
      icon: L.divIcon({ className: 'pin', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map));
  }
}

/* ---------- 現在地 ---------- */

function distance(a, b) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
  const h = Math.pow(Math.sin(dLat / 2), 2) +
            Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.pow(Math.sin(dLng / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function setPos(lat, lng, mock) {
  const first = !me;
  me = { lat: lat, lng: lng, mock: !!mock };
  if (first && !mock) map.setView([lat, lng], 13);
  refresh();
}

let mockOn    = false;
let watchId   = null;
let mockBound = false;

/* 説明の2行目を出しておく時間。これを過ぎたら1行に畳む。
   地図の上に常時2行置くと、縦の短い端末では地図が残らない（所見34） */
const GPS_SUB_MS = 7000;

let gpsKey   = '';    // いまの状態。変わったときだけ説明を出し直す
let gpsSub   = '';    // いま出している説明（空なら1行）
let gpsTimer = null;

function gpsChip(cls, main, sub) {
  /* 判定に main を使わない。GPSは数秒ごとに誤差の数値だけ変えて呼ばれるため、
     main を含めると毎回「状態が変わった」ことになり、説明が永久に畳まれない */
  const key = cls + '\n' + (sub || '');
  if (key !== gpsKey) {
    gpsKey = key;
    gpsSub = sub || '';
    clearTimeout(gpsTimer);
    if (gpsSub) {
      gpsTimer = setTimeout(() => {
        if (gpsKey !== key) return;   // その間に状態が変わっていたら触らない
        gpsSub = '';
        const c = $('#gps');
        c.textContent = c.dataset.main || '';
      }, GPS_SUB_MS);
    }
  }

  const chip = $('#gps');
  chip.className = 'gps ' + cls;
  chip.dataset.main = main;
  // 畳んだあとも読めるように、説明は長押し／ホバーで出る所へ残す
  chip.title = sub || '';
  chip.textContent = main;
  if (gpsSub) {
    const el = document.createElement('small');
    // sub にはブラウザ由来の文字列が入ることがあるため、HTMLとして解釈させない
    el.textContent = gpsSub;
    chip.appendChild(document.createElement('br'));
    chip.appendChild(el);
  }
}

function startMock(reason, tappable) {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  mockOn = true;
  gpsChip('is-mock' + (tappable ? ' can-tap' : ''), '擬似位置モード',
          reason + ' 地図をタップすると、そこにいることになります。');

  if (!mockBound) {
    map.on('click', (e) => {
      if (!mockOn) return;
      focusId = null;
      setPos(e.latlng.lat, e.latlng.lng, true);
    });
    mockBound = true;
  }
  setPos(SPOTS[0].lat, SPOTS[0].lng, true);
}

/** GPSが使えない理由。使えるなら null */
function gpsBlockedReason() {
  if (PARAMS.has('mock')) return 'URLに ?mock=1 が付いています。';
  if (!navigator.geolocation) return 'この端末では位置情報が使えません。';
  if (!window.isSecureContext) {
    return 'この接続（HTTP）では位置情報を使えません。GPSを使うにはHTTPSで開く必要があります。';
  }
  return null;
}

function startGeo() {
  mockOn = false;
  const blocked = gpsBlockedReason();
  if (blocked) { startMock(blocked, false); return; }

  gpsChip('can-tap', '位置情報を取得中…', 'タップすると擬似位置に切り替えられます。');
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const far = distance({ lat: CENTER[0], lng: CENTER[1] },
                           { lat: p.coords.latitude, lng: p.coords.longitude });
      if (far > FAR_M) {
        startMock('現在地が珠洲市から約' + Math.round(far / 1000) + 'km離れています。', true);
        return;
      }
      gpsChip('is-live can-tap', 'GPS 取得中（誤差 約' + Math.round(p.coords.accuracy) + 'm）',
              'タップすると擬似位置に切り替えられます。');
      setPos(p.coords.latitude, p.coords.longitude, false);
    },
    (err) => {
      if (!mockOn) startMock('位置情報を取得できません（' + err.message + '）。', true);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

/* 状態表示をタップして切り替える。GPSが使えない環境では理由を出す */
$('#gps').addEventListener('click', () => {
  if (!mockOn) { startMock('手動で切り替えました。', true); return; }
  const blocked = gpsBlockedReason();
  if (blocked) { toast(blocked); return; }
  startGeo();
});

$('#btn-locate').addEventListener('click', () => {
  if (!me) { toast('現在地がまだ分かりません'); return; }
  map.setView([me.lat, me.lng], Math.max(map.getZoom(), 13));
});

/* ---------- 探索率 ---------- */

function drawRate() {
  const n = nVisited(), total = SPOTS.length;
  const C = 2 * Math.PI * 18;
  $('#rate-arc').setAttribute('stroke-dasharray', (C * n / total).toFixed(1) + ' ' + C.toFixed(1));
  $('#rate-arc').setAttribute('stroke-dashoffset', '0');
  $('#rate-pct').innerHTML = Math.round((n / total) * 100) + '<small>%</small>';
  $('#rate-n').textContent = n + ' / ' + total;
}

/* ---------- 画面下のカード ---------- */

function targetSpot() {
  if (focusId) return SPOTS.filter((s) => s.id === focusId)[0];
  if (!me) return null;
  let best = null, bestD = Infinity;
  SPOTS.forEach((s) => {
    const d = distance(me, s);
    if (d < bestD) { bestD = d; best = s; }
  });
  return bestD <= NEAR_M ? best : null;
}

/** 次に目指す場所。ガチャで知った未訪問を優先し、なければ最寄りの未訪問 */
function nextSpot() {
  const rest = SPOTS.filter((s) => !visited(s));
  if (!rest.length) return null;
  const pool = rest.filter(known).length ? rest.filter(known) : rest;
  if (!me) return pool[0];
  let best = pool[0], bestD = distance(me, pool[0]);
  pool.forEach((s) => {
    const d = distance(me, s);
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

function fmtDist(d) {
  return d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
}

/* 行き方。地図アプリに任せる。
   出発地はあえて渡さない。端末側のほうが正確な現在地を持っているため
   （このアプリの現在地は擬似位置のこともある）。
   目的地は緯度経度で渡す。名前で渡すと別の場所に解決されることがあり、
   珠洲のように似た地名が各地にある場合は危ない。
   ※ただしスポットの緯度経度はおおよその値なので、着く場所も多少ずれる */
function routeUrl(s) {
  return 'https://www.google.com/maps/dir/?api=1' +
         '&destination=' + s.lat + ',' + s.lng +
         '&travelmode=driving';
}

function drawBottom() {
  const s = targetSpot();
  const sheet = $('#sheet'), next = $('#next');

  if (s) {
    next.hidden = true;
    sheet.hidden = false;
    const d = me ? distance(me, s) : null;
    const v = state.visits[s.id];
    const hasPhoto = !!photoUrls[s.id];

    $('#sheet-cat').className = 'chip cat-' + s.cat;
    $('#sheet-cat').textContent = catName(s.cat);
    $('#sheet-name').textContent = s.name + (s.start ? '（スタート）' : '');
    $('#sheet-dist').textContent = d === null ? '' : fmtDist(d);

    $('#btn-route').href = routeUrl(s);

    /* 写真は詳細画面に一本化した。チェックイン後はそちらが次の行き先になるので、
       「詳しく見る」を主ボタンに切り替えて目を向ける */
    const bc = $('#btn-checkin');
    if (v) {
      bc.textContent = 'チェックイン済み';
      bc.disabled = true;
      bc.classList.remove('btn-primary');
    } else {
      const near = d !== null && d <= CHECKIN_M;
      bc.textContent = near ? 'チェックイン' : '近づくとチェックイン（' + CHECKIN_M + 'm以内）';
      bc.disabled = !near;
      bc.classList.add('btn-primary');
    }
    $('#btn-detail').classList.toggle('btn-primary', !!v && !hasPhoto);
  } else {
    sheet.hidden = true;
    const n = nextSpot();
    if (!n) {
      next.hidden = true;
    } else {
      next.hidden = false;
      $('#next-thumb').style.backgroundImage = "url('img/" + n.id + ".jpg')";
      $('#next-name').textContent = n.name + 'へ行ってみよう';
      next.dataset.spot = n.id;
    }
  }
  syncBottomHeight();
}

/** 現在地ボタンが下のカードに重ならないようにする */
function syncBottomHeight() {
  const el = $('#sheet').hidden ? ($('#next').hidden ? null : $('#next')) : $('#sheet');
  document.body.style.setProperty('--bottom-h', el ? el.offsetHeight + 'px' : '0px');
}

$('#next-card').addEventListener('click', () => {
  const s = SPOTS.filter((x) => x.id === $('#next').dataset.spot)[0];
  if (!s) return;
  focusId = s.id;
  map.setView([s.lat, s.lng], Math.max(map.getZoom(), 13));
  drawBottom();
});

$('#btn-checkin').addEventListener('click', () => {
  const s = targetSpot();
  if (!s || visited(s)) return;
  state.visits[s.id] = { at: new Date().toISOString(), photoId: null };
  state.coins = (state.coins || 0) + COIN_CHECKIN;
  if (!Store.saveState(state)) {
    delete state.visits[s.id];
    state.coins -= COIN_CHECKIN;
    toast('記録を保存できませんでした');
    return;
  }
  focusId = s.id;
  refresh();
  const n = nVisited();
  toast(n === SPOTS.length
    ? '全' + SPOTS.length + 'スポット走破！'
    : s.name + ' にチェックイン（' + n + '/' + SPOTS.length + '）　コイン +' + COIN_CHECKIN);
  setTimeout(showInstallHint, 2800);
});

/* ---------- 写真 ---------- */

const fileInput = $('#file');

/* ---------- 写真の取り込み ----------

   capture を付けない入力を押したとき、端末が出す画面が**OSによって違う**。
   どちらも実機で確かめた結果：

     iPhone … 「写真ライブラリ／写真を撮る／ファイルを選択」の選択画面が出る。
              カメラがここに入っているので、ボタンは1つで足りる。
              別に「写真を撮る」を置くと、押した先で同じ選択肢がまた出て二重になる。
     Android … アルバムが直接開く。カメラへ行く道がない。
              その場で撮るには capture を付けたボタンを別に置くしかない。

   そこで、カメラが選択画面に入っていると**確認できている iPhone だけ**を1つにまとめ、
   それ以外は2つ出す。確認が取れていない側を勝手にまとめない、という向きにしてある。
   （UAでの判定は本来避けたいが、端末が出す画面の中身は他に調べようがない） */

function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS は Mac を名乗るので、指で触れるかどうかで見分ける
  return /iPad|iPhone|iPod/.test(ua) ||
         (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** カメラ用のボタンを別に出す必要があるか（＝選択画面にカメラが入っていない側） */
const NEED_SHOOT = !isIOS();

/** 写真を選ぶ画面を出す。mode='camera' のときだけ capture を付け、カメラを直接開く */
function openPicker(sid, mode) {
  if (!sid || !state.visits[sid]) return;
  if (mode === 'camera') fileInput.setAttribute('capture', 'environment');
  else fileInput.removeAttribute('capture');
  fileInput.dataset.spot = sid;
  fileInput.value = '';
  fileInput.click();
}

/** 写真を消して、元の紹介写真に戻す */
async function dropPhoto(sid) {
  const s = SPOTS.filter((x) => x.id === sid)[0];
  if (!s || !state.visits[sid] || !state.visits[sid].photoId) return;
  if (!confirm(s.name + ' の写真を削除します。元の紹介写真に戻ります。')) return;

  const id = state.visits[sid].photoId;
  state.visits[sid].photoId = null;
  Store.saveState(state);
  try { await Store.delPhoto(id); } catch (e) { console.warn(e); }
  if (photoUrls[sid]) { URL.revokeObjectURL(photoUrls[sid]); delete photoUrls[sid]; }
  refresh();
  redrawDetail();
  toast('写真を削除しました');
}

/* 地図のピンから詳細へ。シートには名前と距離しか置かないので、
   紹介・訪れた日・写真はすべてこの先にある */
$('#btn-detail').addEventListener('click', () => {
  const s = targetSpot();
  if (s) openDetail(s.id);
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files && fileInput.files[0];
  const sid  = fileInput.dataset.spot;
  if (!file || !sid || !state.visits[sid]) return;

  try {
    const blob  = await shrinkToBlob(file, 1000, 0.72);
    const newId = sid + '-' + Date.now();
    await Store.putPhoto(newId, blob);

    const oldId = state.visits[sid].photoId;
    state.visits[sid].photoId = newId;
    if (!Store.saveState(state)) {
      // 記録が保存できないなら写真も残さない（中途半端な状態を作らない）
      state.visits[sid].photoId = oldId;
      await Store.delPhoto(newId);
      toast('記録を保存できませんでした');
      return;
    }
    if (oldId) await Store.delPhoto(oldId);

    setPhotoUrl(sid, blob);
    refresh();
    redrawDetail();          // 詳細を開いたまま入れ替えたときに、その場で反映する
    toast('地図に写真が残りました');
  } catch (e) {
    console.warn('写真の保存に失敗', e);
    toast('写真を保存できませんでした');
  }
});

function setPhotoUrl(sid, blob) {
  if (photoUrls[sid]) URL.revokeObjectURL(photoUrls[sid]);
  photoUrls[sid] = URL.createObjectURL(blob);
}

function clearPhotoUrls() {
  Object.keys(photoUrls).forEach((k) => {
    URL.revokeObjectURL(photoUrls[k]);
    delete photoUrls[k];
  });
}

/** 記録にあるIDで写真を引き、表示用URLを作り直す */
async function loadPhotoUrls() {
  clearPhotoUrls();
  for (const sid of Object.keys(state.visits)) {
    const id = state.visits[sid].photoId;
    if (!id) continue;
    try {
      const blob = await Store.getPhoto(id);
      if (blob) photoUrls[sid] = URL.createObjectURL(blob);
    } catch (e) {
      console.warn('写真を読めませんでした', sid, e);
    }
  }
}

async function shrinkToBlob(file, maxPx, quality) {
  let src, w, h;
  try {
    // iOSの写真はEXIFで向きが入っているため from-image で正す
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = src.width; h = src.height;
  } catch (e) {
    src = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const k  = Math.min(1, maxPx / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width  = Math.round(w * k);
  cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => {
    cv.toBlob((b) => (b ? res(b) : rej(new Error('画像を変換できません'))), 'image/jpeg', quality);
  });
}

/* ---------- 珠洲図鑑（BOOK） ---------- */

function drawChips() {
  $('#chips').innerHTML = CATEGORIES.map((c) =>
    '<button class="chip-btn' + (c.id === bookCat ? ' is-on' : '') +
    '" data-cat="' + c.id + '">' + c.name + '</button>'
  ).join('');
  $$('#chips .chip-btn').forEach((b) => {
    b.addEventListener('click', () => { bookCat = b.dataset.cat; drawBook(); });
  });
}

function drawBook() {
  $('#book-count').textContent = '発見 ' + nVisited() + ' / ' + SPOTS.length;
  drawChips();

  const list = SPOTS.filter((s) => bookCat === 'all' || s.cat === bookCat);
  $('#book').innerHTML = list.map((s) => {
    const v    = state.visits[s.id];
    const kn   = !v && known(s);          // ガチャで知ったが、まだ訪れていない
    const own  = !!photoUrls[s.id];
    const date = v
      ? new Date(v.at).toLocaleString('ja-JP',
          { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : (kn ? '行ってみよう' : '未発見');
    const cls = v ? '' : (kn ? 'is-known' : 'is-locked');
    // 知っているものは押せる。押すと詳細が開き、そこから行き方も地図も見られる
    const tap = (v || kn) ? ' data-spot="' + s.id + '"' : '';
    return [
      '<div class="bcard ' + cls + '"' + tap + '>',
      '  <div class="bcard-img" style="background-image:url(\'' + imageOf(s) + '\')">',
      own ? '    <span class="bcard-own">自分の写真</span>' : '',
      kn  ? '    <span class="bcard-own">未訪問</span>' : '',
      '  </div>',
      (v || kn) ? '' : '  <span class="bcard-lock">🔒</span>',
      '  <div class="bcard-meta">',
      '    <div class="bcard-name">' + ((v || kn) ? s.name : '???') + '</div>',
      '    <div class="bcard-row">',
      '      <span class="chip cat-' + s.cat + '">' + catName(s.cat) + '</span>',
      '      <span class="bcard-date">' + date + '</span>',
      '    </div>',
      (v || kn) ? '    <span class="bcard-go">詳しく見る ›</span>' : '',
      '  </div>',
      '</div>'
    ].join('\n');
  }).join('');
}

$('#book').addEventListener('click', (e) => {
  const card = e.target.closest('.bcard[data-spot]');
  if (!card) return;
  openDetail(card.dataset.spot);
});

/* ---------- 図鑑の詳細 ----------

   写真を大きく出して、その下に紹介と行き方を置く。
   一覧のカードは小さく、写真も名前も切れてしまうので、
   「行ってみたい」と思える大きさで見せる場所が要る。 */

/* 写真の形に枠を合わせる。
   紹介写真は4:3で用意してあるが、自分で撮った写真は縦長のことが多い。
   枠を4:3に固定したまま縦長の写真を入れると、上下が切り落とされて
   主役（見附島など、たいてい上の方にある）が枠の外へ出てしまう。

   読み込んでから実際の縦横比を見て、その形に枠を変える。
   読めないうちは4:3で置いておく。 */
function setDetailPhoto(url) {
  const el = $('#detail-photo');
  el.style.backgroundImage = "url('" + url + "')";
  el.style.aspectRatio = '4 / 3';

  const im = new Image();
  im.onload = () => {
    if ($('#detail').hidden) return;                 // 閉じたあとに届いたら捨てる
    const w = im.naturalWidth, h = im.naturalHeight;
    if (!w || !h) return;
    // 縦長すぎると説明が画面の下へ押し出されるので、3:4 より縦長にはしない
    el.style.aspectRatio = Math.max(w / h, 3 / 4).toFixed(4);
  };
  im.src = url;
}

function openDetail(id, keepScroll) {
  const s = SPOTS.filter((x) => x.id === id)[0];
  if (!s) return;
  const scroll = keepScroll ? $('#detail').scrollTop : 0;
  const v = state.visits[s.id];
  const own = !!photoUrls[s.id];
  const d = me ? distance(me, s) : null;

  $('#detail').dataset.spot = s.id;
  setDetailPhoto(imageOf(s));
  $('#detail-own').hidden = !own;
  $('#detail-cat').className = 'chip cat-' + s.cat;
  $('#detail-cat').textContent = catName(s.cat);
  $('#detail-name').textContent = s.name;
  $('#detail-area').textContent = s.area + (s.start ? '　スタート地点' : '');
  $('#detail-desc').textContent = s.desc;
  $('#detail-route').href = routeUrl(s);

  const rows = [
    ['ここまで', d === null ? '現在地が分かりません' : fmtDist(d)],
    ['状態', v ? 'チェックイン済み' : (known(s) ? 'ガチャで見つけた（未訪問）' : '未発見')]
  ];
  if (v) {
    rows.push(['訪れた日', new Date(v.at).toLocaleString('ja-JP',
      { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })]);
  }
  rows.push(['自分の写真', own ? 'あり' : 'まだない']);

  $('#detail-rows').innerHTML = rows.map((r) => {
    const dt = document.createElement('div');
    dt.className = 'detail-row';
    const k = document.createElement('span'); k.textContent = r[0];
    const t = document.createElement('strong'); t.textContent = r[1];
    dt.appendChild(k); dt.appendChild(t);
    return dt.outerHTML;
  }).join('');

  /* 自分の写真。訪れた所だけ差し替えられる。
     まだ訪れていない所で写真を足せてしまうと、
     「現地でチェックインして埋める」という図鑑の筋が通らなくなるため */
  const act = $('#detail-photoact');
  act.hidden = !v;
  if (v) {
    $('#detail-photoact-h').textContent = own ? '自分の写真' : '自分の写真を残す';
    // カメラ用が別に出る端末（Android等）では、こちらをアルバム側として分ける
    $('#detail-pick').textContent = NEED_SHOOT
      ? 'アルバムから選ぶ'
      : (own ? '写真を変える' : '写真を追加');
    $('#detail-pick').classList.toggle('btn-primary', !own && !NEED_SHOOT);
    $('#detail-shoot').hidden = !NEED_SHOOT;
    $('#detail-shoot').textContent = own ? '撮り直す' : '写真を撮る';
    $('#detail-shoot').classList.toggle('btn-primary', !own);
    $('#detail-photo-del').hidden = !own;
  }

  $('#detail-note').textContent = v
    ? '上の大きな写真が、自分の写真に入れ替わります。地図のピンと図鑑のカードにも使われます。'
    : '現地で' + CHECKIN_M + 'm以内に入ると、地図の詳細からチェックインできます。'
      + 'チェックインすると、自分の写真を残せるようになります。';

  $('#detail').hidden = false;
  $('#detail').scrollTop = scroll;
}

/** 開いたままの詳細を描き直す（写真を入れ替えた直後など）。閉じているときは何もしない */
function redrawDetail() {
  const d = $('#detail');
  if (!d.hidden) openDetail(d.dataset.spot, true);
}

function closeDetail() { $('#detail').hidden = true; }

$('#detail-pick').addEventListener('click', () => openPicker($('#detail').dataset.spot));
$('#detail-shoot').addEventListener('click', () => openPicker($('#detail').dataset.spot, 'camera'));
$('#detail-photo-del').addEventListener('click', () => dropPhoto($('#detail').dataset.spot));
$('#detail-back').addEventListener('click', closeDetail);

$('#detail-close').addEventListener('click', closeDetail);
$('#detail').addEventListener('click', (e) => {
  if (e.target === $('#detail')) closeDetail();      // 外側を押したら閉じる
});
$('#detail-map').addEventListener('click', () => {
  const s = SPOTS.filter((x) => x.id === $('#detail').dataset.spot)[0];
  closeDetail();
  if (!s) return;
  showView('map');
  focusId = s.id;
  map.setView([s.lat, s.lng], Math.max(map.getZoom(), 13));
  setTimeout(() => { map.invalidateSize(); drawBottom(); drawFog(); }, 0);
});

/* ---------- SUZU GACHA（資料p11のC案・p12の④） ---------- */

/** まだ知らない＝ガチャで出せるスポット */
function gachaPool() {
  return SPOTS.filter((s) => !visited(s) && !known(s));
}

function drawGacha() {
  const coins = state.coins || 0;
  const pool  = gachaPool();
  const btn   = $('#btn-gacha');
  $('#coins').textContent = coins;

  if (pool.length === 0) {
    btn.disabled = true;
    btn.textContent = 'すべて発見済み';
    $('#gacha-note').textContent = '珠洲のスポットはすべて知っています。あとは現地へ。';
  } else if (coins < 1) {
    btn.disabled = true;
    btn.textContent = 'コインが足りません';
    $('#gacha-note').textContent =
      'スポットにチェックインするとコインがもらえます（残り' + pool.length + 'か所が未発見）。';
  } else {
    btn.disabled = false;
    btn.textContent = 'ガチャを回す（1枚）';
    $('#gacha-note').textContent = 'まだ知らないスポットが ' + pool.length + 'か所あります。';
  }
  drawLineup(pool);
}

/** 今回のラインナップ（資料p12④）。まだ見ぬ景色なので、ぼかして並べる */
function drawLineup(pool) {
  const el = $('#lineup');
  if (!el) return;
  if (pool.length === 0) {
    el.innerHTML = '<p class="lineup-empty">すべて晴れました。</p>';
    $('#lineup-note').textContent = '珠洲の景色は、もう全部あなたの中にあります。';
    return;
  }
  $('#lineup-note').textContent =
    'ここにある ' + pool.length + 'つの景色が、ガチャで1つずつ晴れていきます。';
  el.innerHTML = pool.map((s) =>
    '<span class="lineup-item">' +
    '<i style="background-image:url(\'img/' + s.id + '.jpg\')"></i><span>?</span>' +
    '</span>'
  ).join('');
}

/* ---------- ガチャの演出「霧が晴れる」 ----------

   画面いっぱいに広げる。当たったスポットの写真が霧の向こうにあり、
   渦を巻いて晴れると、その写真が見えてくる。

   最初は地図の上でやっていたが、霧の下で何が動いているのか分からず、
   当たったものも鍵のかかったピンが出るだけで、何を引いたのか伝わらなかった。
   「当たりは写真で見せる」「いま何が起きているかを言葉でも出す」の2点を足してある。 */

const rarityOf = (s) => RARITY[CAT_RARITY[s.cat]] || RARITY.common;

const play = $('#play');
let skipNow = false;

play.addEventListener('click', (e) => {
  if (!e.target.closest('.play-card')) skipNow = true;
});

/** p（0→1）を ms かけて進める。とばされたら途中で抜ける */
function ramp(ms, step) {
  return new Promise((done) => {
    const t0 = performance.now();
    (function frame(t) {
      const q = Math.min(1, (t - t0) / ms);
      step(q);
      if (q < 1 && !skipNow) requestAnimationFrame(frame);
      else { step(1); done(); }
    })(t0);
  });
}

const easeOut = (q) => 1 - Math.pow(1 - q, 3);

function say(text) { $('#play-say').textContent = text; }

/** 霧の穴。ぼかし幅も一緒に動かす（0のときは0にして、中央が透けないようにする） */
function setHole(px) {
  play.style.setProperty('--hole', px.toFixed(0) + 'px');
  play.style.setProperty('--feather', Math.min(110, px * 0.7).toFixed(0) + 'px');
}

/** 霧が完全に晴れるのに要する穴の大きさ（画面の対角より少し大きく） */
function fullHole() {
  return Math.ceil(Math.sqrt(Math.pow(innerWidth, 2) + Math.pow(innerHeight, 2)) / 2) + 40;
}

async function playReveal(hit) {
  const rar  = rarityOf(hit);
  const glow = $('#play-glow');
  const swirl = $('#play-swirl');

  skipNow = false;
  play.style.setProperty('--rv', rar.color);
  setHole(0);
  play.classList.remove('is-done', 'is-burst');
  $('#play-photo').style.backgroundImage = "url('img/" + hit.id + ".jpg')";
  $('#play-rank').className = 'rank-chip is-' + rar.key;
  $('#play-rank').textContent = rar.star + ' ' + rar.name;
  $('#play-name').textContent = hit.name;
  $('#play-area').textContent = hit.area + '　' + catName(hit.cat);
  $('#play-desc').textContent = hit.desc;
  play.hidden = false;
  // 写真をゆっくり寄せる。クラスを付けてから transition を効かせる
  requestAnimationFrame(() => play.classList.add('is-on'));

  // ① 予兆 ― 霧が流れ、その奥で何かが光りはじめる。レアほど長い
  say('霧の向こうに、なにかある…');
  await ramp(rar.hold, (q) => {
    const pulse = 0.55 + 0.45 * Math.sin(q * Math.PI * 7);
    glow.style.opacity = (0.25 + 0.75 * q * pulse).toFixed(3);
    glow.style.transform = 'translate(-50%,-50%) scale(' + (0.35 + 1.75 * q * q).toFixed(3) + ')';
    if (q > 0.62 && rar.key !== 'common') say('……強く光っている！');
  });

  // ② ため ― 光が一段強くなる
  await ramp(600, (q) => {
    glow.style.opacity = (0.85 + 0.15 * Math.sin(q * Math.PI * 9)).toFixed(3);
    glow.style.transform = 'translate(-50%,-50%) scale(' + (2.1 + 0.9 * q).toFixed(3) + ')';
  });

  // ③ 解放 ― 渦を巻いて、霧が晴れる
  const R = fullHole();
  play.classList.add('is-burst');
  say('');
  await ramp(1000, (q) => {
    const e = easeOut(q);
    setHole(R * e);
    swirl.style.width = swirl.style.height = (R * e * 1.5).toFixed(0) + 'px';
    swirl.style.opacity = (0.85 * (1 - q)).toFixed(3);
    glow.style.opacity = Math.max(0, 1 - q * 2.4).toFixed(3);
  });
  setHole(R);
  play.classList.remove('is-burst');

  // ④ 結果 ― 写真の上にカードが出る
  say('あたらしい珠洲に出会えた！');
  $('#play-again').textContent = 'もう1回（' + (state.coins || 0) + '枚）';
  $('#play-again').disabled = (state.coins || 0) < 1 || gachaPool().length === 0;
  play.classList.add('is-done');
}

function closePlay() {
  play.hidden = true;
  play.classList.remove('is-on', 'is-done', 'is-burst');
}

$('#play-close').addEventListener('click', closePlay);
$('#play-again').addEventListener('click', () => { closePlay(); spin(); });
/* 引いた直後は「それが何で、どう行くか」を見たい。
   地図へ飛ばすとピンが1本立つだけで、説明も行き方もその場にない。
   図鑑の詳細を重ねて出す。タブは動かさないので、閉じればガチャに戻って続けられる */
$('#play-detail').addEventListener('click', () => {
  const id = play.dataset.spot;
  closePlay();
  openDetail(id);
});

let spinning = false;

async function spin() {
  if (spinning) return;
  const pool = gachaPool();
  if (pool.length === 0 || (state.coins || 0) < 1) return;

  spinning = true;
  const hit = pool[Math.floor(Math.random() * pool.length)];
  const rar = rarityOf(hit);

  state.coins = (state.coins || 0) - 1;
  state.revealed = (state.revealed || []).concat([hit.id]);
  Store.saveState(state);
  play.dataset.spot = hit.id;

  // GACHAタブにも結果を残しておく（戻ったときに何が出たか分かるように）
  $('#gresult-thumb').style.backgroundImage = "url('img/" + hit.id + ".jpg')";
  $('#gresult-rank').className = 'rank-chip is-' + rar.key;
  $('#gresult-rank').textContent = rar.star + ' ' + rar.name;
  $('#gresult-cat').className = 'chip cat-' + hit.cat;
  $('#gresult-cat').textContent = catName(hit.cat);
  $('#gresult-name').textContent = hit.name;
  $('#gresult-desc').textContent = hit.desc;
  $('#gacha-result').hidden = false;
  $('#gacha-result').dataset.spot = hit.id;

  refresh();
  await playReveal(hit);
  spinning = false;
}

$('#btn-gacha').addEventListener('click', spin);

$('#btn-gacha-detail').addEventListener('click', () => {
  openDetail($('#gacha-result').dataset.spot);
});

/* ---------- GARAGE ---------- */

const plateDigits = () => (state.plate || '').replace(/\D/g, '').slice(0, 4);

/** 登録済みなら、割り当てられたひらがな（またはA〜Z）。未登録なら空。
    記録ファイルは読み込めてしまうので、画面に出す手前で必ず通す */
const plateMark = () => Badge.safeMark(state.plateMark);
const plateDone = () => !!(plateMark() && state.plateKey);

/** 上段の分類番号にあたる数字。ここでは訪れたスポット数を2桁で入れる */
const plateClass = () => String(nVisited()).padStart(2, '0');

/** いま出せるいちばん上のバッジ。1つも無ければ null */
function topBadge() {
  const n = nVisited();
  const got = BADGES.filter((b) => n >= b.need);
  return got.length ? got[got.length - 1] : null;
}

function drawGarage() {
  const n = nVisited();
  const got = BADGES.filter((b) => n >= b.need).length;
  $('#badge-count').textContent = '獲得 ' + got + ' / ' + BADGES.length;

  const opts = { plate: plateDigits(), cls: plateClass(), mark: plateMark() };

  $('#badges').innerHTML = BADGES.map((b) => {
    const open = n >= b.need;
    return [
      '<div class="badge badge-' + b.id + (open ? '' : ' is-locked') + '">',
      '  <div class="badge-disc">',
      Badge.svg(b.id, Object.assign({ name: b.name }, opts)),
      open ? '' : '  <span class="badge-lock">🔒</span>',
      '  </div>',
      '  <span class="badge-need' + (open ? ' is-got' : '') + '">' +
        (open ? '✓ 獲得済み' : b.need + 'スポットで獲得') + '</span>',
      '</div>'
    ].join('\n');
  }).join('');

  // 入力欄の中点も、バッジと同じ書式に合わせる。
  // 1つずつ枠に入れるのは、数字と同じ幅に揃えて桁がずれないようにするため
  const dots = Badge.plateNumber(plateDigits()).replace(/\d/g, '').length;
  $('#plate-dots').innerHTML = '<i>・</i>'.repeat(dots);
  $('#plate-cls').textContent = plateClass();
  $('#plate-mark').textContent = plateMark();
  drawPlateReg();

  const photos = Object.keys(photoUrls).length;
  $('#garage-stats').innerHTML = [
    ['訪れたスポット', n], ['登録した写真', photos], ['残り', SPOTS.length - n]
  ].map((x) => '<div class="stat"><strong>' + x[1] + '</strong><span>' + x[0] + '</span></div>').join('');

  prepareShare();
}

// 空のときは入力欄がごく細くなるので、プレートのどこを押しても入力できるようにする
$('.plate').addEventListener('click', (e) => {
  if (plateDone()) return;                       // 登録済みの番号は押しても動かさない
  if (e.target !== $('#plate')) $('#plate').focus();
});

/* ---------- 登録ナンバーの登録 ----------

   窓口が持つのは「その5桁が使われているか」だけ。氏名も連絡先も送らない。
   希望の数字を送ると、まだ使われていないひらがな（尽きたらA〜Z）が返る。
   一緒に返る再発行キーは、端末を変えたときに番号を取り戻すためのもので、
   記録の書き出しに含まれる（state ごと保存されるため）。 */

function drawPlateReg() {
  const btn = $('#btn-plate');
  const inp = $('#plate');
  if (!btn || !inp) return;
  const n = Plate.normalize(plateDigits());

  inp.readOnly = plateDone();

  if (plateDone()) {
    btn.textContent = '別の番号にする';
    btn.disabled = false;
    $('#plate-note').textContent =
      'この番号はあなただけのものです。端末を変えるときは、このタブの下にある「記録を書き出す」で' +
      '持ち出せば取り戻せます。';
    return;
  }
  btn.textContent = 'この番号で登録する';
  btn.disabled = !n;
  if (!n) {
    $('#plate-note').textContent = '1〜9999の好きな番号を入れてください。';
  } else {
    $('#plate-note').textContent =
      '登録すると、まだ使われていないひらがなが付いて、あなただけの番号になります。';
  }
}

let claiming = false;

$('#btn-plate').addEventListener('click', async () => {
  if (claiming) return;
  const n = Plate.normalize(plateDigits());
  if (!n) { $('#plate').focus(); return; }

  if (plateDone() && !confirm('いまの番号を手放して、別の番号を取り直します。よろしいですか？')) return;

  claiming = true;
  $('#btn-plate').disabled = true;
  $('#plate-note').textContent = '空いている番号を探しています…';

  const r = await Plate.claim(n);
  claiming = false;

  if (r.ok && r.data.plate) {
    state.plate = r.data.number;          // 先頭の0は詰められて返る
    state.plateMark = r.data.mark;
    state.plateKey = r.data.key;
    Store.saveState(state);
    $('#plate').value = r.data.number;
    drawGarage();
    $('#plate-note').textContent = r.data.plate + ' で登録しました。';
    toast(r.data.plate + ' を取得しました');
    return;
  }

  drawPlateReg();
  if (r.offline) {
    $('#plate-note').textContent =
      '窓口につながりませんでした。番号はこの端末の中だけの飾りとして、このまま使えます。';
  } else if (r.status === 409) {
    $('#plate-note').textContent =
      (r.data && r.data.error) || 'この数字は使われていました。別の数字でお試しください。';
  } else {
    // 混み合っているとき・受付の上限に達したときは、窓口が返す文面をそのまま出す。
    // 「明日なら登録できる」といった、こちらで言い換えると落ちてしまう情報が入っているため
    $('#plate-note').textContent = (r.data && r.data.error) || '登録できませんでした。';
  }
});

$('#plate').addEventListener('input', (e) => {
  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = v;
  state.plate = v;
  Store.saveState(state);
  drawGarage();
});

/* ---------- バッジを画像にして共有する ----------

   iOS Safari は navigator.share を利用者の操作と同じ流れで呼ばないと断ることがある。
   押してから画像を作ると間に合わないので、GARAGEを描いた時点で先に作っておき、
   押したときは出来上がったものを渡すだけにしてある。 */

let shareFile = null;
let sharePrep = null;
let shareTimer = 0;

/** ナンバーを打つたびに1080pxの画像を作り直すのは重いので、少し待ってからにする */
function prepareShare() {
  const b = topBadge();
  const btn = $('#btn-share');
  shareFile = null;
  sharePrep = null;
  clearTimeout(shareTimer);

  if (!b) {
    btn.disabled = true;
    $('#share-note').textContent = '※' + BADGES[0].need + 'スポット訪れると ' +
      BADGES[0].name + ' が出ます。';
    return;
  }
  btn.disabled = false;
  $('#share-note').textContent = '※いま出せるのは ' + b.name + ' です。';
  shareTimer = setTimeout(() => { sharePrep = buildShare(b); }, 250);
}

function buildShare(b) {
  const markup = Badge.cardSvg(b.id, {
    name: b.name, plate: plateDigits(), cls: plateClass(),
    sub: '珠洲を ' + nVisited() + ' スポット走破'
  });
  return Badge.toPng(markup, 1080).then((blob) => {
    shareFile = new File([blob], 'my-suzu-road-book.png', { type: 'image/png' });
    return shareFile;
  }).catch((e) => {
    console.warn('共有画像を作れませんでした', e);
    return null;
  });
}

function saveFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('#btn-share').addEventListener('click', async () => {
  const b = topBadge();
  if (!b) return;
  // まだ出来ていなければ、ここで作る（iOSでは共有シートが開かず保存になることがある）
  const f = shareFile || await (sharePrep || (sharePrep = buildShare(b)));
  if (!f) { toast('画像を作れませんでした'); return; }

  const payload = { files: [f], title: 'MY SUZU ROAD BOOK',
                    text: '珠洲を ' + nVisited() + ' スポット走破しました。' };
  if (navigator.canShare && navigator.canShare(payload) && navigator.share) {
    try {
      await navigator.share(payload);
      toast('共有シートを開きました');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // 利用者がやめただけ
      console.warn('共有できなかったので保存に切り替えます', e);
    }
  }
  saveFile(f);
  toast('画像を保存しました');
});

/* ---------- 出口導線（準備中） ---------- */

$('#btn-exit').addEventListener('click', () => { $('#modal').hidden = false; });
$('#modal-close').addEventListener('click', () => { $('#modal').hidden = true; });
$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) $('#modal').hidden = true;
});

/* ---------- 書き出し・読み込み ---------- */

const importInput = $('#import-file');

/* 書き出しは年に数回の操作なので、常時出すボタンは置かない。
   代わりに「まだ書き出していない」ことをここで見えるようにしておく。
   記録が溜まるほど強く出るので、必要な人にだけ届く */
function drawExportWhen() {
  const el = $('#export-when');
  if (!el) return;
  const n = nVisited();
  const at = state.exportedAt;

  if (at) {
    el.className = 'export-when';
    el.textContent = '最後の書き出し：' +
      new Date(at).toLocaleString('ja-JP',
        { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } else if (n === 0) {
    el.className = 'export-when';
    el.textContent = 'まだ書き出す記録がありません。';
  } else {
    el.className = 'export-when is-warn';
    el.textContent = 'まだ一度も書き出していません（' + n + 'スポットぶんの記録があります）。';
  }
}

$('#btn-export').addEventListener('click', async () => {
  const n = nVisited();
  if (n === 0) { toast('まだ記録がありません'); return; }
  try {
    const r = await Backup.save(state);
    state.exportedAt = new Date().toISOString();
    Store.saveState(state);
    drawExportWhen();
    toast('書き出しました（' + n + 'スポット・写真' + r.photos + '枚・' +
          Math.round(r.bytes / 1024) + 'KB）');
  } catch (e) {
    console.warn('書き出しに失敗', e);
    toast('書き出せませんでした');
  }
});

$('#btn-import').addEventListener('click', () => {
  importInput.value = '';
  importInput.click();
});

importInput.addEventListener('change', async () => {
  const file = importInput.files && importInput.files[0];
  if (!file) return;
  try {
    const parsed = await Backup.read(file);
    const m    = Object.keys(parsed.state.visits).length;
    const now  = nVisited();
    const when = parsed.exportedAt ? parsed.exportedAt.slice(0, 10) : '日付不明';
    if (!confirm('いまの記録（' + now + 'スポット）を、読み込む記録（' + m + 'スポット・' +
                 when + '書き出し）で置き換えます。よろしいですか。')) return;

    await Backup.restore(parsed);
    state = Store.loadState();
    $('#plate').value = (state.plate || '').replace(/\D/g, '').slice(0, 4);
    await loadPhotoUrls();
    focusId = null;
    refresh();
    toast('記録を復元しました（' + m + 'スポット）');
  } catch (e) {
    console.warn('読み込みに失敗', e);
    toast(e.message || '読み込めませんでした');
  }
});

/** 保存の状況を出す（検証用。本番で見せるものではない） */
async function drawUsage() {
  const el = $('#usage');
  if (el) {
    const u = await Store.usage();
    el.textContent = u
      ? '端末内の使用量 ' + (u.usage / 1048576).toFixed(1) + 'MB ／ 割当 ' +
        (u.quota / 1073741824).toFixed(1) + 'GB'
      : '使用量：この接続（HTTP）では調べられません。HTTPSで開くと表示されます。';
  }
  const sw = $('#sw-status');
  if (sw) {
    sw.textContent = 'オフライン：' + (await offlineStatus()) +
                     '　ホーム画面：' + (isStandalone() ? '追加済み' : '未追加') +
                     // 追加の合図（beforeinstallprompt）が来たか。
                     // 来ない理由は「追加済み」か「条件を満たさない」のどちらか
                     '　追加の合図：' + (installPrompt ? 'あり' : 'なし') +
                     // 端末ごとに写真ボタンの数を変えているので、どちらになったかを出す
                     '　写真：' + (NEED_SHOOT ? '撮る＋アルバム' : 'まとめて1つ') +
                     '　版：' + APP_VERSION;
  }
}

/* ---------- 起動画面 ----------

   動き自体はCSSが持っている。ここでやるのは3つだけ。
   ①合図を出す（is-run）②どこを押してもとばせる（is-skip）③閉じる。 */

const bootEl = $('#boot');

function startBoot() {
  // クラスを付けてから transition を効かせたいので、1フレーム待つ
  requestAnimationFrame(() => bootEl.classList.add('is-run'));

  const back = nVisited() > 0 || (state.revealed || []).length > 0;
  $('#boot-start').textContent = back ? 'つづきから' : 'はじめる';

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bootEl.classList.add('is-skip');
  }
}

bootEl.addEventListener('click', (e) => {
  if (e.target.closest('#boot-start')) return;   // ボタンは別扱い
  bootEl.classList.add('is-skip');
});

$('#boot-start').addEventListener('click', () => {
  bootEl.classList.add('is-out');
  setTimeout(() => {
    bootEl.hidden = true;
    // 覆いの裏で地図を作っているので、出てきたところで寸法を取り直す
    if (map) { map.invalidateSize(); drawFog(); }
  }, 450);
});

/* ---------- 写真の出典 ----------

   CCライセンスはクレジット表示が条件なので、公開版ではアプリ内に出す必要がある。
   credits.json の artist はWikimedia由来のHTMLが入っているため、
   そのまま差し込まず、タグを落としてテキストだけ使う。 */

const stripTags = (html) => {
  const d = document.createElement('div');
  d.innerHTML = String(html || '');
  return (d.textContent || '').trim();
};

/** Commons のファイル紹介ページ。直リンクではなく、出典をたどれる側へ送る */
function commonsPage(title) {
  return /^File:/.test(title || '')
    ? 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(title)
    : '';
}

async function drawCredits() {
  const ul = $('#credits-list');
  if (!ul) return;
  let data;
  try {
    data = await (await fetch('img/credits.json')).json();
  } catch (e) {
    ul.innerHTML = '<li>出典の一覧を読み込めませんでした。</li>';
    return;
  }
  ul.innerHTML = SPOTS.map((s) => {
    const c = data[s.id];
    if (!c) return '';
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = s.name;
    li.appendChild(name);

    const body = document.createElement('span');
    const artist = stripTags(c.artist);
    body.textContent = ' ' + (c.title || '') +
      (artist && artist !== '—' ? ' ／ ' + artist : '') +
      (c.license ? ' ／ ' + c.license : '');
    li.appendChild(body);

    const page = commonsPage(c.title);
    if (page) {
      const a = document.createElement('a');
      a.href = page; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = '出典';
      li.appendChild(document.createTextNode(' '));
      li.appendChild(a);
    }
    if (c.license_url) {
      const a = document.createElement('a');
      a.href = c.license_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'ライセンス';
      li.appendChild(document.createTextNode(' '));
      li.appendChild(a);
    }
    return li.outerHTML;
  }).join('');
}

/* ---------- PWA（ホーム画面に追加して使う） ---------- */

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

let swError = null;

/* 直したものが実機に出てこないときの逃げ道。`?fresh=1` を付けて開くと、
   サービスワーカーと保存済みキャッシュを捨てて、まっさらに読み直す。
   訪問の記録と写真（localStorage・IndexedDB）は消さない。 */
async function hardRefresh() {
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    console.warn('キャッシュを消せませんでした', e);
  }
  location.replace(location.pathname);   // ?fresh=1 を外して読み直す
}

if ('serviceWorker' in navigator && window.isSecureContext && !PARAMS.has('fresh')) {
  /* load を待つ書き方が一般的だが、地図のタイルを読み続けるこのアプリでは
     load が遅れて登録されないことがある。読み込み直後に登録する。 */
  navigator.serviceWorker.register('sw.js')
    .then((reg) => { window.swReg = reg; })
    .catch((e) => { swError = e.name; console.warn('SWの登録に失敗', e); });
}

/* オフライン対応が本当に効いているかを、実際に保存されている件数で判断する。
   登録が成功していても Cache Storage が使えない環境があるため、
   「登録できた＝オフラインで開ける」とは限らない。 */
async function offlineStatus() {
  if (!('serviceWorker' in navigator)) return 'この端末は未対応';
  if (!window.isSecureContext) return 'この接続（HTTP）では使えません';
  if (swError) return '登録に失敗（' + swError + '）';
  try {
    const names = await caches.keys();
    const shell = names.filter((n) => n.indexOf('srb-shell') === 0)[0];
    if (!shell) return '準備中';
    const n = (await (await caches.open(shell)).keys()).length;
    return n > 0 ? '対応あり（' + n + '件を保存済み）' : '準備中';
  } catch (e) {
    return 'この環境ではキャッシュを使えません';
  }
}

/* ---------- ホーム画面への追加 ----------

   案内はGARAGEに常設する。地図の上には出さない（所見35）。
   地図の上に浮かせていたv18までは、案内が出ているあいだ
   縦617pxの端末で地図が100px潰れていた。

   声をかけるのは初回チェックインのあとの短いトースト1回だけ。
   トーストは浮いているだけで、他のものを押しのけない。 */

const HINT_KEY = 'suzuroadbook.installHint';
let installPrompt = null;

/* Android/PC版Chromeはインストールを促せる。iOSにはこのAPIがない。
   ★すでにホーム画面に追加済みの端末にはこの合図が来ない。
     そのため「合図がない」だけでは、追加できないのか追加済みなのか区別がつかない */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  drawInstallPanel();
  // 合図は読み込みのあとに届く。検証用の行も出し直さないと「なし」のまま残る
  drawUsage();
});

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function drawInstallPanel() {
  const panel = $('#install-panel');
  if (!panel) return;

  // アプリとして開いているなら、もう用はない
  if (isStandalone()) { panel.hidden = true; return; }
  panel.hidden = false;

  $('#install-how').textContent = installPrompt
    ? '下のボタンから追加できます。'
    : isIOSDevice()
      ? '画面下の共有ボタン（□に↑）を押して、「ホーム画面に追加」を選んでください。'
      : 'ブラウザのメニュー（⋮）から「アプリをインストール」または「ホーム画面に追加」を選んでください。';
  // ボタンごと隠す。中身だけ消すと、空の行が残って間延びする
  $('#install-acts').hidden = !installPrompt;

  // 追加済みの人に「追加できます」と言い続けないための但し書き
  $('#install-state').textContent = installPrompt || isIOSDevice()
    ? ''
    : '※すでに追加済みの場合は、この案内は無視してかまいません。'
      + '追加済みの端末には、ブラウザから追加の合図が届かないためです。';
}

/** 初回チェックインのあとに一度だけ、トーストで知らせる */
function showInstallHint() {
  if (isStandalone()) return;
  try { if (localStorage.getItem(HINT_KEY)) return; } catch (e) { /* 読めない端末 */ }
  try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* 読めない端末 */ }
  toast('ホーム画面に追加すると記録が消えにくくなります（GARAGEに手順）');
}

$('#install-go').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  drawInstallPanel();
});

/* ---------- タブ・検証用ボタン ---------- */

function showView(name) {
  $$('.tab[data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.remove('is-active'));
  $('#view-' + name).classList.add('is-active');
  if (name === 'map') {
    setTimeout(() => { map.invalidateSize(); drawFog(); syncBottomHeight(); }, 0);
  } else if (name === 'book') {
    drawUsage();
  }
}

$$('.tab[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

$('#btn-fog').addEventListener('click', (e) => {
  fogOff = !fogOff;
  e.currentTarget.classList.toggle('is-on', fogOff);
  e.currentTarget.textContent = fogOff ? '霧を戻す' : '霧を晴らす';
  refresh();
});

$('#btn-reset').addEventListener('click', async () => {
  if (!confirm('この端末に残した記録（チェックイン・写真・コイン）をすべて消します。')) return;
  clearPhotoUrls();
  state = Store.defaultState();
  Store.saveState(state);
  try { await Store.clearPhotos(); } catch (e) { console.warn(e); }
  focusId = null;
  $('#plate').value = '';
  $('#gacha-result').hidden = true;
  closePlay();
  refresh();
  toast('記録を消しました');
});

let toastTimer = null;
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

/* ---------- 起動 ---------- */

function refresh() {
  drawPins();
  drawFog();
  drawRate();
  drawBottom();
  drawBook();
  drawGacha();
  drawGarage();
  drawExportWhen();
  drawInstallPanel();
}

/** 検証用：?seed=1 で「何か所か回ったあと」の状態から始める */
function seedState() {
  const visits = {};
  ['suzunari', 'mitsukejima', 'hachigasaki', 'suzuyaki'].forEach((id, i) => {
    visits[id] = { at: new Date(Date.now() - (4 - i) * 3600e3).toISOString(), photoId: null };
  });
  return { version: 3, visits: visits, plate: '61', coins: 5, revealed: ['rokugozaki'] };
}

/** 旧形式（写真を記録の中に文字列で持っていたもの）を IndexedDB へ移す */
async function migrateOldPhotos() {
  let moved = 0;
  for (const sid of Object.keys(state.visits)) {
    const v = state.visits[sid];
    if (typeof v.photo !== 'string' || !v.photo.startsWith('data:')) continue;
    const id = sid + '-' + Date.now() + '-' + moved;
    await Store.putPhoto(id, await (await fetch(v.photo)).blob());
    v.photoId = id;
    delete v.photo;
    moved += 1;
  }
  if (moved > 0) {
    Store.saveState(state);
    toast('写真' + moved + '枚の保存先を移しました');
  }
}

async function boot() {
  if (PARAMS.has('fresh')) { await hardRefresh(); return; }
  $('#ver').textContent = APP_VERSION;
  state = PARAMS.has('seed') ? seedState() : Store.loadState();
  if (typeof state.coins !== 'number') state.coins = 1;      // 旧い記録からの引き継ぎ
  if (!Array.isArray(state.revealed)) state.revealed = [];
  $('#plate').value = (state.plate || '').replace(/\D/g, '').slice(0, 4);
  refresh();            // 写真の読み込みを待たずに、まず地図を出す
  startBoot();
  startGeo();

  try { await migrateOldPhotos(); } catch (e) { console.warn('移行に失敗', e); }
  try { await loadPhotoUrls(); }    catch (e) { console.warn('写真の読み込みに失敗', e); }
  refresh();
  drawUsage();
  drawCredits();

  // すでに記録がある人には、起動して少し経ってから案内する
  if (nVisited() > 0) setTimeout(showInstallHint, 3000);
}

boot();
