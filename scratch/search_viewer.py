import re

filepath = r"C:\Users\manup\.gemini\antigravity\brain\ec6db0ec-89e8-46a5-913b-c1b308abb97e\.system_generated\steps\118\content.md"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if any(term in line.lower() for term in ["base", "field", "viewno", "getParameterByName", "index"]):
        print(f"{i+1}: {line.strip()}")
