import json
import random
import urllib.request
import urllib.parse
import ssl
import re
import base64
import time

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

def get_real_pdf_size(paper):
    v = paper.get('v') or paper.get('viewno')
    name = paper.get('n') or paper.get('name') or ''
    if not v or not name:
        return None
        
    url = f'https://script.google.com/macros/s/AKfycbx69GPoJtf9sSevsUbWtPr46vpa01u4oNkHjFmkkWxmj62AZ0q-/exec?export=view&field={urllib.parse.quote(name)}&base={v}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    
    try:
        with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as resp:
            html = resp.read().decode('utf-8')
            
        match = re.search(r'(JVBERi[A-Za-z0-9+/=\\x]+)', html)
        if match:
            b64_str = match.group(1)
            b64_str = b64_str.replace('\\/', '/').replace('\\\\', '\\')
            b64_str = re.sub(r'\\x[0-9a-fA-F]{2}', '', b64_str)
            b64_str = re.sub(r'[^A-Za-z0-9+/=]', '', b64_str)
            
            missing_padding = len(b64_str) % 4
            if missing_padding:
                b64_str += '=' * (4 - missing_padding)
                
            pdf_bytes = base64.b64decode(b64_str)
            if pdf_bytes.startswith(b'%PDF'):
                return len(pdf_bytes)
    except Exception as e:
        print(f"Error checking {name}: {e}")
    return None

def main():
    with open('public/papers.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    papers = data['papers'] if isinstance(data, dict) and 'papers' in data else data
    
    print(f"Total papers in database: {len(papers)}")
    
    # Pick 15 random papers
    sample = random.sample(papers, min(15, len(papers)))
    sizes = []
    
    print("Sampling 15 papers to measure real PDF sizes...")
    for idx, p in enumerate(sample, 1):
        name = p.get('n') or p.get('name') or ''
        size = get_real_pdf_size(p)
        if size:
            sizes.append(size)
            print(f"  [{idx}/15] {name}: {size / 1024 / 1024:.2f} MB")
        else:
            print(f"  [{idx}/15] {name}: Failed or invalid PDF")
        time.sleep(0.5)
        
    if sizes:
        avg_bytes = sum(sizes) / len(sizes)
        total_est_bytes = avg_bytes * len(papers)
        
        print("\nResults:")
        print(f"  Average paper size: {avg_bytes / 1024 / 1024:.2f} MB")
        print(f"  Estimated total storage for {len(papers)} papers: {total_est_bytes / 1024 / 1024 / 1024:.2f} GB")
        print(f"  Min size sampled: {min(sizes) / 1024 / 1024:.2f} MB")
        print(f"  Max size sampled: {max(sizes) / 1024 / 1024:.2f} MB")
    else:
        print("Could not retrieve sizes.")

if __name__ == '__main__':
    main()
