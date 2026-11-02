/* 登録ナンバーの空き確認と確保。
   持っているのは「その5桁が使われているか」だけで、氏名も連絡先も持たない。

   5桁の形は本物のナンバープレートに合わせてある。
     1文字目 …… ひらがな（あ〜わ のうち、お・し・へ・ん を除いた41字）
     2〜5文字目 … 1〜9999 の数字（先頭の0は詰める。本物に 0115 は無く、115 は ・115 と出る）
   ひらがなが尽きたら A〜Z を足して、1つの数字につき67通りまで。

   ■ 保管は Durable Objects（2026-11-02にKVから移した）

   以前は Workers KV に置いていた。KVは世界中の拠点に写しが置かれる仕組みで、
   書いた内容が全拠点へ行き渡るまで時間差がある。そのため
   「あ は空いている」と2人が同時に見てしまう隙が、ごく稀にあった。
   （上書きだけは書き込み前の確認で防いでいたが、同じ文字を2人に見せる隙は残っていた）

   Durable Objects は、数字1つにつき**世界で1つだけ**の入れ物が割り当てられる。
   その数字に関する確認も確保も必ずそこへ集まり、1件ずつ順番に処理される。
   行列が1本になるので、同時に来ても同じ文字が出ない。これが本来の正しい作りで、
   KVの書き込み枠（1日1,000回）にも縛られなくなる。 */

import { DurableObject } from 'cloudflare:workers';

const SITES = new Set([
  'https://bebebe-coder.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'https://localhost'
]);

const KANA  = 'あいうえかきくけこさすせそたちつてとなにぬねのはひふほまみむめもやゆよらりるれろわ';
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MARKS = (KANA + ALPHA).split('');

/* ---------- 数字1つぶんの台帳 ----------

   数字「61」の台帳は世界に1つしかなく、61に関する処理はすべてそこへ集まる。
   Durable Object は受けた処理を1件ずつ順番に実行するため、
   「空きを読む → 使用済みに書く」の間に別の人が割り込むことがない。
   だから、KVのときに必要だった「書き込む前にもう一度確かめる」が要らなくなる。 */
export class PlateBook extends DurableObject {
  /** 使用済みの文字。1つの文字列にまとめてあり、1回の読み取りで済む */
  async #taken() {
    return (await this.ctx.storage.get('taken')) || '';
  }

  /** 空いている最初の文字。満杯なら mark は null */
  async free() {
    const taken = await this.#taken();
    for (const m of MARKS) {
      if (taken.indexOf(m) < 0) return { mark: m, used: taken.length };
    }
    return { mark: null, used: taken.length };
  }

  /** 空いている文字を1つ確保する。鍵そのものは渡されず、ハッシュだけを預かる */
  async claim(hash) {
    const taken = await this.#taken();
    let mark = null;
    for (const m of MARKS) {
      if (taken.indexOf(m) < 0) { mark = m; break; }
    }
    if (!mark) return { mark: null, used: taken.length };

    // 2つの書き込みをまとめて渡す。片方だけが残ることはない
    await this.ctx.storage.put({
      ['m:' + mark]: { at: new Date().toISOString(), h: hash },
      taken: taken + mark
    });
    return { mark: mark, used: taken.length + 1 };
  }

  /** 別の端末で取り戻すとき、その番号が本人のものかを確かめる */
  async owns(mark, hash) {
    const rec = await this.ctx.storage.get('m:' + mark);
    return !!rec && rec.h === hash;
  }
}

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

/** その数字の台帳を呼び出す。同じ数字なら、世界中のどこから来ても同じ1つに届く */
const book = (env, n) => env.PLATE.get(env.PLATE.idFromName('n:' + n));

/* ---------- 回数の制限 ----------

   Cloudflare の rate limiting バインディング（unsafe）は、この構成では効かなかった。
   1分20回の設定で45回続けても1度も止まらないことを実測している。
   そこで、数えるのに Cache API を使う。

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

/* ---------- 窓口 ---------- */

async function check(env, origin, url) {
  const n = normalize(url.searchParams.get('n'));
  if (!n) return reply(origin, 400, { error: '1〜9999の数字を入れてください' });

  let r;
  try {
    r = await book(env, n).free();
  } catch (e) {
    return reply(origin, 503, { error: 'いま確認できません。時間をおいてお試しください' });
  }

  return reply(origin, 200, {
    number: n,
    mark: r.mark,                      // 空いている最初の文字。満杯なら null
    plate: r.mark ? display(r.mark, n) : null,
    used: r.used,
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

  /* 全体の枠は、実際に書き込むと決まってから数える。
     ここが手前にあると、通らない要求（でたらめな数字）でも枠が減ってしまう。
     Durable Objects に移したのでKVの書き込み枠（1日1,000回）からは外れたが、
     Workers自体の無料枠（1日10万リクエスト）を1人に使い切られないよう上限は残す。 */
  const today = new Date().toISOString().slice(0, 10);
  const perDay = await underLimit('claim-all:' + today, 1000, 86400, true);
  if (perDay === COUNTER_FAIL) {
    return reply(origin, 503, { error: 'いま登録を受け付けられません。時間をおいてお試しください' });
  }
  if (!perDay) {
    return reply(origin, 429, {
      error: '本日の登録受付は上限に達しました。日付が変わると再開しますので、明日お試しください'
    });
  }

  const key = newKey();
  let r;
  try {
    // 鍵そのものは渡さない。台帳が持つのはハッシュだけ
    r = await book(env, n).claim(await sha256(key));
  } catch (e) {
    return reply(origin, 503, { error: 'いま登録を受け付けられません。時間をおいてお試しください' });
  }

  if (!r.mark) return reply(origin, 409, { error: 'この数字は空きがありません', number: n });

  return reply(origin, 200, {
    number: n, mark: r.mark, plate: display(r.mark, n), key: key
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

  let ok;
  try {
    ok = await book(env, n).owns(mark, await sha256(String(body.key)));
  } catch (e) {
    return reply(origin, 503, { error: 'いま確認できません。時間をおいてお試しください' });
  }
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
