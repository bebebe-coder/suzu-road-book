# -*- coding: utf-8 -*-
"""このフォルダをHTTPSで配信する。証明書は serve-https.ps1 が用意する。
   位置情報（Geolocation）はHTTPSでないと動かないため、実機でGPSを試すときに使う。

   ポートの既定値を 443（HTTPSの標準ポート）にしてある。
   スマホのアドレス欄に「192.168.x.x」と入れるだけで開けるようにするため。
   ポート番号を打ち間違える・貼り付けのときに落とす、という事故が起きたため。

   あわせてポート80でも待ち受け、来たものはすべてHTTPSへ送り返す。
   iOSのSafariは入力されたアドレスをまずHTTPSで開こうとするが、
   うまくいかないと「このウェブサイトはHTTPSに対応していません」と出してHTTPへ落ちる。
   その落ちた先を受け止めるため。"""
import http.server
import os
import socket
import ssl
import sys
import threading
import webbrowser

HTTPS_PORTS = [443, 8443]       # 上から順に空いている方を使う
HTTP_PORTS = [80, 8080]         # HTTPSへ送り返すためだけのもの
BASE = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(BASE, ".cert", "server.crt")
KEY = os.path.join(BASE, ".cert", "server.key")
QR = os.path.join(BASE, "qr.html")

os.chdir(BASE)

IP = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"

if not (os.path.exists(CERT) and os.path.exists(KEY)):
    sys.exit("証明書がありません。serve-https.ps1（または 起動_HTTPS.cmd）から起動してください。")


# フォルダをまるごと配らないようにする。.cert/ の秘密鍵が同じWi-Fiから読めてしまうため
sys.path.insert(0, BASE)
from safe_server import SafeHandler          # noqa: E402

Handler = SafeHandler


class Redirect(http.server.BaseHTTPRequestHandler):
    """HTTPで来たものをHTTPSへ送り返す"""

    def do_GET(self):
        self.send_response(301)
        self.send_header("Location", HTTPS_BASE + self.path)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    do_HEAD = do_GET

    def log_message(self, fmt, *args):
        pass


def listen(ports, factory):
    """空いているポートを上から探して待ち受ける。全部ふさがっていたら None"""
    for port in ports:
        try:
            return factory(port), port
        except OSError:
            continue
    return None, None


ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT, KEY)


def make_https(port):
    srv = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    return srv


https_srv, https_port = listen(HTTPS_PORTS, make_https)
if https_srv is None:
    sys.exit("HTTPSのポート（443／8443）がどちらもふさがっています。")

HTTPS_BASE = "https://%s%s" % (IP, "" if https_port == 443 else ":%d" % https_port)

http_srv, http_port = listen(
    HTTP_PORTS,
    lambda p: http.server.ThreadingHTTPServer(("0.0.0.0", p), Redirect),
)
if http_srv is not None:
    threading.Thread(target=http_srv.serve_forever, daemon=True).start()


def write_qr():
    """スマホのカメラで読ませるためのページ。アドレスを打たなくて済むように。"""
    html = """<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>スマホで開く</title>
<style>
 :root { color-scheme: light; }
 body { margin:0; min-height:100vh; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:18px;
        background:#f2f8fc; color:#123; font-family:"Segoe UI","Yu Gothic UI",sans-serif; }
 h1 { font-size:20px; margin:0; color:#1c6ea4; }
 #qr { background:#fff; padding:16px; border-radius:16px;
       box-shadow:0 6px 24px rgba(20,60,90,.14); line-height:0; }
 #qr svg { width:260px; height:260px; }
 .url { font-size:26px; font-weight:700; letter-spacing:.04em; }
 .note { font-size:13px; color:#567; max-width:30em; line-height:1.7; text-align:center; }
 .warn { color:#a33; }
</style></head><body>
<h1>スマホのカメラで読み取ってください</h1>
<div id="qr"><span class="warn">QRを作れませんでした（インターネットに出られないときに起きます）。<br>下のアドレスを手で入力してください。</span></div>
<div class="url">__URL__</div>
<p class="note">
 「この接続は安全ではありません」と出ます。このPCが自分で発行した証明書を使っているためです。<br>
 <b>詳細</b> → <b>このWebサイトを閲覧</b> と進んでください。<br>
 そのあと位置情報の確認が出たら「許可」します。
</p>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"
        integrity="sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1"
        crossorigin="anonymous"></script>
<script>
 try {
   var q = qrcode(0, 'M');
   q.addData('__URL__');
   q.make();
   document.getElementById('qr').innerHTML = q.createSvgTag({ cellSize: 8, margin: 1 });
 } catch (e) { /* 読み込めなければ上の案内のまま */ }
</script>
</body></html>
"""
    with open(QR, "w", encoding="utf-8") as f:
        f.write(html.replace("__URL__", HTTPS_BASE + "/"))


write_qr()

print("")
print("  MY SUZU ROAD BOOK  （HTTPS／位置情報あり）")
print("  ------------------------------------------------")
print("")
print("  スマホで開く")
print("      " + HTTPS_BASE + "/")
if http_port is not None:
    print("      ※ http でも https でも、ポートを付けなくても開けます")
print("")
print("  このPCで開く")
print("      https://localhost%s/" % ("" if https_port == 443 else ":%d" % https_port))
print("")
print("  QRコードを別のウィンドウで開きました。スマホのカメラで読めます。")
print("")
print("  ※この証明書はこのPCが自分で発行したものです。")
print("    スマホで「安全ではありません」と出たら、詳細 → このWebサイトを閲覧 と進みます。")
print("")
print("  終了: Ctrl + C")
print("")

if not os.environ.get("SRB_NO_BROWSER"):   # 動作確認のときだけ開かせない
    try:
        webbrowser.open("file:///" + QR.replace(os.sep, "/"))
    except Exception:
        pass

try:
    https_srv.serve_forever()
except KeyboardInterrupt:
    print("\n終了しました。")
