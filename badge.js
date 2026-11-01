/* TOURING BADGE ― バッジの絵と、画像にして共有するところ。

   元案の絵（金属の縁・弧を描くSUZU NOTO・海岸線と灯台・ナンバープレート・リボン）を
   SVGで組み立てる。画像を3枚用意して重ねる手もあるが、SVGにしてあるのは
   ・ナンバーが変わるたびに絵を作り直さなくていい
   ・未獲得のグレー化がCSSのfilter1行で済む
   ・共有用のPNG書き出しで同じ1枚を使い回せる
   の3点のため。生成画像のような階調は出ないので、素材が用意できたら差し替えになる。 */

const Badge = (function () {

  /* 段ごとの色。金属の3色＋その段の景色の色 */
  const SKIN = {
    bronze: {
      m1: '#f6d8b4', m2: '#c9824a', m3: '#8a4d22', ink: '#5e3415',
      sky1: '#fbe3c4', sky2: '#f0a765', sun: '#fff4df',
      sea1: '#c9834a', sea2: '#8d5527', land: '#73421f', road: '#f0d8b8'
    },
    silver: {
      m1: '#fbfdff', m2: '#b3c0cd', m3: '#6e7d8c', ink: '#3d4b58',
      sky1: '#e6eff8', sky2: '#a8c4dd', sun: '#ffffff',
      sea1: '#3f73a3', sea2: '#214a6e', land: '#445d72', road: '#e8f0f8'
    },
    gold: {
      m1: '#fff3bd', m2: '#e3b53f', m3: '#a4760f', ink: '#6f5209',
      sky1: '#fff0c2', sky2: '#ffc06a', sun: '#fffceb',
      sea1: '#5cbcc2', sea2: '#1d7b90', land: '#866527', road: '#fff4da'
    }
  };

  let seq = 0;

  /** 4桁の枠に対して、足りないぶんを中点で埋める（本物のナンバープレートの書式） */
  function plateNumber(digits) {
    const d = String(digits || '').replace(/\D/g, '').slice(0, 4);
    if (!d) return '・・・・';
    return '・'.repeat(4 - d.length) + d;
  }

  /** バッジ1枚。200×200のviewBoxで描く */
  function svg(tier, o) {
    const c = SKIN[tier] || SKIN.bronze;
    const u = 'b' + (++seq) + '-';
    const name = (o && o.name) || tier.toUpperCase();
    // 登録済みなら、本物のプレートと同じく数字の左にひらがなが入る
    const num = ((o && o.mark) || '') + plateNumber(o && o.plate);
    const cls = (o && o.cls) || '00';

    return [
      '<svg class="badge-art" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"',
      '     xmlns:xlink="http://www.w3.org/1999/xlink" role="img"',
      '     aria-label="' + name + ' バッジ 登録ナンバー ' + num + '">',
      '<defs>',
      '  <linearGradient id="' + u + 'rim" x1="0" y1="0" x2="1" y2="1">',
      '    <stop offset="0%" stop-color="' + c.m1 + '"/>',
      '    <stop offset="38%" stop-color="' + c.m2 + '"/>',
      '    <stop offset="62%" stop-color="' + c.m3 + '"/>',
      '    <stop offset="100%" stop-color="' + c.m2 + '"/>',
      '  </linearGradient>',
      '  <linearGradient id="' + u + 'shine" x1="0" y1="0" x2="0.7" y2="1">',
      '    <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>',
      '    <stop offset="42%" stop-color="#ffffff" stop-opacity="0"/>',
      '  </linearGradient>',
      '  <linearGradient id="' + u + 'sky" x1="0" y1="0" x2="0" y2="1">',
      '    <stop offset="0%" stop-color="' + c.sky1 + '"/>',
      '    <stop offset="100%" stop-color="' + c.sky2 + '"/>',
      '  </linearGradient>',
      '  <linearGradient id="' + u + 'sea" x1="0" y1="0" x2="0" y2="1">',
      '    <stop offset="0%" stop-color="' + c.sea1 + '"/>',
      '    <stop offset="100%" stop-color="' + c.sea2 + '"/>',
      '  </linearGradient>',
      '  <radialGradient id="' + u + 'sun">',
      '    <stop offset="0%" stop-color="' + c.sun + '" stop-opacity=".95"/>',
      '    <stop offset="100%" stop-color="' + c.sun + '" stop-opacity="0"/>',
      '  </radialGradient>',
      '  <clipPath id="' + u + 'in"><circle cx="100" cy="100" r="78"/></clipPath>',
      '  <path id="' + u + 'arc" d="M 15,100 A 85,85 0 0 1 185,100" fill="none"/>',
      '</defs>',

      /* 金属の縁 */
      '<circle cx="100" cy="100" r="97" fill="url(#' + u + 'rim)"/>',
      '<circle cx="100" cy="100" r="97" fill="none" stroke="' + c.m3 + '" stroke-width="1.5" opacity=".55"/>',

      /* 中の景色 ― 空・海・島影・海岸線・灯台。
         水平線を上げてあるのは、下にナンバープレートとリボンが重なるため。
         低いと道が完全に隠れてしまい、ROAD BOOK の絵にならない。 */
      '<g clip-path="url(#' + u + 'in)">',
      '  <rect x="20" y="18" width="160" height="70" fill="url(#' + u + 'sky)"/>',
      '  <circle cx="122" cy="76" r="26" fill="url(#' + u + 'sun)"/>',
      '  <circle cx="122" cy="76" r="10" fill="' + c.sun + '" opacity=".9"/>',
      '  <path d="M 20,88 L 34,71 L 45,80 L 58,66 L 72,80 L 82,74 L 94,88 Z"',
      '        fill="' + c.land + '" opacity=".45"/>',
      '  <path d="M 126,88 L 139,77 L 152,88 Z" fill="' + c.land + '" opacity=".32"/>',
      '  <rect x="20" y="87" width="160" height="22" fill="url(#' + u + 'sea)"/>',
      '  <g stroke="' + c.sun + '" stroke-width="1" opacity=".4" stroke-linecap="round">',
      '    <path d="M 104,93 H 142"/><path d="M 110,99 H 136"/><path d="M 96,104 H 130"/>',
      '  </g>',
      /* 手前の陸と、そこを走る道 */
      '  <path d="M 20,180 L 180,180 L 180,107 C 152,102 124,111 100,108',
      '           C 72,105 44,113 20,113 Z" fill="' + c.land + '"/>',
      /* 波打ちぎわ。陸が一枚の塊に見えないように、縁だけ明るくする */
      '  <path d="M 20,113 C 44,113 72,105 100,108 C 124,111 152,102 180,107"',
      '        fill="none" stroke="' + c.sun + '" stroke-width="1.6" opacity=".45"/>',
      '  <path d="M 28,180 C 46,156 70,139 106,128 C 130,121 156,118 177,119',
      '           L 179,128 C 156,127 133,130 111,138 C 78,150 56,165 48,180 Z"',
      '        fill="' + c.road + '" opacity=".95"/>',
      '  <path d="M 40,180 C 58,156 82,140 112,132 C 136,125 158,123 178,124"',
      '        fill="none" stroke="#ffffff" stroke-width="1.7" stroke-dasharray="5 6"',
      '        stroke-linecap="round" opacity=".8"/>',
      /* 灯台 */
      '  <rect x="140" y="106" width="24" height="4" rx="1" fill="#ffffff" opacity=".9"/>',
      '  <path d="M 146,107 L 148,80 L 156,80 L 158,107 Z" fill="#ffffff"/>',
      '  <rect x="146.5" y="80" width="11" height="2" fill="' + c.ink + '" opacity=".8"/>',
      '  <rect x="147.5" y="72" width="9" height="8" fill="' + c.ink + '" opacity=".85"/>',
      '  <path d="M 145,72 L 159,72 L 152,65 Z" fill="' + c.ink + '" opacity=".85"/>',
      '  <path d="M 147,76 L 110,68 L 110,84 Z" fill="' + c.sun + '" opacity=".3"/>',
      /* 左の木立 */
      '  <path d="M 20,126 C 18,110 25,96 33,95 C 43,94 51,104 52,117',
      '           C 53,126 48,132 41,132 L 20,132 Z" fill="' + c.land + '" opacity=".92"/>',
      /* 鳥 */
      '  <g fill="none" stroke="' + c.ink + '" stroke-width="1.2" opacity=".45" stroke-linecap="round">',
      '    <path d="M 50,48 q 4,-4 8,0 q 4,-4 8,0"/>',
      '    <path d="M 72,38 q 3,-3 6,0 q 3,-3 6,0"/>',
      '  </g>',
      '</g>',

      /* 景色と縁の境目 */
      '<circle cx="100" cy="100" r="78" fill="none" stroke="' + c.m3 + '" stroke-width="3.5"/>',
      '<circle cx="100" cy="100" r="81.5" fill="none" stroke="' + c.m1 + '" stroke-width="1.5" opacity=".75"/>',

      /* 弧を描く文字 */
      '<text font-size="13" font-weight="800" letter-spacing="2.6" fill="' + c.ink + '"',
      '      font-family="\'Helvetica Neue\',Arial,sans-serif">',
      '  <textPath href="#' + u + 'arc" xlink:href="#' + u + 'arc"',
      '            startOffset="50%" text-anchor="middle">SUZU NOTO</textPath>',
      '</text>',

      /* ナンバープレート */
      '<g>',
      '  <rect x="56" y="121" width="88" height="34" rx="6" fill="#ffffff"/>',
      '  <rect x="56" y="121" width="88" height="34" rx="6" fill="none"',
      '        stroke="' + c.ink + '" stroke-width="1.2" opacity=".45"/>',
      '  <text x="100" y="132" text-anchor="middle" font-size="9" font-weight="700"',
      '        letter-spacing="1.4" fill="#2a3a46"',
      '        font-family="\'Hiragino Sans\',\'Yu Gothic\',sans-serif">珠洲 ' + cls + '</text>',
      '  <text x="100" y="150" text-anchor="middle" font-size="' + (num.length > 4 ? 17 : 19) + '"',
      '        font-weight="800" letter-spacing="0.5" fill="#17242e"',
      '        font-family="\'Hiragino Sans\',\'Yu Gothic\',monospace">' + num + '</text>',
      '</g>',

      /* リボン */
      '<path d="M 34,160 L 16,164 L 16,184 L 34,179 Z" fill="' + c.m3 + '" opacity=".85"/>',
      '<path d="M 166,160 L 184,164 L 184,184 L 166,179 Z" fill="' + c.m3 + '" opacity=".85"/>',
      '<path d="M 30,158 L 170,158 L 170,181 L 30,181 Z" fill="' + c.m3 + '"/>',
      '<path d="M 30,158 L 170,158 L 170,162 L 30,162 Z" fill="' + c.m1 + '" opacity=".35"/>',
      '<text x="100" y="175" text-anchor="middle" font-size="14" font-weight="800"',
      '      letter-spacing="2.4" fill="#ffffff"',
      '      font-family="\'Helvetica Neue\',Arial,sans-serif">' + name + '</text>',

      /* 光沢。最後に重ねる */
      '<circle cx="100" cy="100" r="97" fill="url(#' + u + 'shine)" pointer-events="none"/>',
      '</svg>'
    ].join('\n');
  }

  /* ---------- 共有用の画像 ---------- */

  /** SNSに出す1枚。1080×1080。バッジのSVGをそのまま拡大して貼る */
  function cardSvg(tier, o) {
    // 入れ子のSVGは幅を明示しないと親の大きさを継いでしまう（既定が100%のため）
    const inner = svg(tier, o)
      .replace('<svg class="badge-art" viewBox="0 0 200 200"',
               '<svg width="200" height="200" viewBox="0 0 200 200"');
    const sub = (o && o.sub) || '';
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
      '     width="1080" height="1080" viewBox="0 0 1080 1080">',
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">',
      '  <stop offset="0%" stop-color="#0d3b5a"/>',
      '  <stop offset="100%" stop-color="#17567f"/>',
      '</linearGradient></defs>',
      '<rect width="1080" height="1080" fill="url(#bg)"/>',
      '<text x="540" y="135" text-anchor="middle" font-size="40" font-weight="800"',
      '      letter-spacing="7" fill="#ffffff" opacity=".92"',
      '      font-family="\'Helvetica Neue\',Arial,sans-serif">MY SUZU ROAD BOOK</text>',
      '<g transform="translate(240,215) scale(3)">',
      inner,
      '</g>',
      '<text x="540" y="930" text-anchor="middle" font-size="44" font-weight="800"',
      '      fill="#ffffff" font-family="\'Hiragino Sans\',\'Yu Gothic\',sans-serif">' + sub + '</text>',
      '<text x="540" y="990" text-anchor="middle" font-size="26" letter-spacing="4"',
      '      fill="#ffffff" opacity=".7"',
      '      font-family="\'Hiragino Sans\',\'Yu Gothic\',sans-serif">石川県 珠洲市</text>',
      '</svg>'
    ].join('\n');
  }

  /** SVGの文字列をPNGのBlobにする。写真は使っていないのでcanvasは汚れない */
  function toPng(markup, size) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        cv.getContext('2d').drawImage(img, 0, 0, size, size);
        cv.toBlob(function (b) {
          b ? resolve(b) : reject(new Error('画像にできませんでした'));
        }, 'image/png');
      };
      img.onerror = function () { reject(new Error('SVGを読み込めませんでした')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
    });
  }

  return { svg: svg, cardSvg: cardSvg, toPng: toPng, plateNumber: plateNumber };
})();
