import json

with open("public/papers.json", "r", encoding="utf-8") as f:
    db = json.load(f)

subjects = db["subjects"]
schools = db["schools"]
papers = db["papers"]

chem_papers = [p for p in papers if subjects[p["s"]] == "Chemistry" and p["c"] == "T"]
for p in chem_papers[:10]:
    print(f"Name: {p['n']}, Subject: {subjects[p['s']]}, School: {schools[p['h']]}, Year: {p['y']}, viewno: {p['v']}")
