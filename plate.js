/* 登録ナンバーの窓口とのやりとり。

   向こう側（Cloudflare Workers）が持っているのは「その5桁が使われているか」だけで、
   氏名も連絡先も送らない。送るのは希望の数字、受け取るのは割り当てられた文字と再発行キー。

   5桁の形は本物のナンバープレートに合わせてある。
     1文字目 …… ひらがな（あ〜わ のうち、お・し・へ・ん を除いた41字）。尽きたら A〜Z
     2〜5文字目 … 1〜9999 の数字（先頭の0は詰める。本物に 0115 は無く、115 は ・115 と出る）

   つながらないときは、番号は端末の中だけの飾りとして今までどおり使える。
   オフラインでアプリが止まらないようにするため、待ち時間を切ってある。 */

const Plate = (function () {

  const API = 'https://suzu-plate.bebebe-coder.workers.dev';
  const WAIT = 8000;

  async function ask(path, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), WAIT);
    try {
      const res = await fetch(API + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data: data };
    } catch (e) {
      // 通信できない・時間切れ。呼ぶ側で「つながらなかった」として扱う
      return { ok: false, status: 0, data: {}, offline: true };
    } finally {
      clearTimeout(timer);
    }
  }

  /** 本物のナンバーに合わせ、先頭の0は詰める。1〜9999 でなければ null */
  function normalize(raw) {
    const d = String(raw == null ? '' : raw).replace(/[^0-9]/g, '').slice(0, 4);
    const n = d.replace(/^0+/, '');
    return (n.length >= 1 && n.length <= 4) ? n : null;
  }

  return {
    normalize: normalize,
    check:  (n) => ask('/v1/check?n=' + encodeURIComponent(n)),
    claim:  (n) => ask('/v1/claim', { n: n }),
    verify: (n, mark, key) => ask('/v1/verify', { n: n, mark: mark, key: key })
  };
})();
