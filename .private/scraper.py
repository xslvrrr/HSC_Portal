import urllib.request
import urllib.parse
import re
import json
import time
import os
import ssl

BASE_URL = "https://thsconline.github.io"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

# Create SSL context that skips certificate verification (macOS Python compatibility)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


# Mapping of filename suffixes to subject-matching keywords.
# When multiple subjects share the same directory (e.g. /Maths/), the subpage
# filename suffix is used to match against the subject names that link to that
# directory. This handles cases where names vary between year levels (e.g.
# "General Maths" in Year 11 vs "Standard Maths" in Year 12 both use _general).
#
# For English: pages without a level-specific suffix (hscpapers.html,
# trialpapers_paper1.html, assessment-tasks.html) contain papers shared across
# both Advanced and Standard — these get assigned to the first subject in the
# group (usually "English Advanced") as a sensible default.
SUFFIX_KEYWORDS = {
    # Maths suffixes
    '_general':      ['general', 'standard'],       # Matches "General Maths" or "Standard Maths"
    '_advanced':     ['(2u)', 'advanced'],           # Matches "Maths (2U)"
    '_accelerated':  ['(2u)', 'accelerated'],        # Yr11 accelerated → Maths (2U)
    '_extension1':   ['ext 1', 'extension 1'],       # Matches "Maths Ext 1"
    '_extension2':   ['ext 2', 'extension 2'],       # Matches "Maths Ext 2"
    # English suffixes
    '_paper2_advanced': ['advanced'],                 # Matches "English Advanced"
    '_paper2_standard': ['standard'],                 # Matches "English Standard"
    # Studies of Religion suffixes
    '_sor1':         ['religion 1', 'sor 1', 'sor1'], # Matches "Studies of Religion 1"
    '_sor2':         ['religion 2', 'sor 2', 'sor2'], # Matches "Studies of Religion 2"
}

def fetch_html(url):
    # Safely URL-encode spaces and special characters in paths
    safe_url = urllib.parse.quote(url, safe=':/')
    print(f"Fetching: {safe_url}")
    req = urllib.request.Request(safe_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"  [ERROR] Failed to fetch {safe_url}: {e}")
        return None

def parse_subjects(html, level_prefix):
    # Find links like <a href="/s/yr12/Chemistry/">Chemistry</a> or <a href="Chemistry/">Chemistry</a>
    # Let's match href="([^"]+/)" or href='([^']+/)' inside s/yrXX/
    pattern = r'href=["\'](?:/s/' + level_prefix + r'/)?([^"\'/]+/)["\'][^>]*>(.*?)</a>'
    matches = re.findall(pattern, html)
    
    subjects = []
    ignored = {'yr9', 'yr10', 'yr11', 'yr12', 'upload', 'about', 'download', 'fz', 'fz/', 'files', 'files/'}
    seen = set()  # Deduplicate entries (same name+path)
    
    for relative_path, name in matches:
        subject_key = relative_path.strip('/')
        if subject_key.lower() in ignored or '..' in subject_key:
            continue
        
        # Clean subject name
        subject_name = name.replace('&nbsp;', ' ').replace('&#38;', '&').strip()
        # Clean extra html tags if any
        subject_name = re.sub(r'<[^>]*>', '', subject_name).strip()
        
        dedup_key = (subject_name, subject_key)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        
        subjects.append({
            'key': subject_key,
            'name': subject_name,
            'path': f"/s/{level_prefix}/{relative_path}"
        })
        
    return subjects

def discover_subpages(html, subject_path):
    # Find all local .html page links in the subject page
    # E.g. <a href="hscpapers.html">...</a> or <a href="/s/yr12/Chemistry/trialpapers.html">...</a>
    pattern = r'href=["\']([^"\']+\.html(?:#[^"\']*)?)["\']'
    matches = re.findall(pattern, html)
    
    subpages = set()
    ignored_keywords = {'index.html', 'upload', 'about', 'download', 'home', 'back', '..'}
    
    for link in matches:
        # Strip anchor fragment for deduplication
        link_no_anchor = link.split('#')[0]
        
        # Check if it goes up or to main navigation
        if any(keyword in link_no_anchor.lower() for keyword in ignored_keywords):
            continue
            
        # Resolve full URL (without anchor)
        full_url = urllib.parse.urljoin(BASE_URL + subject_path, link_no_anchor)
        # Ensure it is actually within the subject path to avoid navigating out
        if subject_path in full_url:
            subpages.add(full_url)
            
    return list(subpages)


def resolve_subject_for_subpage(page_url, subject_names):
    """
    Determine the correct subject for a subpage URL based on its filename suffix
    and the list of subject names that share this directory.
    
    For shared directories (Maths, English, Studies of Religion), multiple subjects
    point to the same folder but the subpage filenames contain suffixes that indicate
    which specific subject they belong to.
    
    E.g. trialpapers_extension1.html -> matches "Maths Ext 1" via keywords ['ext 1']
         trialpapers_general.html   -> matches "Standard Maths" or "General Maths"
         hscpapers.html             -> no matching suffix, returns first subject as default
    """
    filename = page_url.split('/')[-1].lower().replace('.html', '')
    
    # Check suffixes from most specific (longest) to least specific
    for suffix, keywords in sorted(SUFFIX_KEYWORDS.items(), key=lambda x: -len(x[0])):
        if filename.endswith(suffix):
            # Find which subject name matches these keywords
            for subject_name in subject_names:
                name_lower = subject_name.lower()
                if any(kw in name_lower for kw in keywords):
                    return subject_name
            # If no subject matched the keywords, log a warning and use first subject
            print(f"    ⚠ Suffix '{suffix}' found but no subject matched keywords {keywords} in {subject_names}")
            return subject_names[0]
    
    # No matching suffix — return the first subject as default
    return subject_names[0]


def parse_papers(html, subject_name, level, page_url):
    # Find all elements like <a href="#v" onclick="pdf(this, 1820)">2001 HSC</a>
    pattern = r'onclick=["\']pdf\(this,\s*(\d+)\)["\'][^>]*>(.*?)</a>'
    matches = re.findall(pattern, html, re.IGNORECASE)
    
    # Determine paper category based on the filename part of page_url to avoid domain matches like 'thsconline'
    filename = page_url.split('/')[-1].lower()
    if 'hsc' in filename:
        category = "HSC Papers"
    elif 'trial' in filename:
        category = "Trial Exams"
    elif 'assessment' in filename:
        category = "Assessment Tasks"
    else:
        category = "Other Resources"
        
    papers_list = []
    
    for viewno, label_raw in matches:
        label = label_raw.replace('&nbsp;', ' ').replace('&amp;', '&').strip()
        label = re.sub(r'<[^>]*>', '', label).strip() # Strip any nested html tags
        
        # Parse Year
        year_match = re.search(r'\b(19\d{2}|20\d{2})\b', label)
        year = year_match.group(1) if year_match else "Other"
        
        # Determine School/Publisher and Clean Label
        school = "NESA" # Default for official past papers
        has_solution = "sol" in label.lower() or "guidelines" in label.lower() or "marking" in label.lower() or "answers" in label.lower()
        
        if category == "Trial Exams" or category == "Assessment Tasks":
            # Extract school name from the beginning of the label before the year
            # E.g. "Abbotsleigh 2020 w. sol" -> School: "Abbotsleigh"
            school_match = re.match(r'^^(.*?)\s+\b(19\d{2}|20\d{2})\b', label)
            if school_match:
                school = school_match.group(1).strip()
            else:
                # If no year is found, look for "w. sol" or common delimiters
                school = label.split('w. sol')[0].split('sol')[0].strip()
                
            # If school string is empty or just punctuation, fallback
            if not school or len(school) < 2:
                school = "Independent"
        
        # Keep clean names
        school = school.replace(" w.", "").strip()
        
        # Construct dynamic links (THSC fallback URLs — used when cf field is absent)
        view_url = f"https://thsconline.github.io/s/v/{viewno}/{urllib.parse.quote(label)}"
        download_url = f"https://thsconline.github.io/s/d/{viewno}/{urllib.parse.quote(label)}"
        
        # Direct viewer URL — Cloudflare Pages is now the primary PDF source.
        # The cf field (relative path) is populated by a separate matching step.
        # Falls back to the old THSC Online viewer for unmatched papers.
        direct_iframe_url = f"https://thsconline.github.io/s/viewer.html?field={urllib.parse.quote(label)}&base={viewno}"
        
        papers_list.append({
            'name': label,
            'viewno': viewno,
            'subject': subject_name,
            'level': level,
            'category': category,
            'year': year,
            'school': school,
            'has_solution': has_solution,
            'viewUrl': view_url,
            'downloadUrl': download_url,
            'iframeUrl': direct_iframe_url
        })
        
    return papers_list

def main():
    start_time = time.time()
    all_papers = []
    
    levels = [
        {'prefix': 'yr12', 'name': 'Year 12'},
        {'prefix': 'yr11', 'name': 'Year 11'}
    ]
    
    for lvl in levels:
        level_prefix = lvl['prefix']
        level_name = lvl['name']
        
        print(f"\n==========================================")
        print(f"CRAWLING {level_name.upper()} ENTRY POINTS")
        print(f"==========================================")
        
        level_url = f"{BASE_URL}/s/{level_prefix}/"
        level_html = fetch_html(level_url)
        if not level_html:
            continue
            
        subjects = parse_subjects(level_html, level_prefix)
        print(f"Discovered {len(subjects)} subjects for {level_name}")
        
        # Group subjects by their directory path to handle shared directories.
        # E.g. Maths (2U), Maths Ext 1, Maths Ext 2, Standard Maths all share /Maths/
        path_to_subjects = {}
        for sub in subjects:
            path_to_subjects.setdefault(sub['path'], []).append(sub)
        
        for path, path_subjects in path_to_subjects.items():
            subject_names = [s['name'] for s in path_subjects]
            is_shared = len(path_subjects) > 1
            
            print(f"\n[{level_name}] Directory: {path}")
            if is_shared:
                print(f"  ⚠ SHARED directory for subjects: {', '.join(subject_names)}")
            else:
                print(f"  Subject: {subject_names[0]}")
            
            subject_html = fetch_html(BASE_URL + path)
            if not subject_html:
                continue
                
            subpages = discover_subpages(subject_html, path)
            print(f"  Found {len(subpages)} paper pages")
            
            for page in subpages:
                page_html = fetch_html(page)
                if not page_html:
                    continue
                
                # Determine the correct subject for this specific subpage
                if is_shared:
                    resolved_subject = resolve_subject_for_subpage(page, subject_names)
                    print(f"    → Resolved to: {resolved_subject} (from {page.split('/')[-1]})")
                else:
                    resolved_subject = subject_names[0]
                    
                papers = parse_papers(page_html, resolved_subject, level_name, page)
                print(f"    - Extracted {len(papers)} papers from {page.split('/')[-1]}")
                all_papers.extend(papers)
                
                # Polite rate-limiting
                time.sleep(0.1)
                
            time.sleep(0.2)
            
    print(f"\n==========================================")
    print(f"CRAWL COMPLETE")
    print(f"Total Papers Discovered: {len(all_papers)}")
    print(f"Time Elapsed: {time.time() - start_time:.2f} seconds")
    print(f"==========================================")
    
    # Save the database
    output_dir = "public"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, "papers.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_papers, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully compiled past papers database to {output_path}")

if __name__ == "__main__":
    main()
