const fs = require('fs');
const path = require('path');

const PAPERS_FOLDER = 'C:/Users/manup/Downloads/THSC Papers - GitHub';
const PAPERS_JSON = './public/papers.json';

const subjects = ["Agriculture","Ancient History","Biology","Business Studies","Chemistry","Economics","Engineering Studies","English Advanced","English Ext 1","English Standard","General Maths","History Extension","IPT","Investigating Science","Legal Studies","Maths (2U)","Maths Ext 1","Maths Ext 2","Modern History","PDHPE","Physics","Software Engineering","Standard Maths","Studies of Religion 1","Studies of Religion 2","Visual Arts"];

const subjectPathKeywords = {
  "Agriculture": [["Agriculture"]],
  "Ancient History": [["Ancient History"]],
  "Biology": [["Biology"]],
  "Business Studies": [["Business Studies"]],
  "Chemistry": [["Chemistry"]],
  "Economics": [["Economics"]],
  "Engineering Studies": [["Engineering Studies"]],
  "English Advanced": [["English", "Advanced"], ["English", "Paper 1"], ["English", "HSC"], ["English", "Trials"], ["English", "Assessments"], ["English", "Assessment Tasks"]],
  "English Ext 1": [["English Ext 1"], ["English", "Ext 1"], ["English", "Extension 1"]],
  "English Standard": [["English", "Standard"], ["English", "Paper 1"], ["English", "HSC"], ["English", "Trials"], ["English", "Assessments"], ["English", "Assessment Tasks"]],
  "General Maths": [["Maths", "General"], ["Maths", "Standard"]],
  "History Extension": [["History Extension"]],
  "IPT": [["IPT"]],
  "Investigating Science": [["Investigating Science"]],
  "Legal Studies": [["Legal Studies"]],
  "Maths (2U)": [["Maths", "Advanced"], ["Maths", "Accelerated"]],
  "Maths Ext 1": [["Maths", "Extension 1"]],
  "Maths Ext 2": [["Maths", "Extension 2"]],
  "Modern History": [["Modern History"]],
  "PDHPE": [["PDHPE"]],
  "Physics": [["Physics"]],
  "Software Engineering": [["Software"]],
  "Standard Maths": [["Maths", "Standard"]],
  "Studies of Religion 1": [["Religion"]],
  "Studies of Religion 2": [["Religion"]],
  "Visual Arts": [["Visual Arts"]]
};

const categoryFolders = {
  "T": ["Trials", "Trial"],
  "H": ["HSC"],
  "A": ["Assessments", "Assessment"],
  "O": ["Other"]
};

function normalizeName(fileName) {
  let name = fileName.replace(/\s*\[.*?\]\.pdf$/i, '').replace(/\.pdf$/i, '');
  name = name.replace(/\s*w\.?\s*sol$/i, '').replace(/\s*with\s*sol/i, '').trim();
  return name.toLowerCase();
}

function hasSolInName(fileName) {
  return /\bw\.?\s*sol\b/i.test(fileName) || /with\s*sol/i.test(fileName);
}

function pathMatchesSubject(filePath, subjectName, paperName) {
  const keywordSets = subjectPathKeywords[subjectName];
  if (!keywordSets) return true;
  const lowerPath = filePath.toLowerCase();

  if (subjectName === "English Advanced" && paperName && paperName.includes("(standard)")) {
    return lowerPath.includes("english/standard");
  }

  return keywordSets.some(keywordSet =>
    keywordSet.every(kw => lowerPath.includes(kw.toLowerCase()))
  );
}

function pathMatchesCategory(filePath, categoryCode) {
  const folderNames = categoryFolders[categoryCode];
  if (!folderNames) return true;
  const lowerPath = filePath.toLowerCase();
  return folderNames.some(name => lowerPath.includes(name.toLowerCase()));
}

const pdfList = [];
function scanDir(dir, relativePath = '') {
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.log(`ERROR reading: ${dir} - ${e.message}`);
    return;
  }
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.join(relativePath, item.name);
    if (item.isDirectory()) {
      scanDir(fullPath, relPath);
    } else if (item.name.toLowerCase().endsWith('.pdf')) {
      pdfList.push({
        normalizedName: normalizeName(item.name),
        fullPath: relPath.replace(/\\/g, '/'),
        fileName: item.name,
        hasSol: hasSolInName(item.name)
      });
    }
  }
}

scanDir(PAPERS_FOLDER);
console.log(`Total PDFs found: ${pdfList.length}`);

const data = JSON.parse(fs.readFileSync(PAPERS_JSON, 'utf8'));
const allPapers = data.papers;
const papers = allPapers.filter(p => p.c !== "H");
data.papers = papers;
console.log(`Papers in papers.json: ${papers.length} (removed ${allPapers.length - papers.length} HSC papers)`);

let matched = 0;
let unmatched = 0;
let multipleMatches = 0;
const unmatchedExamples = [];
const multipleExamples = [];

for (const paper of papers) {
  const normalizedPaperName = paper.n.replace(/\s*w\.?\s*sol$/i, '').replace(/\s*with\s*sol/i, '').trim().toLowerCase();
  const subjectName = subjects[paper.s] || '';
  const yearLevel = `yr${paper.l}`;
  const category = paper.c;
  const wantsSol = paper.w === 1;
  const yearStr = String(paper.y);

  let nameMatches = pdfList.filter(pdf => pdf.normalizedName === normalizedPaperName);

  if (nameMatches.length === 0) {
    nameMatches = pdfList.filter(pdf =>
      pdf.normalizedName.includes(normalizedPaperName) ||
      normalizedPaperName.includes(pdf.normalizedName)
    );
  }

  if (nameMatches.length === 0) {
    let fallbackMatches = pdfList.filter(pdf => {
      if (!pdf.fullPath.toLowerCase().includes(yearLevel)) return false;
      if (!pathMatchesSubject(pdf.fullPath, subjectName, normalizedPaperName)) return false;
      if (!pathMatchesCategory(pdf.fullPath, category)) return false;
      if (!pdf.fullPath.includes(yearStr)) return false;
      return true;
    });
    if (fallbackMatches.length > 0) nameMatches = fallbackMatches;
  }

  if (nameMatches.length === 0) {
    unmatched++;
    if (unmatched <= 30) unmatchedExamples.push({ n: paper.n, v: paper.v, s: subjectName, y: paper.y, l: paper.l, c: category, reason: 'no name match' });
    continue;
  }

  let candidates = nameMatches.filter(pdf => pdf.fullPath.toLowerCase().includes(yearLevel));
  if (candidates.length === 0) candidates = nameMatches;

  let subjectCandidates = candidates.filter(pdf => pathMatchesSubject(pdf.fullPath, subjectName, normalizedPaperName));
  if (subjectCandidates.length === 0) {
    unmatched++;
    if (unmatched <= 30) {
      unmatchedExamples.push({
        n: paper.n, v: paper.v, s: subjectName, y: paper.y, l: paper.l, c: category,
        reason: 'no subject match',
        nameMatchPaths: candidates.slice(0, 5).map(c => c.fullPath)
      });
    }
    continue;
  }

  let categoryCandidates = subjectCandidates.filter(pdf => pathMatchesCategory(pdf.fullPath, category));
  if (categoryCandidates.length === 0) categoryCandidates = subjectCandidates;

  let finalCandidates = categoryCandidates;
  if (finalCandidates.length > 1 && wantsSol) {
    let solCandidates = finalCandidates.filter(pdf => pdf.hasSol);
    if (solCandidates.length > 0) finalCandidates = solCandidates;
  } else if (finalCandidates.length > 1 && !wantsSol) {
    let noSolCandidates = finalCandidates.filter(pdf => !pdf.hasSol);
    if (noSolCandidates.length > 0) finalCandidates = noSolCandidates;
  }

  if (finalCandidates.length === 1) {
    paper.cf = finalCandidates[0].fullPath;
    matched++;
  } else if (finalCandidates.length > 1) {
    paper.cf = finalCandidates[0].fullPath;
    matched++;
    multipleMatches++;
    if (multipleMatches <= 10) {
      multipleExamples.push({
        n: paper.n, s: subjectName, c: category, w: paper.w,
        candidates: finalCandidates.map(c => c.fullPath)
      });
    }
  }
}

console.log(`\nMatched: ${matched} (including ${multipleMatches} with multiple candidates)`);
console.log(`Unmatched: ${unmatched}`);

if (unmatchedExamples.length > 0) {
  console.log('\nFirst 30 unmatched:');
  unmatchedExamples.forEach(p => {
    console.log(`  n="${p.n}" v=${p.v} subject="${p.s}" yr=${p.l} year=${p.y} c=${p.c} (${p.reason})`);
    if (p.nameMatchPaths) {
      p.nameMatchPaths.forEach(pp => console.log(`      found: ${pp}`));
    }
  });
}

if (multipleExamples.length > 0) {
  console.log('\nFirst 10 multiple-match examples:');
  multipleExamples.forEach(p => {
    console.log(`  n="${p.n}" subject="${p.s}" c=${p.c} w=${p.w}`);
    p.candidates.forEach(c => console.log(`    -> ${c}`));
  });
}

console.log('\nFirst 5 matched examples:');
let count = 0;
for (const paper of papers) {
  if (paper.cf && count < 5) {
    const subjectName = subjects[paper.s] || '';
    console.log(`  n="${paper.n}" subject="${subjectName}" c=${paper.c} w=${paper.w} -> ${paper.cf}`);
    count++;
  }
}

fs.writeFileSync(PAPERS_JSON, JSON.stringify(data));
console.log('\nUpdated papers.json with cf field');
