'use strict';

/* store.js — 端末内保存だけを扱う。サーバーへ送信するものは何もない。
   ・記録（どこへいつ行ったか）: localStorage（小さいので同期的に読み書きする）
   ・写真の実体               : IndexedDB（Blobのまま置く）

   記録が持つのは写真のIDだけで、実体はIDで引く。
   localStorage は1サイト約5MBで、しかも文字列しか入らない。写真を文字列化すると
   約1.37倍に膨らむため、28枚で頭打ちになる。IndexedDB は Blob をそのまま置けて
   容量の桁が違うので、写真はこちらに逃がしている。 */

const Store = (() => {
  const KEY     = 'suzuroadbook.v1';
  const DB_NAME = 'suzuroadbook';
  const SHOP    = 'photos';
  const VERSION = 1;

  let dbPromise = null;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(SHOP)) d.createObjectStore(SHOP);
        };
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
      });
    }
    return dbPromise;
  }

  /** ひとつのトランザクションを張って fn を実行し、完了を待つ */
  async function run(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx  = d.transaction(SHOP, mode);
      const req = fn(tx.objectStore(SHOP));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror    = () => rej(tx.error);
      tx.onabort    = () => rej(tx.error || new Error('aborted'));
    });
  }

  return {
    defaultState() {
      // visits: spotId -> { at, photoId } ／ plate: 登録ナンバー
      // coins: ガチャ用のコイン ／ revealed: ガチャで知ったスポットのid
      return { version: 3, visits: {}, plate: '', coins: 1, revealed: [] };
    },

    /** 記録を読む。読めない端末（プライベートモード等）では初期状態を返す */
    loadState() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && typeof s === 'object' && s.visits) return s;
        }
      } catch (e) {
        console.warn('記録を読めませんでした', e);
      }
      return this.defaultState();
    },

    /** 記録を保存する。true=保存できた／false=できなかった */
    saveState(state) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.warn('記録を保存できませんでした', e);
        return false;
      }
    },

    clearState() {
      try { localStorage.removeItem(KEY); } catch (e) { /* 読めない端末では何もしない */ }
    },

    getPhoto(id)       { return run('readonly',  (st) => st.get(id)); },
    putPhoto(id, blob) { return run('readwrite', (st) => st.put(blob, id)); },
    delPhoto(id)       { return run('readwrite', (st) => st.delete(id)); },
    clearPhotos()      { return run('readwrite', (st) => st.clear()); },
    photoIds()         { return run('readonly',  (st) => st.getAllKeys()); },

    /** 保存できる状態かと、おおよその使用量を調べる（検証用の表示に使う） */
    async usage() {
      if (!navigator.storage || !navigator.storage.estimate) return null;
      try {
        const e = await navigator.storage.estimate();
        return { usage: e.usage || 0, quota: e.quota || 0 };
      } catch (e) {
        return null;
      }
    }
  };
})();
