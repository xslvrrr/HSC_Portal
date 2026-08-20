import hashlib
import urllib.request
import urllib.parse
import ssl

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

viewno = "1828"
label = "Abbotsleigh 2001"
hash_val = hashlib.sha256(viewno.encode('utf-8')).hexdigest()

url = f"https://script.google.com/macros/s/AKfycbx69GPoJtf9sSevsUbWtPr46vpa01u4oNkHjFmkkWxmj62AZ0q-/exec?export=view&base={viewno}&field={urllib.parse.quote(label)}&hash={hash_val}"
print("Testing URL:", url)

req = urllib.request.Request(url, headers=HEADERS)
try:
    with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
        content = resp.read().decode('utf-8', errors='ignore')
        print("Response length:", len(content))
        print("First 200 chars of response:")
        print(content[:200])
except Exception as e:
    print("Request failed:", e)
