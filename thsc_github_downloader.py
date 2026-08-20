#!/usr/bin/env python3
"""Download THSC papers using the public thsconline/s GitHub repository.

This is a standalone implementation.  It does not read or import any of the
other downloader files in this workspace.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import ssl
import sys
import time
from dataclasses import asdict, dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin
from urllib.request import Request, urlopen

OWNER_REPO = "thsconline/s"
BRANCH = "thsconline-website"
API_TREE = f"https://api.github.com/repos/{OWNER_REPO}/git/trees/{BRANCH}?recursive=1"
RAW = f"https://raw.githubusercontent.com/{OWNER_REPO}/{BRANCH}/"
PAGES = "https://thsconline.github.io/"
HEADERS = {"User-Agent": "THSC-study-downloader/1.0"}
PDF_CALL = re.compile(r"pdf\s*\(\s*this\s*,\s*(\d+)\s*\)", re.I)
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
LEGACY_ENDPOINT = "https://script.google.com/macros/s/AKfycbx69GPoJtf9sSevsUbWtPr46vpa01u4oNkHjFmkkWxmj62AZ0q-/exec"


@dataclass(frozen=True)
class Paper:
    id: str
    label: str
    source: str
    level: str
    subject: str
    category: str
    year: str


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.papers: list[tuple[str, str]] = []
        self.current_id: str | None = None
        self.text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        match = PDF_CALL.search(dict(attrs).get("onclick", "") or "")
        if match:
            self.current_id, self.text = match.group(1), []

    def handle_data(self, data):
        if self.current_id:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.current_id:
            label = " ".join("".join(self.text).split()) or f"paper-{self.current_id}"
            self.papers.append((self.current_id, label))
            self.current_id, self.text = None, []


def get(url: str, timeout: int) -> bytes:
    request = Request(quote(url, safe=":/?&=%#"), headers=HEADERS)
    with urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
        return response.read()


def metadata(path: str) -> tuple[str, str, str]:
    parts = [unquote(x) for x in path.split("/")]
    level = next((x for x in parts if x in {"yr9", "yr10", "yr11", "yr12"}), "other")
    pos = parts.index(level)
    subject = parts[pos + 1] if len(parts) > pos + 2 else "general"
    filename = parts[-1].lower()
    category = "HSC" if "hsc" in filename else "Trials" if "trial" in filename else "Assessments" if "assessment" in filename else "Other"
    return level, subject, category


def catalogue(timeout: int) -> list[Paper]:
    tree = json.loads(get(API_TREE, timeout).decode("utf-8"))
    paths = [entry["path"] for entry in tree["tree"]
             if entry["type"] == "blob" and entry["path"].endswith(".html")
             and entry["path"].split("/", 1)[0] in {"yr9", "yr10", "yr11", "yr12"}]
    print(f"Reading {len(paths)} public paper-list pages from GitHub...", flush=True)
    result: dict[tuple[str, str, str], Paper] = {}
    for number, path in enumerate(paths, 1):
        try:
            parser = PageParser()
            parser.feed(get(urljoin(RAW, path), timeout).decode("utf-8", errors="replace"))
            level, subject, category = metadata(path)
            for paper_id, label in parser.papers:
                match = YEAR.search(label)
                paper = Paper(paper_id, html.unescape(label), path, level, subject, category, match.group(0) if match else "undated")
                result[(paper.id, paper.label, paper.source)] = paper
        except (HTTPError, URLError, TimeoutError, ssl.SSLError) as exc:
            print(f"WARN skipped list page {path}: {exc}", file=sys.stderr, flush=True)
        if number % 25 == 0:
            print(f"  read {number}/{len(paths)} list pages; found {len(result)} papers", flush=True)
    return sorted(result.values(), key=lambda p: (p.level, p.subject, p.category, p.year, p.label))


def urls_for(paper: Paper, timeout: int) -> list[str]:
    index = json.loads(get(urljoin(RAW, f"index/{paper.id}.json"), timeout).decode("utf-8"))
    entries = index.get(paper.label, [])
    if not isinstance(entries, list):
        entries = [entries]
    entries = [entry for entry in entries if isinstance(entry, dict) and entry.get("url")]
    entries.sort(key=lambda entry: not entry.get("default", False))
    urls = []
    for entry in entries:
        url = urljoin(PAGES, entry["url"])
        # /s/em/ is an alias used by the site viewer; public PDF files reside
        # at the corresponding root path on GitHub Pages.
        url = url.replace("https://thsconline.github.io/s/em/", "https://thsconline.github.io/", 1)
        urls.append(quote(url, safe=":/?&=%#"))
    return list(dict.fromkeys(urls))


def legacy_pdf(paper: Paper, timeout: int) -> bytes:
    """Fetch papers not present in the newer index JSON.

    THSC's public ``viewer.js`` calls this endpoint for legacy catalogue IDs;
    it returns ``downloadfile({ ... data: <base64 PDF> ... })``.
    """
    digest = hashlib.sha256(paper.id.encode("utf-8")).hexdigest()
    query = f"?export=data&field={quote(paper.label, safe='')}&base={paper.id}&hash={digest}"
    response = get(LEGACY_ENDPOINT + query, timeout).decode("utf-8", errors="replace")
    match = re.search(r"downloadfile\((\{.*\})\)\s*;?\s*$", response, re.S)
    if not match:
        raise ValueError("legacy endpoint did not return file data")
    data = json.loads(match.group(1)).get("data", "")
    pdf = base64.b64decode(data, validate=True)
    if not pdf.startswith(b"%PDF-"):
        raise ValueError("legacy response was not a PDF")
    return pdf


def component(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', " ", value)
    return re.sub(r"\s+", " ", value).strip(". ")[:100] or "unknown"


def destination(paper: Paper, root: Path) -> Path:
    tag = hashlib.sha1(f"{paper.id}\0{paper.label}\0{paper.source}".encode()).hexdigest()[:8]
    return root / component(paper.level) / component(paper.subject) / component(paper.category) / component(paper.year) / f"{component(paper.label)} [{paper.id}-{tag}].pdf"


def fetch_paper(paper: Paper, root: Path, timeout: int, retries: int) -> str:
    target = destination(paper, root)
    if target.exists() and target.stat().st_size > 4:
        return "skipped"
    error = "no available mirror"
    for _ in range(retries):
        try:
            for url in urls_for(paper, timeout):
                try:
                    data = get(url, timeout)
                    if not data.startswith(b"%PDF-"):
                        raise ValueError("not a PDF")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    temporary = target.with_suffix(".pdf.part")
                    temporary.write_bytes(data)
                    temporary.replace(target)
                    return "downloaded"
                except (HTTPError, URLError, TimeoutError, ssl.SSLError, ValueError, OSError) as exc:
                    error = str(exc)
        except (HTTPError, URLError, TimeoutError, ssl.SSLError, ValueError) as exc:
            error = str(exc)
        try:
            data = legacy_pdf(paper, timeout)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(".pdf.part")
            temporary.write_bytes(data)
            temporary.replace(target)
            return "downloaded"
        except (HTTPError, URLError, TimeoutError, ssl.SSLError, ValueError, OSError) as exc:
            error = str(exc)
        time.sleep(1)
    return f"failed: {error}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Download public THSC papers via thsconline/s on GitHub.")
    parser.add_argument("--out", type=Path, default=Path("THSC Papers - GitHub"))
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    papers = catalogue(args.timeout)
    manifest = args.out / "catalogue.json"
    args.out.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps([asdict(p) for p in papers], indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Catalogue complete: {len(papers)} papers. Saved {manifest}", flush=True)
    if args.limit:
        papers = papers[:args.limit]
    if args.dry_run:
        return 0
    counts = {"downloaded": 0, "skipped": 0, "failed": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(fetch_paper, paper, args.out, args.timeout, args.retries) for paper in papers]
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            outcome = future.result()
            counts["failed" if outcome.startswith("failed:") else outcome] += 1
            if outcome.startswith("failed:"):
                print(outcome, file=sys.stderr, flush=True)
            if number % 25 == 0:
                print(f"  downloads {number}/{len(papers)}: {counts}", flush=True)
    print(f"Finished: {counts}", flush=True)
    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
