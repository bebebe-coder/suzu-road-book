/* 登録ナンバーの空き確認と確保。
   持っているのは「その5桁が使われているか」だけで、氏名も連絡先も持たない。

   5桁の形は本物のナンバープレートに合わせてある。
     1文字目 …… ひらがな（あ〜わ のうち、お・し・へ・ん を除いた41字）
     2〜5文字目 … 1〜9999 の数字（先頭の0は詰める。本物に 0115 は無く、115 は ・115 と出る）
   ひらがなが尽きたら A〜Z を足して、1つの数字につき67通りまで。

   KVの無料枠は読み取り10万回／日に対し、**書き込みは1,000回／日**しかない。
   そのため「空いているか」は読み取りだけで済ませ、書き込むのは確保する瞬間だけにしてある。
   空き探しも、1文字ずつ67回読むのではなく、使用済みを1つのキーにまとめて1回で読む。 */

const SITES = new Set([
  'https://bebebe-coder.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'https://localhost'
]);

const KANA  = 'あいうえかきくけこさすせそたちつてとなにぬねのはひふほまみむめもやゆよらりるれろわ';
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MARKS = (KANA + ALPHA).split('');

/* ---------- 小物 ---------- */

function headers(origin) {
  const h = { 'content-type': 'application/json; charset=utf-8' };
  if (SITES.has(origin)) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-headers'] = 'content-type';
    h['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    h['access-control-max-age'] = '86400';
    h['vary'] = 'Origin';
  }
  return h;
}

const reply = (origin, status, body) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });

/** 本物のナンバーに合わせ、先頭の0は詰める（0115 → 115 →「・115」と出る） */
function normalize(raw) {
  const d = String(raw == null ? '' : raw).replace(/[^0-9]/g, '').slice(0, 4);
  const n = d.replace(/^0+/, '');
  return (n.length >= 1 && n.length <= 4) ? n : null;
}

/** 表示の形。4桁に満たないぶんを中点で埋める */
const display = (mark, n) => mark + '・'.repeat(4 - n.length) + n;

function newKey() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- 回数の制限 ----------

   Cloudflare の rate limiting バインディング（unsafe）は、この構成では効かなかった。
   1分20回の設定で45回続けても1度も止まらないことを実測している。
   そこで、数えるのに Cache API を使う。KVの書き込み枠（1日1,000回）を使わずに済む。

   厳密ではない（同時に来ると数え落とす／Cloudflareの拠点ごとに別勘定）。
   それでも、素朴な連打を止めるには十分で、ここでの目的はそれ。
   実測では、1時間10回の設定で11回目から止まることを確認している。

   strict を立てた窓口では、数えられなかったときに通さない。
   書き込みを伴う確保は、数を把握できないまま通すほうが危ない。 */

const COUNTER = 'https://counter.suzu-plate.invalid/';

const COUNTER_FAIL = Symbol('数えられなかった');

async function underLimit(key, limit, ttl, strict) {
  try {
    const cache = caches.default;
    const req = new Request(COUNTER + encodeURIComponent(key));
    const hit = await cache.match(req);
    const n = hit ? (Number(await hit.text()) || 0) : 0;
    if (n >= limit) return false;
    await cache.put(req, new Response(String(n + 1), {
      headers: { 'cache-control': 'max-age=' + ttl }
    }));
    return true;
  } catch (e) {
    // 読み取りだけの窓口は通す。書き込む窓口は止める
    return strict ? COUNTER_FAIL : true;
  }
}

/** その数字で空いている最初の文字。使用済みは idx:<数字> に1つの文字列でまとめてある */
async function firstFree(env, n) {
  const taken = (await env.PLATES.get('idx:' + n)) || '';
  for (const m of MARKS) if (taken.indexOf(m) < 0) return { mark: m, taken: taken };
  return { mark: null, taken: taken };
}

/* ---------- 窓口 ---------- */

async function check(env, origin, url) {
  const n = normalize(url.searchParams.get('n'));
  if (!n) return reply(origin, 400, { error: '1〜9999の数字を入れてください' });

  const { mark, taken } = await firstFree(env, n);
  return reply(origin, 200, {
    number: n,
    mark: mark,                       // 空いている最初の文字。満杯なら null
    plate: mark ? display(mark, n) : null,
    used: taken.length,
    total: MARKS.length
  });
}

async function claim(env, origin, req, ip) {
  /* 相手ごとの制限は先に。ここが後ろだと、でたらめな要求で全体の枠を削れてしまう */
  const perIp = await underLimit('claim-ip:' + ip, 10, 3600, true);
  if (perIp === COUNTER_FAIL) {
    return reply(origin, 503, { error: 'いま登録を受け付けられません。時間をおいてお試しください' });
  }
  if (!perIp) {
    return reply(origin, 429, { error: '登録の回数が多すぎます。しばらくしてからお試しください' });
  }

  let body;
  try { body = await req.json(); } catch (e) { body = {}; }

  const n = normalize(body.n);
  if (!n) return reply(origin, 400, { error: '1〜9999の数字を入れてください' });

  const { mark, taken } = await firstFree(env, n);
  if (!mark) return reply(origin, 409, { error: 'この数字は空きがありません', number: n });

  /* 使用済み一覧（idx）の反映には時間差があるため、ごく稀に
     すでに誰かが持っている番号を「空き」と見てしまうことがある。
     その番号の本体をもう一度見て、あれば上書きしない。
     上書きを許すと、先に持っていた人の鍵が消えて番号を奪える。 */
  if (await env.PLATES.get('plate:' + mark + n)) {
    return reply(origin, 409, { error: 'ちょうど埋まりました。もう一度お試しください', number: n });
  }

  /* 全体の枠は、実際に書き込むと決まってから数える。
     ここが手前にあると、通らない要求（でたらめな数字・満杯の数字）でも枠が減ってしまう。
     確保は1回につきKVへ2回書く。書き込み枠は1日1,000回なので、300件で600回。 */
  const today = new Date().toISOString().slice(0, 10);
  const perDay = await underLimit('claim-all:' + today, 300, 86400, true);
  if (perDay === COUNTER_FAIL) {
    return reply(origin, 503, { error: 'いま登録を受け付けられません。時間をおいてお試しください' });
  }
  if (!perDay) {
    return reply(origin, 429, {
      error: '本日の登録受付は上限に達しました。日付が変わると再開しますので、明日お試しください'
    });
  }

  const key = newKey();
  try {
    await env.PLATES.put('plate:' + mark + n, JSON.stringify({
      at: new Date().toISOString(),
      h: await sha256(key)           // 鍵そのものは置かない
    }));
    await env.PLATES.put('idx:' + n, taken + mark);
  } catch (e) {
    /* KVの書き込み枠（1日1,000回）を使い切ると、ここで落ちる。
       そのまま500にすると何が起きたか分からないので、はっきり返す。
       空き確認（読み取り）は10万回／日あるので、そちらは動き続ける。 */
    return reply(origin, 503, {
      error: '本日の登録受付は終了しました。日付が変わると再開しますので、明日お試しください'
    });
  }

  return reply(origin, 200, {
    number: n, mark: mark, plate: display(mark, n), key: key
  });
}

/** 別の端末で取り戻すとき、その番号が本人のものかを確かめる */
async function verify(env, origin, req) {
  let body;
  try { body = await req.json(); } catch (e) { body = {}; }

  const n = normalize(body.n);
  const mark = String(body.mark || '');
  if (!n || MARKS.indexOf(mark) < 0 || !body.key) {
    return reply(origin, 400, { error: '番号と鍵を渡してください' });
  }
  const rec = await env.PLATES.get('plate:' + mark + n, 'json');
  const ok = !!rec && rec.h === await sha256(String(body.key));
  return reply(origin, ok ? 200 : 404, { ok: ok });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (!SITES.has(origin)) return reply('', 403, { error: 'この窓口は指定のサイトからのみ使えます' });

    // 同じ相手からの連打を止める。67万件を総取りされないようにするため
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await underLimit('all:' + ip, 60, 60, false)) {
      return reply(origin, 429, { error: '少し時間をおいてからお試しください' });
    }

    if (req.method === 'GET'  && url.pathname === '/v1/check')  return check(env, origin, url);
    if (req.method === 'POST' && url.pathname === '/v1/claim')  return claim(env, origin, req, ip);
    if (req.method === 'POST' && url.pathname === '/v1/verify') return verify(env, origin, req);

    return reply(origin, 404, { error: 'そのような窓口はありません' });
  }
};
