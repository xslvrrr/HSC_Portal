import json
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
with (repo / 'public' / 'papers.json').open(encoding='utf-8') as f:
    papers = json.load(f)['papers']

sample = [p for p in papers if p.get('n') == 'Sydney Tech 2025 w. sol']
assert sample, 'sample paper not found'
assert sample[0].get('pdfUrl'), 'sample paper is missing pdfUrl'
assert 'hscportal.pages.dev' in sample[0]['pdfUrl'], sample[0]
assert 'Sydney%20Tech%202025%20w.%20sol' in sample[0]['pdfUrl'], sample[0]
print('sample paper url ok:', sample[0]['pdfUrl'])
