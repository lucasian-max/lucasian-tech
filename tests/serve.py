"""Static server with one stalling endpoint, so headless Firefox's load event
waits long enough for the harness to render its log before the screenshot."""
import http.server, socketserver, time, mimetypes, os

mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        if self.path.startswith("/hold.gif"):
            time.sleep(14)
            self.send_response(200); self.send_header("Content-Type","image/gif")
            body = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        if self.path.startswith("/slowmod"):
            # /slowmod<seconds>/<path> — delay, then serve <path>
            rest = self.path[len("/slowmod"):]
            secs, _, target = rest.partition("/")
            try:
                time.sleep(min(float(secs), 30))
            except ValueError:
                pass
            self.path = "/" + target
            return super().do_GET()
        if self.path.startswith("/slow"):
            time.sleep(8)
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            body = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8100), H) as s:
    s.serve_forever()
