# -*- coding: utf-8 -*-
"""HTTPでの配信。serve.ps1 から呼ばれる。

   `python -m http.server` を直接使わないのは、それだとフォルダを
   まるごと配ってしまい、.cert/ の秘密鍵や .git/ まで読めてしまうため。
   詳しくは safe_server.py を参照。
"""
import os
import sys
import http.server

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from safe_server import SafeHandler          # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE)

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

try:
    http.server.ThreadingHTTPServer(("0.0.0.0", port), SafeHandler).serve_forever()
except KeyboardInterrupt:
    pass
