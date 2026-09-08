#!/usr/bin/env python3
"""Static file server for the Mausam app. Avoids os.getcwd() entirely
(explicit `directory=`) since this project's cwd is sometimes unreadable
under the sandboxed process launcher used by the preview tool.

Code (html/css/js) is served "no-cache" (not "no-store"): the browser
still keeps a local copy but must revalidate with the server on every
request. Python's http.server already answers that revalidation with a
304 Not Modified when the file's mtime hasn't changed, so the full file
is only ever sent once and re-sent only after a real edit — this is what
"no-store" was doing wrong: it forced a full re-download of every JS
file on every single page/nav change, which is what made navigating
between Home/Radar/Alerts/Saved feel slow on a phone. Images/fonts/icons
cache for 24h outright since they change far less often than the code.
"""
import functools
import http.server
import os
import socketserver

PORT = int(os.environ.get("PORT", 5173))
BIND = os.environ.get("BIND", "0.0.0.0")
DIRECTORY = "/Users/keshavkumar/Desktop/design_handoff_mausam/app"

NO_CACHE_EXTENSIONS = (".html", ".css", ".js", ".json")


class SmartCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.split("?")[0].endswith(NO_CACHE_EXTENSIONS) or self.path in ("/", ""):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        super().end_headers()


Handler = functools.partial(SmartCacheHandler, directory=DIRECTORY)
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer((BIND, PORT), Handler) as httpd:
    httpd.serve_forever()
