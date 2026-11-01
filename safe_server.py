# -*- coding: utf-8 -*-
"""同じWi-Fi内へ配信するときの、配るファイルの絞り込み。

   フォルダをまるごと公開してはいけない。このフォルダには

     .cert/server.key …… TLSの秘密鍵
     .git/            …… リポジトリまるごと

   が入っていて、どちらも外から読めてはならない。同じWi-Fiにいる人なら誰でも取れてしまう。

   注意：URLの文字列を見て「.」で始まる階層をはじく、では足りない。
   Windows には 8.3 形式の短縮名があり、`.cert` は `CERT~1` でも開ける。
   実際に `/CERT~1/server.key` で秘密鍵が取れることを確認した。
   そのため、**URLではなく、解決後の実ファイルの場所**で判断する。
   realpath は Windows でも短縮名を本来の名前に戻すため、ここで捕まえられる。
"""
import http.server
import os


class SafeHandler(http.server.SimpleHTTPRequestHandler):

    def _root(self):
        return os.path.realpath(getattr(self, "directory", None) or os.getcwd())

    def translate_path(self, path):
        full = super().translate_path(path)
        root = self._root()
        real = os.path.realpath(full)

        # 配信フォルダの外（別ドライブ・シンボリックリンクの先など）は無条件に拒む
        try:
            rel = os.path.relpath(real, root)
        except ValueError:
            return os.path.join(root, "__denied__")
        if rel == os.pardir or rel.startswith(os.pardir + os.sep):
            return os.path.join(root, "__denied__")

        # 本来の名前で見て、「.」で始まる階層が1つでもあれば配らない
        parts = [p for p in rel.split(os.sep) if p not in ("", os.curdir)]
        if any(p.startswith(".") for p in parts):
            return os.path.join(root, "__denied__")

        return full

    def list_directory(self, path):
        # 一覧は出さない。index.html のないフォルダの中身を見せる必要はない
        self.send_error(404, "Not Found")
        return None

    def end_headers(self):
        # 検証中は常に最新を読ませる
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass
