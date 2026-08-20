#!/usr/bin/env python3
"""
download_thsc.py

Download THSConline papers listed in `public/papers.json`.

This script reads the metadata JSON produced by `scraper.py` (public/papers.json)
and downloads each paper's `downloadUrl` into an organized folder structure:

  <outdir>/<Subject>/<Year>/<viewno>_<paper-name>.pdf

Features:
- concurrent downloads (thread pool)
- per-file retries and backoff
- safe filenames and directories
- skip-existing behavior with `--overwrite` to force re-download
- dry-run mode to preview actions

Usage examples:
  python download_thsc.py --papers public/papers.json --out downloads --concurrency 6
  python download_thsc.py --papers public/papers.json --out downloads --concurrency 6 --overwrite

IMPORTANT: This script will NOT be executed automatically. Run it locally when you are ready.
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
import ssl

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

# Reuse the same SSL_CTX as other scripts in the repo (skip verification for broader compatibility)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

LOCK = threading.Lock()


def slugify(text, max_length=120):
    if not text:
        return 'unknown'
    text = str(text)
    # replace spaces with underscores
    text = text.strip()
    # remove problematic characters
    text = re.sub(r'[\\/:*?"<>|\t\n\r]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # replace spaces with underscores and limit length
    s = re.sub(r'[^0-9a-zA-Z \-_.]', '', text)
    s = s.replace(' ', '_')
    if len(s) > max_length:
        s = s[:max_length]
    return s or 'item'


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def safe_filename_for_paper(paper):
    # Prefer viewno + slugified name to avoid duplicates
    viewno = str(paper.get('viewno') or paper.get('v') or '')
    name = paper.get('name') or paper.get('paperName') or paper.get('paper') or ''
    base = f"{viewno}_{slugify(name)}" if viewno else slugify(name)
    return base + '.pdf'


def download_single(paper, outdir, overwrite=False, timeout=60, max_retries=3, delay=0.15, quiet=False):
    url = paper.get('downloadUrl') or paper.get('viewUrl') or paper.get('iframeUrl')
    if not url:
        return (False, 'no-url')

    # build target directory by Subject/Year
    subject = str(paper.get('subject') or paper.get('subjectName') or 'Unknown')
    year = str(paper.get('year') or paper.get('y') or 'Other')
    target_dir = os.path.join(outdir, slugify(subject), slugify(year))
    ensure_dir(target_dir)

    filename = safe_filename_for_paper(paper)
    target_path = os.path.join(target_dir, filename)
    tmp_path = target_path + '.part'

    if os.path.exists(target_path) and not overwrite:
        if not quiet:
            print(f"SKIP (exists): {target_path}")
        return (True, 'exists')

    # polite delay to avoid hammering
    time.sleep(delay)

    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={**HEADERS, 'Referer': paper.get('viewUrl') or ''})
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
                # Try to detect filename extension from headers
                content_type = (resp.getheader('Content-Type') or '').lower()
                # stream to temp file
                total_written = 0
                with open(tmp_path, 'wb') as out_f:
                    while True:
                        chunk = resp.read(64 * 1024)
                        if not chunk:
                            break
                        out_f.write(chunk)
                        total_written += len(chunk)

            # rename to final
            os.replace(tmp_path, target_path)
            if not quiet:
                print(f"DOWNLOADED: {target_path} ({total_written} bytes)")
            return (True, 'downloaded')

        except Exception as e:
            last_err = e
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
            wait = min(5 * attempt, 30)
            if not quiet:
                print(f"  [WARN] Attempt {attempt}/{max_retries} failed for {url}: {e} — retrying in {wait}s")
            time.sleep(wait)

    if not quiet:
        print(f"FAILED: {url} — {last_err}")
    return (False, str(last_err))


def load_papers_from_json(path):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # accept either list of dicts or dict with 'papers' key
    if isinstance(data, dict) and 'papers' in data:
        return data['papers']
    if isinstance(data, list):
        return data
    raise ValueError('Unexpected papers.json format')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Download THSC papers listed in a papers.json file')
    parser.add_argument('--papers', '-p', default='public/papers.json', help='path to papers.json (default: public/papers.json)')
    parser.add_argument('--out', '-o', default='downloads', help='output directory')
    parser.add_argument('--concurrency', '-c', type=int, default=4, help='number of concurrent downloads')
    parser.add_argument('--overwrite', action='store_true', help='overwrite existing files')
    parser.add_argument('--delay', type=float, default=0.15, help='delay (seconds) between requests')
    parser.add_argument('--retries', type=int, default=3, help='per-file retry count')
    parser.add_argument('--timeout', type=int, default=60, help='HTTP timeout seconds')
    parser.add_argument('--limit', type=int, default=0, help='limit number of downloads (0 = all)')
    parser.add_argument('--dry-run', action='store_true', help="Don't download, only show what would be downloaded")
    parser.add_argument('--quiet', action='store_true', help='Reduce output')
    args = parser.parse_args(argv)

    try:
        papers = load_papers_from_json(args.papers)
    except Exception as e:
        print(f"ERROR: Could not load papers list: {e}")
        sys.exit(2)

    print(f"Loaded {len(papers)} papers from {args.papers}")

    if args.limit and args.limit > 0:
        papers = papers[:args.limit]

    if args.dry_run:
        print("Dry-run: listing first 50 items (or fewer)")
        for p in papers[:50]:
            subject = p.get('subject') or p.get('subjectName') or 'Unknown'
            year = p.get('year') or p.get('y') or 'Other'
            print(f"{p.get('viewno')} - {subject} - {year} - {p.get('name')}")
        return

    start = time.time()
    stats = {'downloaded': 0, 'exists': 0, 'failed': 0}

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as exe:
        futures = []
        for paper in papers:
            futures.append(exe.submit(download_single, paper, args.out, args.overwrite, args.timeout, args.retries, args.delay, args.quiet))

        for fut in concurrent.futures.as_completed(futures):
            ok, reason = fut.result()
            if ok and reason == 'downloaded':
                stats['downloaded'] += 1
            elif ok and reason == 'exists':
                stats['exists'] += 1
            else:
                stats['failed'] += 1

    elapsed = time.time() - start
    print('\nDownload complete')
    print(f"  Downloaded: {stats['downloaded']}")
    print(f"  Skipped (existing): {stats['exists']}")
    print(f"  Failed: {stats['failed']}")
    print(f"  Elapsed: {elapsed:.1f}s")


if __name__ == '__main__':
    main()
