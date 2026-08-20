from pathlib import Path
import json
p=Path('public/papers.json')
if not p.exists():
    print('0')
    raise SystemExit(0)
data=json.loads(p.read_text(encoding='utf-8'))
if isinstance(data, dict) and 'papers' in data:
    papers=data['papers']
elif isinstance(data,list):
    papers=data
else:
    candidates=[v for v in data.values() if isinstance(v,list)]
    papers=max(candidates,key=len) if candidates else []
print(len(papers))
