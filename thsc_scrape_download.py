#!/usr/bin/env python3
"""Discover and download publicly linked THSC Online papers.

Examples
--------
Preview the catalogue (no files are downloaded):
    python thsc_scrape_download.py --dry-run

Download every discovered paper into ``thsc_papers``:
    python thsc_scrape_download.py --out thsc_papers --workers 3

Resume an interrupted download (the default skips completed PDFs):
    python thsc_scrape_download.py --out thsc_papers

The site lists papers on HTML pages and serves a paper through /s/d/<id>/<name>.
This script only follows those public links, uses a small worker count by default,
and stores a manifest so a run can be inspected or resumed.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import html
import json
import os
from pathlib import Path
import re
import ssl
import sys
import time
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urljoin, urlparse
from urllib.request import Request, urlopen

SITE = "https://thsconline.github.io/s/"
LEVELS = ("yr9", "yr10", "yr11", "yr12")
HEADERS = {"User-Agent": "THSC-public-paper-downloader/1.0 (+local educational use)"}
PDF_CALL = re.compile(r"pdf\s*\(\s*this\s*,\s*(\d+)\s*\)", re.I)
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")


@dataclass(frozen=True)
class Paper:
    paper_id: str
    label: str
    source_page: str
    level: str
    subject: str
    category: str
    year: str


class LinkAndPaperParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.papers: list[tuple[str, str]] = []
        self._paper_id: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "a":
            href = data.get("href")
            if href:
                self.links.append(href)
            onclick = data.get("onclick", "") or ""
            match = PDF_CALL.search(onclick)
            if match:
                self._paper_id = match.group(1)
                self._text = []

    def handle_data(self, data: str) -> None:
        if self._paper_id is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._paper_id is not None:
            label = " ".join("".join(self._text).split()) or f"paper_{self._paper_id}"
            self.papers.append((self._paper_id, label))
            self._paper_id, self._text = None, []


def fetch(url: str, timeout: int) -> tuple[bytes, str]:
    # Directory links on the site contain literal spaces (for example,
    # ``Business Studies/``); urllib requires them percent-encoded.
    url = quote(url, safe=":/?&=%#")
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
        return response.read(), response.geturl()


def clean_component(value: str, fallback: str = "unknown") -> str:
    value = html.unescape(value).strip()
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', " ", value)
    value = re.sub(r"\s+", " ", value).strip(". ")
    return value[:100] or fallback


def page_metadata(url: str) -> tuple[str, str, str]:
    path = [unquote(x) for x in urlparse(url).path.split("/") if x]
    level = next((x for x in path if x.lower() in LEVELS), "other")
    try:
        position = path.index(level)
        subject = path[position + 1] if len(path) > position + 1 else "general"
    except ValueError:
        subject = "general"
    filename = path[-1].lower() if path else ""
    category = ("HSC" if "hsc" in filename else "Trials" if "trial" in filename
                else "Assessments" if "assessment" in filename else "Other")
    return level, subject, category


def is_site_page(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc != urlparse(SITE).netloc or not parsed.path.startswith("/s/"):
        return False
    parts = [part.lower() for part in parsed.path.split("/") if part]
    # Follow only resource directories within a school year and their HTML lists;
    # this excludes viewer, upload, and download routes.
    return any(part in LEVELS for part in parts) and (parsed.path.endswith("/") or parsed.path.endswith(".html"))


def discover(timeout: int, delay: float) -> list[Paper]:
    """Breadth-first crawl of the public level directories and their HTML pages."""
    queue = [urljoin(SITE, f"{level}/") for level in LEVELS]
    visited: set[str] = set()
    papers: dict[tuple[str, str, str], Paper] = {}
    while queue:
        url = queue.pop(0).split("#", 1)[0]
        if url in visited:
            continue
        visited.add(url)
        try:
            raw, _ = fetch(url, timeout)
        except (HTTPError, URLError, TimeoutError, ssl.SSLError) as exc:
            print(f"WARN could not read {url}: {exc}", file=sys.stderr)
            continue
        parser = LinkAndPaperParser()
        parser.feed(raw.decode("utf-8", errors="replace"))
        level, subject, category = page_metadata(url)
        for paper_id, label in parser.papers:
            year_match = YEAR.search(label)
            paper = Paper(paper_id, label, url, level, subject, category,
                          year_match.group(0) if year_match else "undated")
            papers[(paper_id, label, url)] = paper
        for href in parser.links:
            next_url = urljoin(url, href).split("#", 1)[0]
            if is_site_page(next_url) and next_url not in visited:
                queue.append(next_url)
        if delay:
            time.sleep(delay)
    return sorted(papers.values(), key=lambda p: (p.level, p.subject, p.category, p.year, p.label))


def destination(paper: Paper, root: Path) -> Path:
    folder = root / clean_component(paper.level) / clean_component(paper.subject) / clean_component(paper.category) / clean_component(paper.year)
    suffix = hashlib.sha1(f"{paper.paper_id}|{paper.label}".encode()).hexdigest()[:8]
    return folder / f"{clean_component(paper.label)} [{paper.paper_id}-{suffix}].pdf"


def extract_pdf(body: bytes) -> bytes | None:
    if body.startswith(b"%PDF-"):
        return body
    start = body.find(b"%PDF-")
    if start >= 0:
        return body[start:]
    # Some THSC viewer responses embed the document as a base64 string.
    for token in re.findall(rb"[A-Za-z0-9+/]{400,}={0,2}", body):
        try:
            decoded = base64.b64decode(token, validate=True)
            if decoded.startswith(b"%PDF-"):
                return decoded
        except ValueError:
            pass
    return None


def resolve_download_urls(paper: Paper, timeout: int) -> list[str]:
    """Resolve the site's public index entry to ordered public PDF mirrors."""
    index_url = urljoin(SITE, f"index/{paper.paper_id}.json")
    raw, _ = fetch(index_url, timeout)
    entries = json.loads(raw.decode("utf-8"))
    choices = entries.get(paper.label, [])
    if not isinstance(choices, list) or not choices:
        raise ValueError(f"no index entry for {paper.label!r} (id {paper.paper_id})")
    usable = [item for item in choices if item.get("url")]
    if not usable:
        raise ValueError(f"no downloadable URL for {paper.label!r}")
    usable.sort(key=lambda item: not item.get("default", False))
    urls: list[str] = []
    for item in usable:
        url = urljoin(SITE, item["url"])
        # THSC's index uses /s/em/ as a viewer alias, but the actual public
        # mirror is served from the site root (the site's mobile viewer applies
        # this same rewrite before downloading).
        if url.startswith("https://thsconline.github.io/s/em/"):
            url = url.replace("https://thsconline.github.io/s/em/", "https://thsconline.github.io/", 1)
        urls.append(quote(url, safe=":/?&=%#"))
    return list(dict.fromkeys(urls))


def download_one(paper: Paper, root: Path, timeout: int, retries: int, overwrite: bool) -> str:
    target = destination(paper, root)
    if target.exists() and not overwrite and target.stat().st_size > 4:
        return "skipped"
    error = "unknown error"
    for attempt in range(retries):
        try:
            for url in resolve_download_urls(paper, timeout):
                try:
                    body, _ = fetch(url, timeout)
                    pdf = extract_pdf(body)
                    if pdf is None:
                        raise ValueError("response did not contain a PDF")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    partial = target.with_suffix(".pdf.part")
                    partial.write_bytes(pdf)
                    partial.replace(target)
                    return "downloaded"
                except (HTTPError, URLError, TimeoutError, ssl.SSLError, ValueError, OSError) as exc:
                    error = str(exc)
        except (HTTPError, URLError, TimeoutError, ssl.SSLError, ValueError, OSError) as exc:
            error = str(exc)
            time.sleep(1.5 * (attempt + 1))
    return f"failed: {error}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover and download public THSC Online papers.")
    parser.add_argument("--out", type=Path, default=Path("thsc_papers"), help="download folder")
    parser.add_argument("--manifest", type=Path, default=Path("thsc_papers_manifest.json"), help="catalogue JSON file")
    parser.add_argument("--workers", type=int, default=3, help="parallel downloads (default: 3)")
    parser.add_argument("--timeout", type=int, default=45, help="per-request timeout in seconds")
    parser.add_argument("--delay", type=float, default=0.12, help="delay between catalogue-page requests")
    parser.add_argument("--retries", type=int, default=3, help="attempts per paper")
    parser.add_argument("--limit", type=int, default=0, help="only process this many papers")
    parser.add_argument("--dry-run", action="store_true", help="discover and save catalogue, but do not download")
    parser.add_argument("--overwrite", action="store_true", help="redownload files already present")
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be at least 1")

    papers = discover(args.timeout, args.delay)
    args.manifest.write_text(json.dumps([asdict(p) for p in papers], indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Discovered {len(papers)} papers; catalogue saved to {args.manifest}")
    if args.limit:
        papers = papers[:args.limit]
    if args.dry_run:
        for paper in papers[:20]:
            print(f"{paper.level} | {paper.subject} | {paper.category} | {paper.label}")
        if len(papers) > 20:
            print(f"... plus {len(papers) - 20} more")
        return 0

    counts = {"downloaded": 0, "skipped": 0, "failed": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(download_one, p, args.out, args.timeout, args.retries, args.overwrite) for p in papers]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            counts["failed" if result.startswith("failed:") else result] += 1
            if result.startswith("failed:"):
                print(result, file=sys.stderr)
    print("Finished: " + ", ".join(f"{name}={value}" for name, value in counts.items()))
    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
