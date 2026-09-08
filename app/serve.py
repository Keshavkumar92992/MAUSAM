#!/usr/bin/env python3
"""Static file server for the Mausam app. Avoids os.getcwd() entirely
(explicit `directory=`) since this project's cwd is sometimes unreadable
under the sandboxed process launcher used by the preview tool.

Code (html/css/js) is served no-cache — this is an actively-changing dev
server, and a browser (or phone) silently serving a stale cached JS file
after an edit has already caused real confusion once this session.
Images/fonts/icons are cached normally: they're several hundred KB each,
almost never change, and re-fetching every single one of them on every
persona switch (no caching at all, the previous behaviour here) is what
made the app feel laggy over a phone's Wi-Fi connection.
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
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        super().end_headers()


Handler = functools.partial(SmartCacheHandler, directory=DIRECTORY)
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer((BIND, PORT), Handler) as httpd:
    httpd.serve_forever()
