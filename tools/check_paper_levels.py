import json
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
with (repo / 'public' / 'papers.json').open(encoding='utf-8') as f:
    data = json.load(f)

yr11 = [p for p in data['papers'] if p.get('l') == 11]
yr12 = [p for p in data['papers'] if p.get('l') == 12]

print(f'Year 11 papers: {len(yr11)}')
print(f'Year 12 papers: {len(yr12)}')
print(f'Total papers: {len(data["papers"])}')
print()
if yr11:
    print('Sample yr11 paper:')
    print(yr11[0])
print()
if yr12:
    print('Sample yr12 paper:')
    print(yr12[0])
