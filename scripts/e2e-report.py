#!/usr/bin/env python3
"""Reads `chrome --dump-dom` output on stdin, prints the e2e checks, exits 0 only if all passed."""
import html
import json
import re
import sys

dom = sys.stdin.read()
blocks = re.findall(r'<pre id="result">(\{.*?\})</pre>', dom, re.S)
if not blocks:
    print("NO RESULT BLOCK: the e2e page did not finish")
    sys.exit(1)
report = json.loads(html.unescape(blocks[-1]))
print("all checks passed" if report["allPass"] else "SOME CHECKS FAILED")
for r in report["results"]:
    print(f"  {'PASS' if r['ok'] else 'FAIL'}  {r['name']}  |  {r['detail']}")
sys.exit(0 if report["allPass"] else 2)
