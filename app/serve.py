#!/usr/bin/env python3
"""Static file server for the Mausam app. Avoids os.getcwd() entirely
(explicit `directory=`) since this project's cwd is sometimes unreadable
under the sandboxed process launcher used by the preview tool."""
import functools
import http.server
import socketserver

PORT = 5173
DIRECTORY = "/Users/keshavkumar/Desktop/design_handoff_mausam/app"

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIRECTORY)
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    httpd.serve_forever()
