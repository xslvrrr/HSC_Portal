import json
import re
from pathlib import Path
from urllib.parse import quote

repo = Path(__file__).resolve().parents[1]
root = Path(r"C:\Users\manup\Downloads\THSC Papers - GitHub")
papers_path = repo / "public" / "papers.json"


def normalize(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\s*\[[^\]]+\]$", "", text).strip()
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def build_pdf_url(path: Path) -> str:
    rel = path.relative_to(root).as_posix()
    parts = [quote(part, safe="") for part in rel.split("/")]
    return "https://hscportal.pages.dev/" + "/".join(parts)


with papers_path.open(encoding="utf-8") as f:
    data = json.load(f)

subjects = data.get("subjects", [])
papers = data.get("papers", [])

# Map subject index to name
subject_map = {i: s for i, s in enumerate(subjects)}

# Build a (year_level, subject, title)->url map from the local archive to avoid collisions.
# Map category folder names to subject suffixes for reconstruction
category_suffix_map = {
    "Advanced": "(2U)",       # Maths Advanced → Maths (2U)
    "Extension 1": "Ext 1",   # Maths Extension 1 → Maths Ext 1
    "Extension 2": "Ext 2",   # Maths Extension 2 → Maths Ext 2
}

pdf_lookup = {}
for path in sorted(root.rglob("*.pdf")):
    stem = path.stem
    base_name = re.sub(r"\s*\[[^\]]+\]$", "", stem).strip()
    title_key = normalize(base_name)
    
    # Extract year level from path (yr9, yr10, yr11, yr12)
    year_level = None
    year_idx = -1
    parts = path.parts
    for i, part in enumerate(parts):
        if part in ("yr9", "yr10", "yr11", "yr12"):
            year_level = int(part[2:])
            year_idx = i
            break
    
    if year_idx < 0 or year_idx + 1 >= len(parts):
        continue
    
    # Subject is the part immediately after year level
    subject_folder = parts[year_idx + 1]
    
    # Check if there's a recognized category folder further down
    subject_name = subject_folder
    for i in range(year_idx + 2, len(parts)):
        part = parts[i]
        if part in ("Advanced", "Extension 1", "Extension 2", "Standard", "HSC"):
            if part in ("Standard", "HSC"):
                # Standard/HSC might apply to any subject, but we only map for Maths
                if subject_folder == "Maths":
                    if part == "Standard":
                        subject_name = "Standard Maths"
            else:
                # Advanced/Extension apply to Maths
                if subject_folder == "Maths":
                    suffix = category_suffix_map.get(part)
                    if suffix:
                        subject_name = f"Maths {suffix}"
            break
    
    subject_key = normalize(subject_name)
    combo_key = (year_level, subject_key, title_key)
    pdf_lookup[combo_key] = build_pdf_url(path)

matched = 0
for paper in papers:
    title = paper.get("n") or ""
    subject_idx = paper.get("s")
    level = paper.get("l")  # Year level: 9, 10, 11, 12
    subject_name = subject_map.get(subject_idx, "")
    
    title_key = normalize(title)
    subject_key = normalize(subject_name)
    combo_key = (level, subject_key, title_key)
    
    url = pdf_lookup.get(combo_key)
    if url:
        paper["pdfUrl"] = url
        matched += 1
    else:
        paper.pop("pdfUrl", None)

with papers_path.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"matched {matched} papers")
print(f"generated {len(pdf_lookup)} unique PDF URLs")
