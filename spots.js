// 珠洲市のスポット定義（プロトタイプ用）
// ※緯度経度はおおよその値。実運用では現地・公式データで要検証。

// 画面の右上に出る版。直したら必ず上げる。sw.js の VERSION と揃えること。
// （揃っていないと、古いキャッシュを開いていても気づけない）
const APP_VERSION = 'v11';

const CATEGORIES = [
  { id: 'all',    name: 'すべて' },
  { id: 'spot',   name: '観光'   },
  { id: 'food',   name: 'グルメ' },
  { id: 'local',  name: '特産'   },
  { id: 'culture',name: '文化'   },
  { id: 'fest',   name: '祭り'   }
];

const SPOTS = [
  { id: 'suzunari',    name: '道の駅すずなり',   area: '飯田町', cat: 'spot',    lat: 37.4372, lng: 137.2598, start: true,
    desc: '旧のと鉄道珠洲駅の跡地にある道の駅。ここが旅のスタート地点。' },
  { id: 'mitsukejima', name: '見附島',           area: '宝立町', cat: 'spot',    lat: 37.4074, lng: 137.2330,
    desc: '軍艦島とも呼ばれる珠洲の象徴。海に浮かぶ島影を正面から撮れる。' },
  { id: 'rokugozaki',  name: '禄剛埼灯台',       area: '狼煙町', cat: 'spot',    lat: 37.5317, lng: 137.3307,
    desc: '能登半島の先端。日本で唯一、海から昇る朝日と海に沈む夕日が同じ場所で見える。' },
  { id: 'suzumisaki',  name: '聖域の岬',         area: '三崎町', cat: 'spot',    lat: 37.5103, lng: 137.3367,
    desc: '金剛崎。暖流と寒流がぶつかる岬で、青の洞窟やランプの宿がある。' },
  { id: 'susujinja',   name: '須須神社',         area: '三崎町', cat: 'fest',    lat: 37.5086, lng: 137.3290,
    desc: '能登半島の東北端を守る古社。寺家キリコ祭りの舞台でもある。' },
  { id: 'suzuyaki',    name: '珠洲焼資料館',     area: '蛸島町', cat: 'culture', lat: 37.4655, lng: 137.3050,
    desc: '中世に日本海沿岸へ広く運ばれた珠洲焼を展示。釉薬を使わない黒い焼き締め。' },
  { id: 'hachigasaki', name: '鉢ヶ崎海岸',       area: '蛸島町', cat: 'spot',    lat: 37.4730, lng: 137.3100,
    desc: '白砂と松林の海岸。駐車場が広く、愛車と海を一緒に撮りやすい。' },
  { id: 'endenmura',   name: '道の駅すず塩田村', area: '清水町', cat: 'local',   lat: 37.4994, lng: 137.1739,
    desc: '日本で唯一残る揚げ浜式製塩の里。外浦の荒い海岸線に面している。' },
  { id: 'gojiraiwa',   name: 'ゴジラ岩',         area: '馬緤町', cat: 'spot',    lat: 37.4436, lng: 137.1447,
    desc: '外浦の海岸に突き出した奇岩。夕景のシルエットが有名。' },
  { id: 'kinoura',     name: '木ノ浦海岸',       area: '長橋町', cat: 'spot',    lat: 37.5222, lng: 137.2583,
    desc: '透明度の高い入り江が続く海岸。狭い道の先に展望所がある。' }
];

/* レア度。カテゴリから引く。ガチャの「予兆」の色と、タメの長さに使う。
   祭り・文化は数が少なく、行くにも段取り（日程・開館時間）が要るのでレアに置いた。
   ※この割り当て自体が検討課題。何をレアにするかで、人の動きが変わる。 */
const RARITY = {
  common:   { key: 'common',   star: '★',   name: 'ノーマル', color: '#5bb0e5', hold: 1000 },
  uncommon: { key: 'uncommon', star: '★★',  name: 'レア',     color: '#35c49a', hold: 1700 },
  rare:     { key: 'rare',     star: '★★★', name: '激レア',   color: '#f2b705', hold: 2500 }
};

const CAT_RARITY = {
  spot: 'common', food: 'uncommon', local: 'uncommon', culture: 'rare', fest: 'rare'
};

/* 獲得できるバッジ。条件は訪問スポット数（BRONZE/SILVER/GOLD） */
const BADGES = [
  { id: 'bronze', name: 'BRONZE', need: 3  },
  { id: 'silver', name: 'SILVER', need: 6  },
  { id: 'gold',   name: 'GOLD',   need: 10 }
];
