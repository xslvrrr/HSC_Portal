#!/usr/bin/env python3
import json
import time
import urllib.request
import urllib.parse
import ssl
from pathlib import Path
import math

BASE = 'https://thsconline.github.io'
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible)'}
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

def load_papers(path='public/papers.json'):
    p = Path(path)
    data = json.loads(p.read_text(encoding='utf-8'))
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and 'papers' in data:
        return data['papers']
    # else try to guess
    for v in data.values():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return v
    raise RuntimeError('Could not find papers list in JSON')

def construct_download_url(entry):
    v = entry.get('v') or entry.get('viewno')
    name = entry.get('n') or entry.get('name') or ''
    if not v:
        return None
    return f"https://script.google.com/macros/s/AKfycbx69GPoJtf9sSevsUbWtPr46vpa01u4oNkHjFmkkWxmj62AZ0q-/exec?export=download&field={urllib.parse.quote(name)}&base={v}"

def probe_head(url, timeout=20):
    try:
        req = urllib.request.Request(url, headers=HEADERS, method='HEAD')
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            cl = resp.getheader('Content-Length')
            return int(cl) if cl and cl.isdigit() else None
    except Exception:
        # fallback: try GET with Range 0-0
        try:
            req = urllib.request.Request(url, headers={**HEADERS, 'Range': 'bytes=0-0'})
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
                cl = resp.getheader('Content-Length') or resp.getheader('content-length')
                # for ranged request, Content-Range header contains total size
                cr = resp.getheader('Content-Range') or resp.getheader('content-range')
                if cr:
                    # format: bytes 0-0/12345
                    parts = cr.split('/')
                    if len(parts) == 2 and parts[1].isdigit():
                        return int(parts[1])
                if cl and cl.isdigit():
                    return int(cl)
        except Exception:
            return None
    return None

def human(bytes_size):
    if bytes_size is None:
        return 'unknown'
    for unit in ['B','KB','MB','GB','TB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:3.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} PB"

def main():
    papers = load_papers()
    total = len(papers)
    sample_n = 20
    if total < sample_n:
        indices = list(range(total))
    else:
        indices = [math.floor(i * total / sample_n) for i in range(sample_n)]
    sizes = []
    checked = 0
    for idx in indices:
        entry = papers[idx]
        url = construct_download_url(entry)
        if not url:
            print(f"[{idx}] no url for entry")
            continue
        print(f"[{idx}] probing: {url}")
        size = probe_head(url)
        print(f"   size: {human(size)}")
        sizes.append(size)
        checked += 1
        time.sleep(1.0)

    known = [s for s in sizes if isinstance(s,int) and s>0]
    print('\nSampled', checked, 'items, known sizes:', len(known))
    if known:
        avg = sum(known)/len(known)
        total_est = avg * total
        print(f"Average size = {human(avg)}")
        print(f"Estimated total for {total} papers = {human(total_est)}")
        # show small/large
        known_sorted = sorted(known)
        p10 = known_sorted[max(0,int(len(known_sorted)*0.1)-1)]
        p90 = known_sorted[min(len(known_sorted)-1,int(len(known_sorted)*0.9)-1)]
        print(f"10th percentile = {human(p10)}, 90th = {human(p90)}")
        print('Estimate range using p10..p90:')
        print(f"  low = {human(p10*total)}")
        print(f"  high = {human(p90*total)}")
    else:
        print('No size info available from sample. Recommend running a small manual check or estimating per-paper size (e.g., 0.5-3 MB).')

if __name__ == '__main__':
    main()
