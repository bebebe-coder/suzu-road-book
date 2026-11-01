# -*- coding: utf-8 -*-
"""同じWi-Fi内へ配信するときの、配るファイルの絞り込み。

   フォルダをまるごと公開してはいけない。このフォルダには

     .cert/server.key …… TLSの秘密鍵
     .git/            …… リポジトリまるごと

   が入っていて、どちらも外から読めてはならない。
   同じWi-Fiにいる人なら誰でも取れてしまうため、先頭が「.」で始まる階層は
   まとめて「無いもの」として扱う。
"""
import http.server
from urllib.parse import urlsplit, unquote


class SafeHandler(http.server.SimpleHTTPRequestHandler):

    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        if any(seg.startswith(".") for seg in path.split("/") if seg):
            self.send_error(404, "Not Found")
            return None
        return super().send_head()

    def end_headers(self):
        # 検証中は常に最新を読ませる
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass
