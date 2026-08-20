from xml.etree import ElementTree as ET
from pathlib import Path
p=Path('public/sitemap.xml')
if not p.exists():
    print('MISSING')
    raise SystemExit(1)
try:
    ET.parse(p)
    print('XML_OK')
except Exception as e:
    print('XML_ERR', e)
    raise SystemExit(2)
