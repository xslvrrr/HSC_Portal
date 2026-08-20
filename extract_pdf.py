import urllib.request
import urllib.parse
import ssl
import re
import base64

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

url = 'https://script.google.com/macros/s/AKfycbx69GPoJtf9sSevsUbWtPr46vpa01u4oNkHjFmkkWxmj62AZ0q-/exec?export=view&field=Chemistry%202001%20HSC&base=1820'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})

try:
    with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as resp:
        html = resp.read().decode('utf-8')
        
    print("HTML Length:", len(html))
    
    # Let's find any Base64 string containing JVBERi (PDF magic header in base64)
    # Base64 characters are A-Z, a-z, 0-9, +, /, and sometimes = for padding.
    # A PDF file in base64 will start with JVBERi and be very long.
    match = re.search(r'(JVBERi[A-Za-z0-9+/=\\x]+)', html)
    if match:
        b64_str = match.group(1)
        # Clean up any JavaScript escape sequences if present (like \x0d, \x0a, \/, etc.)
        b64_str = b64_str.replace('\\/', '/').replace('\\\\', '\\')
        b64_str = re.sub(r'\\x[0-9a-fA-F]{2}', '', b64_str) # remove hex escapes if any
        b64_str = re.sub(r'[^A-Za-z0-9+/=]', '', b64_str)   # keep only valid base64 chars
        
        # Pad if necessary
        missing_padding = len(b64_str) % 4
        if missing_padding:
            b64_str += '=' * (4 - missing_padding)
            
        print("Found base64 PDF string. Length:", len(b64_str))
        
        # Decode and save
        pdf_bytes = base64.b64decode(b64_str)
        print("Decoded PDF size:", len(pdf_bytes), "bytes")
        
        if pdf_bytes.startswith(b'%PDF'):
            with open('chemistry_2001_hsc.pdf', 'wb') as f:
                f.write(pdf_bytes)
            print("Successfully saved valid PDF to chemistry_2001_hsc.pdf!")
        else:
            print("Decoded bytes do not start with %PDF. Start bytes:", pdf_bytes[:50])
    else:
        print("Could not find base64 PDF string in HTML.")
        
except Exception as e:
    print("Error:", e)
