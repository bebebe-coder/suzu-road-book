'use strict';

/* backup.js — 記録の書き出しと読み込み。
   端末内の保存はブラウザの都合で消えることがある（機種変更、ブラウザの変更、
   サイトデータの削除、iOS Safari の7日ルール）。ファイルに書き出しておけば、
   クラウドドライブ等に置いて別の端末で復元できる。
   ファイルの中身は利用者の手元にあるだけで、どこにも送信しない。 */

const Backup = (() => {
  const APP     = 'suzu-road-book';
  const VERSION = 1;

  /** 壊れたファイルを読み込まないための簡単な検査値（FNV-1a 32bit） */
  function checksum(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(url) {
    return (await fetch(url)).blob();
  }

  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  return {
    /** 記録と写真をJSONファイル1本にまとめて書き出す */
    async save(state) {
      const photos = {};
      for (const v of Object.values(state.visits)) {
        if (!v.photoId) continue;
        const blob = await Store.getPhoto(v.photoId);
        if (blob) photos[v.photoId] = await blobToDataUrl(blob);
      }

      const payload = {
        app: APP,
        version: VERSION,
        exportedAt: new Date().toISOString(),
        state: state,
        photos: photos
      };
      payload.checksum = checksum(JSON.stringify(payload.state) + JSON.stringify(payload.photos));

      const text = JSON.stringify(payload, null, 1);
      const url  = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'suzu-road-book-' + stamp() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      return { bytes: text.length, photos: Object.keys(photos).length };
    },

    /** 読み込んだファイルを検査して返す。問題があれば例外を投げる */
    async read(file) {
      let obj;
      try {
        obj = JSON.parse(await file.text());
      } catch (e) {
        throw new Error('ファイルを読めません。書き出したJSONファイルを選んでください。');
      }
      if (!obj || obj.app !== APP) {
        throw new Error('このアプリの記録ファイルではありません。');
      }
      if (obj.version > VERSION) {
        throw new Error('新しい形式のファイルです。アプリを更新してください。');
      }
      if (!obj.state || typeof obj.state !== 'object' || !obj.state.visits) {
        throw new Error('記録が入っていないファイルです。');
      }
      if (obj.checksum &&
          obj.checksum !== checksum(JSON.stringify(obj.state) + JSON.stringify(obj.photos || {}))) {
        throw new Error('ファイルが壊れています。');
      }
      return { state: obj.state, photos: obj.photos || {}, exportedAt: obj.exportedAt || '' };
    },

    /** 読み込んだ内容を端末に書き戻す（いまの記録は置き換わる） */
    async restore(parsed) {
      await Store.clearPhotos();
      for (const [id, url] of Object.entries(parsed.photos)) {
        await Store.putPhoto(id, await dataUrlToBlob(url));
      }
      Store.saveState(parsed.state);
    }
  };
})();
