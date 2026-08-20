import urllib.request
import urllib.error
import ssl

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

viewnos = ["1578", "1078", "1378", "1828"]
for v in viewnos:
    for prefix in ["s/index", "json"]:
        url = f"https://thsconline.github.io/{prefix}/{v}.json"
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=3, context=SSL_CTX) as resp:
                print(f"SUCCESS: {url}")
        except urllib.error.HTTPError as e:
            print(f"FAILED: {url} -> {e.code}")
