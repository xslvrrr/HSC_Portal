import json
import os

def main():
    input_path = "public/papers.json"
    output_path = "public/papers_optimized.json"
    
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        return
        
    print(f"Reading {input_path}...")
    with open(input_path, "r", encoding="utf-8") as f:
        raw_papers = json.load(f)
        
    print(f"Loaded {len(raw_papers)} papers. Optimizing structure...")
    
    # 1. Build lookup tables for subjects and schools to eliminate string duplication
    subjects = sorted(list(set(p['subject'] for p in raw_papers)))
    schools = sorted(list(set(p['school'] for p in raw_papers)))
    
    subject_map = {name: idx for idx, name in enumerate(subjects)}
    school_map = {name: idx for idx, name in enumerate(schools)}
    
    # Category code mapper
    category_map = {
        "HSC Papers": "H",
        "Trial Exams": "T",
        "Assessment Tasks": "A",
        "Other Resources": "O"
    }
    
    optimized_papers = []
    
    for p in raw_papers:
        # Resolve level as numerical 11 or 12
        level_num = 12 if "12" in p['level'] else 11
        
        # Resolve category code
        cat_code = category_map.get(p['category'], "O")
        
        # Parse year as integer if possible
        try:
            year_val = int(p['year'])
        except ValueError:
            year_val = p['year'] # Keep as string "Other"
            
        opt_p = {
            "n": p['name'],
            "v": p['viewno'],
            "s": subject_map[p['subject']],
            "l": level_num,
            "c": cat_code,
            "y": year_val,
            "h": school_map[p['school']],
            "w": 1 if p['has_solution'] else 0
        }
        optimized_papers.append(opt_p)
        
    db = {
        "subjects": subjects,
        "schools": schools,
        "papers": optimized_papers
    }
    
    print(f"Saving optimized database to {output_path}...")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(db, f, separators=(',', ':'), ensure_ascii=False) # Minified JSON
        
    old_size = os.path.getsize(input_path) / (1024 * 1024)
    new_size = os.path.getsize(output_path) / (1024 * 1024)
    
    print(f"Optimization Complete!")
    print(f"  Original Size: {old_size:.2f} MB")
    print(f"  Optimized Size: {new_size:.2f} MB")
    print(f"  Size Reduction: {(1.0 - new_size/old_size)*100:.1f}%")
    
    # Overwrite the original papers.json with the optimized one
    os.replace(output_path, input_path)
    print(f"Overwrote {input_path} with the optimized database successfully!")

if __name__ == "__main__":
    main()
