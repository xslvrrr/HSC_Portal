#!/usr/bin/env python3
import json
import os
import re
import argparse
from pathlib import Path
from datetime import date

def slugify(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s-]", '', s)
    s = re.sub(r"[\s_]+", '-', s)
    s = re.sub(r"-+", '-', s)
    return s.strip('-')

def load_papers(path='public/papers.json'):
    p = Path(path)
    if not p.exists():
        raise SystemExit('public/papers.json not found; run scraper first')
    data = json.loads(p.read_text(encoding='utf-8'))
    # return both the raw data and the papers list when possible
    subjects = data.get('subjects') if isinstance(data, dict) else None
    if isinstance(data, dict) and 'papers' in data:
        return data, data['papers']
    if isinstance(data, list):
        return {'subjects': subjects}, data
    # try to find the largest list
    for v in data.values():
        if isinstance(v, list):
            return data, v
    raise SystemExit('Could not parse papers.json')

HTML_TEMPLATE = '''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <meta property="og:title" content="{og_title}" />
  <meta property="og:description" content="{og_description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{og_url}" />
  <link rel="canonical" href="{canonical}" />
  <meta name="robots" content="index,follow" />
</head>
<body>
  <script>
    // Redirect to SPA root with subject query (client-side filtering)
    location.replace('/?subject={slug}');
  </script>
</body>
</html>
'''

def main():
    data, papers = load_papers()
    subjects_list = data.get('subjects') if isinstance(data, dict) else None

    subj_counts = {}
    for p in papers:
        raw_subj = p.get('subject') or p.get('subjectName') or p.get('s') or 'Unknown'
        # map numeric indexes to subject names when available
        subj_name = None
        if isinstance(raw_subj, int) and subjects_list and 0 <= raw_subj < len(subjects_list):
            subj_name = subjects_list[raw_subj]
        elif isinstance(raw_subj, str) and raw_subj.isdigit() and subjects_list:
            idx = int(raw_subj)
            if 0 <= idx < len(subjects_list):
                subj_name = subjects_list[idx]
        if not subj_name:
            subj_name = str(raw_subj)
        subj_counts[subj_name] = subj_counts.get(subj_name, 0) + 1

    parser = argparse.ArgumentParser(description='Generate per-subject pages and sitemap')
    parser.add_argument('--base-url', default='', help='Base URL to prefix sitemap and og:url (e.g. https://example.com)')
    args = parser.parse_args()

    base = args.base_url.rstrip('/')

    out = Path('public')
    out.mkdir(exist_ok=True)

    urls = []

    # add homepage
    home_url = (base + '/') if base else '/'
    urls.append((home_url, date.today().isoformat()))

    for subj, count in sorted(subj_counts.items(), key=lambda x: (-x[1], x[0])):
        slug = slugify(subj)
        if not slug or slug == 'unknown' or subj.strip().lower() in ('unknown', 'none', ''):
            # skip unknown or empty subjects
            continue
        page_dir = out / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        title = f"{subj} — HSC Past Papers"
        desc = f"Browse {count} past HSC papers for {subj}. Download PDFs, view marking guidelines, and practice exam questions."
        og_path = f"/{slug}/"
        og_url = (base + og_path) if base else og_path
        canonical = og_url
        html = HTML_TEMPLATE.format(title=title, description=desc, og_title=title, og_description=desc, og_url=og_url, canonical=canonical, slug=slug)
        (page_dir / 'index.html').write_text(html, encoding='utf-8')
        urls.append((og_url, date.today().isoformat()))

    # write sitemap.xml
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, lastmod in sorted(urls, key=lambda x: x[0]):
        sitemap.append('  <url>')
        sitemap.append(f'    <loc>{u}</loc>')
        sitemap.append(f'    <lastmod>{lastmod}</lastmod>')
        sitemap.append('  </url>')
    sitemap.append('</urlset>')
    (out / 'sitemap.xml').write_text('\n'.join(sitemap), encoding='utf-8')

    print(f'Wrote {len(urls)-1} subject pages and sitemap.xml')

if __name__ == '__main__':
    main()
