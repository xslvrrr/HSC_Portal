#!/usr/bin/env python3
"""
thsc_downloader.py

A comprehensive, self-contained CLI tool to browse and download past exam papers 
from THSC Online (https://thsconline.github.io/s/).

Features:
- Live scraping of subjects, categories, and papers (no pre-existing JSON required).
- Interactive and CLI-driven filtering by Year Level, Subject, and Category.
- Multi-threaded concurrent downloading.
- Robust retries, backoff, and politeness delays.
- Clean directory organization.
"""

import argparse
import concurrent.futures
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request

BASE_URL = "https://thsconline.github.io"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# SSL context that ignores verification for compatibility
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SUFFIX_KEYWORDS = {
    '_general':      ['general', 'standard'],
    '_advanced':     ['(2u)', 'advanced'],
    '_accelerated':  ['(2u)', 'accelerated'],
    '_extension1':   ['ext 1', 'extension 1'],
    '_extension2':   ['ext 2', 'extension 2'],
    '_paper2_advanced': ['advanced'],
    '_paper2_standard': ['standard'],
    '_sor1':         ['religion 1', 'sor 1', 'sor1'],
    '_sor2':         ['religion 2', 'sor 2', 'sor2'],
}

def fetch_html(url):
    safe_url = urllib.parse.quote(url, safe=':/')
    req = urllib.request.Request(safe_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"  [ERROR] Failed to fetch {safe_url}: {e}")
        return None

def slugify(text, max_length=120):
    if not text:
        return 'unknown'
    text = str(text).strip()
    text = re.sub(r'[\\/:*?"<>|\t\n\r]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    s = re.sub(r'[^0-9a-zA-Z \-_.]', '', text)
    s = s.replace(' ', '_')
    return s[:max_length] if len(s) > max_length else s

def parse_subjects(html, level_prefix):
    pattern = r'href=["\'](?:/s/' + level_prefix + r'/)?([^"\'/]+/)["\'][^>]*>(.*?)</a>'
    matches = re.findall(pattern, html)
    subjects = []
    ignored = {'yr9', 'yr10', 'yr11', 'yr12', 'upload', 'about', 'download', 'fz', 'files'}
    seen = set()
    for relative_path, name in matches:
        subject_key = relative_path.strip('/')
        if subject_key.lower() in ignored or '..' in subject_key:
            continue
        subject_name = name.replace('&nbsp;', ' ').replace('&#38;', '&').strip()
        subject_name = re.sub(r'<[^>]*>', '', subject_name).strip()
        
        dedup_key = (subject_name, subject_key)
        if dedup_key not in seen:
            seen.add(dedup_key)
            subjects.append({
                'key': subject_key,
                'name': subject_name,
                'path': f"/s/{level_prefix}/{relative_path}"
            })
    return subjects

def discover_subpages(html, subject_path):
    pattern = r'href=["\']([^"\']+\.html(?:#[^"\']*)?)["\']'
    matches = re.findall(pattern, html)
    subpages = set()
    ignored_keywords = {'index.html', 'upload', 'about', 'download', 'home', 'back', '..'}
    for link in matches:
        link_no_anchor = link.split('#')[0]
        if any(kw in link_no_anchor.lower() for kw in ignored_keywords):
            continue
        full_url = urllib.parse.urljoin(BASE_URL + subject_path, link_no_anchor)
        if subject_path in full_url:
            subpages.add(full_url)
    return list(subpages)

def resolve_subject_for_subpage(page_url, subject_names):
    filename = page_url.split('/')[-1].lower().replace('.html', '')
    for suffix, keywords in sorted(SUFFIX_KEYWORDS.items(), key=lambda x: -len(x[0])):
        if filename.endswith(suffix):
            for name in subject_names:
                if any(kw in name.lower() for kw in keywords):
                    return name
            return subject_names[0]
    return subject_names[0]

def parse_papers(html, subject_name, level, page_url):
    pattern = r'onclick=["\']pdf\(this,\s*(\d+)\)["\'][^>]*>(.*?)</a>'
    matches = re.findall(pattern, html, re.IGNORECASE)
    filename = page_url.split('/')[-1].lower()
    
    if 'hsc' in filename:
        category = "HSC Papers"
    elif 'trial' in filename:
        category = "Trial Exams"
    elif 'assessment' in filename:
        category = "Assessment Tasks"
    else:
        category = "Other Resources"
        
    papers_list = []
    for viewno, label_raw in matches:
        label = label_raw.replace('&nbsp;', ' ').replace('&amp;', '&').strip()
        label = re.sub(r'<[^>]*>', '', label).strip()
        
        year_match = re.search(r'\b(19\d{2}|20\d{2})\b', label)
        year = year_match.group(1) if year_match else "Other"
        
        school = "NESA"
        has_solution = any(sol in label.lower() for sol in ["sol", "guidelines", "marking", "answers"])
        
        if category in ["Trial Exams", "Assessment Tasks"]:
            school_match = re.match(r'^(.*?)\s+\b(19\d{2}|20\d{2})\b', label)
            if school_match:
                school = school_match.group(1).strip()
            else:
                school = label.split('w. sol')[0].split('sol')[0].strip()
            if not school or len(school) < 2:
                school = "Independent"
        
        school = school.replace(" w.", "").strip()
        # Construct THSC fallback URLs — used when cf field is absent.
        # Cloudflare Pages (via paper.cf) is now the primary PDF source.
        view_url = f"https://thsconline.github.io/s/v/{viewno}/{urllib.parse.quote(label)}"
        download_url = f"https://thsconline.github.io/s/d/{viewno}/{urllib.parse.quote(label)}"
        
        papers_list.append({
            'name': label,
            'viewno': viewno,
            'subject': subject_name,
            'level': level,
            'category': category,
            'year': year,
            'school': school,
            'has_solution': has_solution,
            'viewUrl': view_url,
            'downloadUrl': download_url
        })
    return papers_list

def download_single(paper, outdir, overwrite=False, timeout=60, max_retries=3, delay=0.15):
    viewno = paper.get('viewno') or ''
    label = paper.get('name') or ''
    if not viewno or not label:
        return False, 'No viewno or name'

    # Use direct view URL instead of Google Apps Script
    url = paper.get('viewUrl')
    if not url:
        return False, 'Missing view URL'

    subject_dir = slugify(paper['subject'])
    category_dir = slugify(paper['category'])
    year_dir = slugify(paper['year'])

    target_dir = os.path.join(outdir, subject_dir, category_dir, year_dir)
    os.makedirs(target_dir, exist_ok=True)

    filename = f"{viewno}_{slugify(paper['name'])}.pdf" if viewno else f"{slugify(paper['name'])}.pdf"
    target_path = os.path.join(target_dir, filename)
    tmp_path = target_path + '.part'

    if os.path.exists(target_path) and not overwrite:
        return True, 'Exists'

    time.sleep(delay)
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={**HEADERS, 'Referer': paper.get('viewUrl') or ''})
                b64_str = b64_str.replace('\\/', '/').replace('\\\\', '\\')
                b64_str = re.sub(r'\\x[0-9a-fA-F]{2}', '', b64_str)
                b64_str = re.sub(r'[^A-Za-z0-9+/=]', '', b64_str)
                missing_padding = len(b64_str) % 4
                if missing_padding:
                    b64_str += '=' * (4 - missing_padding)
                import base64 as b64_module
                pdf_bytes = b64_module.b64decode(b64_str)
            # Basic validation
            if not pdf_bytes.startswith(b'%PDF'):
                raise ValueError('Downloaded content is not a PDF')
            with open(tmp_path, 'wb') as out_f:
                out_f.write(pdf_bytes)
            os.replace(tmp_path, target_path)
            return True, 'Downloaded'
        except Exception as e:
            last_err = e
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
            time.sleep(min(3 * attempt, 15))
    return False, str(last_err)

def main():
    parser = argparse.ArgumentParser(description="Download papers from THSC Online")
    parser.add_argument('--out', '-o', default='downloads', help="Output directory")
    parser.add_argument('--concurrency', '-c', type=int, default=4, help="Number of concurrent downloads")
    parser.add_argument('--subject', '-s', help="Specific subject to download (case-insensitive substring, e.g., 'chemistry')")
    parser.add_argument('--level', '-l', choices=['yr12', 'yr11', 'all'], default='all', help="Year level to download")
    parser.add_argument('--category', choices=['hsc', 'trial', 'assessment', 'all'], default='all', help="Category to download")
    parser.add_argument('--overwrite', action='store_true', help="Overwrite existing files")
    parser.add_argument('--limit', type=int, default=0, help="Limit number of files to download")
    parser.add_argument('--dry-run', action='store_true', help="Only list the papers that would be downloaded")
    args = parser.parse_args()

    levels = []
    if args.level in ['yr12', 'all']:
        levels.append({'prefix': 'yr12', 'name': 'Year 12'})
    if args.level in ['yr11', 'all']:
        levels.append({'prefix': 'yr11', 'name': 'Year 11'})

    print("Scraping THSC Online to discover papers...")
    all_papers = []

    for lvl in levels:
        level_url = f"{BASE_URL}/s/{lvl['prefix']}/"
        level_html = fetch_html(level_url)
        if not level_html:
            continue
            
        subjects = parse_subjects(level_html, lvl['prefix'])
        
        # Filter subjects if requested
        if args.subject:
            subjects = [s for s in subjects if args.subject.lower() in s['name'].lower()]
            
        if not subjects:
            continue

        path_to_subjects = {}
        for sub in subjects:
            path_to_subjects.setdefault(sub['path'], []).append(sub)
            
        for path, path_subjects in path_to_subjects.items():
            subject_names = [s['name'] for s in path_subjects]
            subject_html = fetch_html(BASE_URL + path)
            if not subject_html:
                continue
                
            subpages = discover_subpages(subject_html, path)
            for page in subpages:
                # Check category filter from URL name before fetching
                page_file = page.split('/')[-1].lower()
                if args.category == 'hsc' and 'hsc' not in page_file:
                    continue
                if args.category == 'trial' and 'trial' not in page_file:
                    continue
                if args.category == 'assessment' and 'assessment' not in page_file:
                    continue

                page_html = fetch_html(page)
                if not page_html:
                    continue
                
                resolved_subject = resolve_subject_for_subpage(page, subject_names)
                papers = parse_papers(page_html, resolved_subject, lvl['name'], page)
                all_papers.extend(papers)

    # Post-scraping category filter (just in case)
    if args.category != 'all':
        cat_map = {'hsc': 'HSC Papers', 'trial': 'Trial Exams', 'assessment': 'Assessment Tasks'}
        all_papers = [p for p in all_papers if p['category'] == cat_map[args.category]]

    print(f"Found {len(all_papers)} papers matching the criteria.")
    if not all_papers:
        print("No papers found. Exiting.")
        return

    if args.limit > 0:
        all_papers = all_papers[:args.limit]
        print(f"Limited to first {args.limit} papers.")

    if args.dry_run:
        print("\n--- Dry Run: Papers to Download ---")
        for p in all_papers[:50]:
            print(f"[{p['level']}] {p['subject']} - {p['category']} ({p['year']}): {p['name']}")
        if len(all_papers) > 50:
            print(f"... and {len(all_papers) - 50} more.")
        return

    print(f"\nStarting download of {len(all_papers)} papers using {args.concurrency} threads...")
    start_time = time.time()
    stats = {'Downloaded': 0, 'Exists': 0, 'Failed': 0}

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        future_to_paper = {
            executor.submit(download_single, p, args.out, args.overwrite): p 
            for p in all_papers
        }
        for future in concurrent.futures.as_completed(future_to_paper):
            paper = future_to_paper[future]
            try:
                success, status = future.result()
                stats[status if success and status in stats else 'Failed'] += 1
                if not success:
                    print(f"Failed to download: {paper['name']} ({status})")
                elif status == 'Downloaded':
                    print(f"Downloaded: {paper['subject']} - {paper['name']}")
            except Exception as exc:
                stats['Failed'] += 1
                print(f"Paper generated an exception: {paper['name']} -> {exc}")

    elapsed = time.time() - start_time
    print("\nDownload Summary:")
    print(f"  Downloaded: {stats['Downloaded']}")
    print(f"  Skipped (already exists): {stats['Exists']}")
    print(f"  Failed: {stats['Failed']}")
    print(f"  Total time: {elapsed:.2f} seconds")

if __name__ == "__main__":
    main()
