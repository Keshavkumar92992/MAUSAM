#!/usr/bin/env python3
"""Static file server for the Mausam app. Avoids os.getcwd() entirely
(explicit `directory=`) since this project's cwd is sometimes unreadable
under the sandboxed process launcher used by the preview tool.

Caching is disabled on every response — this is an actively-changing dev
server, and a browser (or phone) silently serving a stale cached CSS/JS
file after an edit has already caused real confusion once this session.
"""
import functools
import http.server
import os
import socketserver

PORT = int(os.environ.get("PORT", 5173))
BIND = os.environ.get("BIND", "0.0.0.0")
DIRECTORY = "/Users/keshavkumar/Desktop/design_handoff_mausam/app"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


Handler = functools.partial(NoCacheHandler, directory=DIRECTORY)
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer((BIND, PORT), Handler) as httpd:
    httpd.serve_forever()
