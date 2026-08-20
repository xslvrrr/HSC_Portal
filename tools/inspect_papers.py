#!/usr/bin/env python3
import json
from pathlib import Path

path = Path('public/papers.json')
if not path.exists():
    print('ERROR: public/papers.json not found')
    raise SystemExit(1)

data = json.loads(path.read_text(encoding='utf-8'))

if isinstance(data, list):
    papers = data
elif isinstance(data, dict) and 'papers' in data:
    papers = data['papers']
else:
    # fallback: try to find list-like entries
    candidates = []
    for k,v in data.items():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            candidates.append((k,len(v)))
    if candidates:
        # pick the largest candidate
        key = max(candidates, key=lambda x: x[1])[0]
        papers = data[key]
        print(f"Note: using key '{key}' with {len(papers)} items")
    else:
        print('ERROR: Could not detect papers list in JSON')
        raise SystemExit(2)

print(f'Total entries: {len(papers)}')

keys = set()
for i,p in enumerate(papers[:20]):
    keys.update(p.keys())

print('Sample keys in paper objects (first 20 entries):')
print(sorted(keys))

sizes_known = [p.get('size') or p.get('filesize') or p.get('contentLength') for p in papers if isinstance(p,dict)]
known = [s for s in sizes_known if isinstance(s,(int,float))]
if known:
    total = sum(known)
    print(f'Found {len(known)} entries with numeric size fields. Sum = {total} bytes ({total/1024/1024:.2f} MB)')
else:
    print('No numeric size fields detected in sample entries.')

print('\nSample entries:')
for p in papers[:10]:
    name = p.get('name') or p.get('paperName') or p.get('n') or 'UNKNOWN'
    view = p.get('viewno') or p.get('v') or p.get('view') or p.get('viewUrl') or p.get('downloadUrl') or ''
    print('-', name, view)
