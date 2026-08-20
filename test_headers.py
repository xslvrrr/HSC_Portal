import urllib.request
import urllib.parse
import ssl
import re

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

url = 'https://script.google.com/macros/s/AKfycbx69GPoJtf9sSevsUbWtPr46vpa01u4oNkHjFmkkWxmj62AZ0q-/exec?export=view&field=Chemistry%202001%20HSC&base=1820'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as resp:
        html = resp.read().decode('utf-8')
        
    print("HTML Length:", len(html))
    
    # Google Drive file ID regex: usually 33 or 44 characters long
    drive_id_pattern = re.compile(r'\b[a-zA-Z0-9_-]{33,44}\b')
    potential_ids = drive_id_pattern.findall(html)
    print(f"Found {len(potential_ids)} potential Google Drive IDs.")
    
    # Let's filter out common words/strings and print unique ones
    unique_ids = set(potential_ids)
    for pid in unique_ids:
        # standard drive IDs usually contain at least one number and one uppercase letter
        if any(c.isdigit() for c in pid) and any(c.isupper() for c in pid):
            print("Potential Google Drive ID:", pid)
            
    # Look for any base64 encoded PDF data
    if "JVBERi" in html:
        print("Found PDF magic header (JVBERi) in HTML!")
        
except Exception as e:
    print("Error:", e)
