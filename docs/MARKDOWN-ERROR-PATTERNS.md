# Markdown Error Patterns - Schema & Detection Guide

**Purpose:** Document recurring markdown syntax errors beyond standard linter capabilities
**Version:** 1.0.0
**Last Updated:** 2025-11-13

---

## Overview

This document catalogs recurring markdown syntax errors identified through:

- **User usage review** - Patterns from human authors

- **Linter limitations** - Errors standard linters can't detect

- **AI agent patterns** - Common AI-generated syntax issues

- **Context-dependent issues** - Errors requiring semantic understanding

---

## Error Categories

### Category 1: Context-Dependent Numbering Issues

These errors require understanding parent-child relationships and document structure.

#### Error 1.1: Numbered Lists Breaking Hierarchy

**Problem:** Numbered lists interrupted by content break continuation

##### Detection Pattern:

```regex

^\d+\.\s+.+\n\n(?!^\d+\.\s+)[^\n]+\n\n^\d+\.\s+

```

##### Example (WRONG):

```markdown

1. First item

2. Second item

Some explanatory text here

3. Third item (ERROR: Should be 1. not 3.)

```

##### Example (CORRECT):

```markdown

1. First item

2. Second item

   Some explanatory text here (indented to maintain list context)

3. Third item

OR

1. First item

2. Second item

Some explanatory text here

1. Third item (restart numbering)

```

**Fix Strategy:** AI-assisted (context required)

##### Grep Command:

```bash

grep -Pzo '^\d+\.\s+[^\n]+\n\n(?!^\d+\.\s+)[^\n]+\n\n^\d+\.\s+' file.md

```

---

#### Error 1.2: Mixed Numbered/Unnumbered Lists

**Problem:** Switching between numbered and bulleted lists without proper nesting

##### Detection Pattern:

```regex

^(\d+\.|\*|-)\s+.+\n^(\d+\.|\*|-)\s+

```

Where first and second markers don't match type

##### Example (WRONG):

```markdown

1. First numbered item

* Bullet item (ERROR: Mixed list types)

2. Second numbered item

```

##### Example (CORRECT):

```markdown

1. First numbered item

   * Sub-item bullet (indented)

2. Second numbered item

OR

1. First numbered item

* Separate bullet list

* Another bullet

2. New numbered list

```

**Fix Strategy:** Automated or AI-assisted

##### Grep Command:

```bash

grep -E '^\d+\.\s+' -A1 file.md | grep -E '^\*|-'

```

### Category 2: Heading Context Issues

These require understanding document structure and semantic hierarchy.

#### Error 2.1: Skipped Heading Levels

**Problem:** Jumping from H2 to H4 (skipping H3)

##### Detection Pattern:

```regex

^##\s+.+\n\n####\s+

```

##### Example (WRONG):

```markdown

## Section

### Subsection (ERROR: Skipped H3)

```

#### Example (CORRECT):

```markdown

## Section

### Subsection

#### Sub-subsection

```

**Fix Strategy:** Automated

##### Grep Command:

```bash

grep -Pzo '##\s+[^\n]+(\n\n|$)####\s+' file.md

```

#### Error 2.2: Multiple H1 Headings

**Problem:** More than one top-level heading

##### Detection Pattern:

```regex

^#\s+.+(\n.+)*^#\s+

```

##### Example (WRONG):

```markdown

# Main Title

Content here

# Another Main Title (ERROR: Second H1)

```

##### Example (CORRECT):

```markdown

# Main Title

## Subtitle

## Another Subtitle

```

**Fix Strategy:** AI-assisted (semantic decision)

### Grep Command:

```bash

grep -n '^#\s\+' file.md | wc -l  # Count > 1 means multiple H1s

```

### Category 3: Code Block Issues

#### Error 3.1: Nested Code Blocks

**Problem:** Code blocks inside code blocks (common in documentation)

##### Detection Pattern:

```regex

^```[a-z]*\n(.*\n)*?```[a-z]*\n(.*\n)*?^```

```

##### Example (WRONG):

```markdown

\`\`\`bash
echo "Example"
\`\`\`javascript  # ERROR: Can't nest code blocks
console.log("test");
\`\`\`
\`\`\`

```

##### Example (CORRECT):

```markdown

\`\`\`bash
echo "Example"
\`\`\`

\`\`\`javascript
console.log("test");
\`\`\`

```

**Fix Strategy:** Automated

##### Grep Command:

```bash

grep -Pzo '```[a-z]*\n(.*\n)*?```[a-z]*\n(.*\n)*?```' file.md

```

#### Error 3.2: Code Block Without Language (AI Common)

**Problem:** AI often forgets language specifier

##### Detection Pattern:

```regex

^```\n(?!(yaml|json|bash|javascript|typescript|python|text|markdown))

```

##### Example (WRONG):

```markdown

\`\`\`
console.log("test");
\`\`\`

```

##### Example (CORRECT):

```markdown

\`\`\`javascript
console.log("test");
\`\`\`

```

**Fix Strategy:** Automated (already in fix-markdown.mjs)

##### Grep Command:

```bash

grep -n '^```$' file.md

```

### Category 4: Link & Reference Issues

#### Error 4.1: Reference-Style Links Never Defined

**Problem:** Using [text][ref] without defining [ref]: url

##### Detection Pattern:

```regex

\[.+\]\[(\w+)\](?![\s\S]*^\[\1\]:)

```

##### Example (WRONG):

```markdown

Check the [documentation][docs] for details.

(No [docs]: url definition)

```

##### Example (CORRECT):

```markdown

Check the [documentation][docs] for details.

[docs]: https://example.com/docs

```

**Fix Strategy:** AI-assisted (need to find/create URL)

##### Grep Command:

```bash

grep -oP '\[.+?\]\[\K\w+(?=\])' file.md | sort -u > refs.txt
grep -P '^\[\w+\]:' file.md > defs.txt
comm -23 refs.txt defs.txt  # Show undefined refs

```

#### Error 4.2: Broken Internal Links

**Problem:** Links to files/headings that don't exist

##### Detection Pattern:

```regex

\[.+\]\((?!http)[^\)]+\)

```

Then validate file existence

##### Example (WRONG):

```markdown

See [setup guide](docs/setup.md) for details.

# But docs/setup.md doesn't exist

```

**Fix Strategy:** Automated with file system check

## Bash Pipeline:

```bash

# Extract all internal links

grep -oP '\[.+?\]\(\K(?!http)[^\)]+' file.md | while read link; do
  [ ! -f "$link" ] && echo "Broken: $link"
done

```

## Category 5: Table Formatting Issues

### Error 5.1: Misaligned Table Columns

**Problem:** Different number of columns in table rows

#### Detection Pattern:

```regex

^\|(.+\|)+\n^\|[-:\s]+\|+\n(^\|(.+\|)+\n)+

```

Count pipes per line

#### Example (WRONG):

```markdown

| Col1 | Col2 |

| ------ | ------ |

| A | B | C |  # ERROR: 3 columns in data, 2 in header

```

#### Example (CORRECT):

```markdown

| Col1 | Col2 | Col3 |

| ------ | ------ | ------ |

| A    | B    | C    |

```

**Fix Strategy:** Automated

#### Awk Command:

```bash

awk -F'|' '/^\|/ {print NF, $0}' file.md | awk '{if(NF!=prev && NR>1) print "Line",NR,"has",NF-2,"columns, expected",prev-2; prev=NF}'

```

#### Error 5.2: Tables Without Header Separator

**Problem:** Missing |---|---| separator line

##### Detection Pattern:

```regex

^\|(.+\|)+\n^\|(?![-:\s]+\|)

```

##### Example (WRONG):

```markdown

| Header 1 | Header 2 |

| Data 1   | Data 2   |  # ERROR: Missing separator

```

##### Example (CORRECT):

```markdown

| Header 1 | Header 2 |

| ---------- | ---------- |

| Data 1   | Data 2   |

```

**Fix Strategy:** Automated

##### Grep Command:

```bash

grep -Pzo '\|.+\|\n\|(?![-:\s]+\|).+\|' file.md

```

### Category 6: Indentation & Whitespace

#### Error 6.1: Inconsistent List Indentation

**Problem:** Mixed 2-space and 4-space indentation in nested lists

##### Detection Pattern:

```regex

^(\s{2}|\s{4})[-*+]\s+

```

Check for consistency

##### Example (WRONG):

```markdown

* Level 1

  * Level 2 (2 spaces)

  * Level 3 (4 more spaces - total 6, inconsistent)

```

##### Example (CORRECT):

```markdown

* Level 1

  * Level 2 (2 spaces)

  * Level 3 (2 more spaces - total 4, consistent)

```

**Fix Strategy:** Automated

##### Sed Command:

```bash

# Standardize to 2-space indents

sed -E 's/^    ([-*+])/  \1/g' file.md

```

## Error 6.2: Trailing Spaces (Invisible)

**Problem:** Spaces at end of lines (breaks some parsers)

### Detection Pattern:

```regex

\s+$

```

### Example (WRONG):

```markdown

This line has trailing spaces

```

### Example (CORRECT):

```markdown

This line has no trailing spaces

```

**Fix Strategy:** Automated

### Sed Command:

```bash

sed 's/\s\+$//' file.md

```

### Category 7: Frontmatter & Metadata

#### Error 7.1: Malformed YAML Frontmatter

**Problem:** Invalid YAML syntax in frontmatter

##### Detection Pattern:

```regex

^---\n(.*\n)*?---\n

```

Then validate YAML

##### Example (WRONG):

```markdown

title: My Document
date 2025-11-13  # ERROR: Missing colon

```

##### Example (CORRECT):

```markdown

title: My Document
date: 2025-11-13

```

**Fix Strategy:** AI-assisted (YAML parsing required)

##### Validation:

```bash

# Extract and validate YAML

sed -n '/^---$/,/^---$/p' file.md | yq eval - 2>&1 | grep -i error

```

## Error 7.2: Missing Required Metadata

**Problem:** Documents missing standard metadata fields

### Detection Pattern:

```regex

^---\n(?!.*version:)

```

### Example (WRONG):

```markdown

title: My Document

# Missing: version, updated, author

```

### Example (CORRECT):

```markdown

title: My Document
version: 1.0.0
updated: 2025-11-13
author: DESIGN-DVW

```

**Fix Strategy:** Automated (add defaults) or AI-assisted

## Grep Command:

```bash

# Check for missing version field

grep -L 'version:' $(find . -name "*.md")

```

## Category 8: AI-Specific Issues

### Error 8.1: Over-Formatted Emphasis

**Problem:** AI using **bold** for everything

#### Detection Pattern:

```regex

\*\*[A-Z][^*]+\*\*:

```

At line start (likely should be heading)

#### Example (WRONG):

```markdown

**Overview:** This section covers...
**Benefits:** Here are the benefits...

```

#### Example (CORRECT):

```markdown

### Overview

This section covers...

### Benefits

Here are the benefits...

```

**Fix Strategy:** AI-assisted (semantic decision)

#### Grep Command:

```bash

grep -n '^\*\*[A-Z]' file.md

```

#### Error 8.2: Excessive Horizontal Rules

**Problem:** AI adding --- after every section

##### Detection Pattern:

```regex

---\n\n---

```

Or count per document > threshold

##### Example (WRONG):

```markdown

## Section 1

Content

## Section 2

Content

## Section 3  # Too many horizontal rules

```

### Example (CORRECT):

```markdown

## Section 1

Content

## Section 2

Content

## Section 3

```

**Fix Strategy:** Automated

### Sed Command:

```bash

# Remove excessive horizontal rules

sed '/^---$/N;/^---\n$/d' file.md

```

## Detection Strategy Matrix

| Error Type | Detection Method | Fix Method | Priority |

| ----------- | ------------------ | ------------ | ---------- |

| **Context Numbering** | Regex + parsing | AI-assisted | High |

| **Heading Hierarchy** | Regex | Automated | High |

| **Code Block Nesting** | State machine | Automated | High |

| **Missing Language** | Regex | Automated | High |

| **Undefined References** | Grep + comm | AI-assisted | Medium |

| **Broken Links** | Grep + file check | Automated | High |

| **Table Alignment** | Awk column count | Automated | Medium |

| **Missing Separator** | Regex | Automated | Medium |

| **Indentation** | Regex | Automated | Low |

| **Trailing Spaces** | Regex | Automated | Low |

| **YAML Frontmatter** | YAML parser | AI-assisted | Medium |

| **Missing Metadata** | Grep | Automated | Medium |

| **Over-Formatting** | Regex + context | AI-assisted | Low |

| **Excessive Rules** | Count threshold | Automated | Low |

## Command-Line Tool Combinations

### Advanced Pattern Detection Pipeline

```bash

# Find files with numbered list context errors

find . -name "*.md" -exec grep -l '^[0-9]\+\.' {} \; | \
while read file; do

  # Check for broken list continuity

  grep -n '^[0-9]\+\.' "$file" | \
  awk -F: '{print $1,$2}' | \
  awk '{if($1-prev>2 && prev>0) print FILENAME":"$1" - Possible broken list"; prev=$1}' FILENAME="$file"
done

```

## Broken Reference Link Detection

```bash

# Extract all reference-style links

grep -oP '\[.+?\]\[\K\w+(?=\])' *.md | sort -u > used_refs.txt

# Extract all reference definitions

grep -oP '^\[\K\w+(?=\]:)' *.md | sort -u > defined_refs.txt

# Find undefined references

comm -23 used_refs.txt defined_refs.txt

```

## Table Column Consistency Check

```bash

# Check table consistency

grep '^\|' file.md | \
awk -F'|' '{
  cols=NF-2;
  if(NR==1) expected=cols;
  if(cols!=expected) print "Line",NR,":",cols,"cols, expected",expected
}'

```

## Code Block Language Detection

```bash

# Find code blocks without language

awk '/^```$/ {print NR":"$0}' file.md

```

## Multi-File Pattern Analysis

```bash

# Analyze heading level distribution across all files

find . -name "*.md" -exec grep -h '^#' {} \; | \
sed 's/^\(#\+\).*/\1/' | \
sort | uniq -c | \
awk '{print $2,":",$1}'

```

## Extension Guide

### Adding New Error Patterns

1. **Document the pattern** in this file

2. **Add detection regex** to `config/custom-error-patterns.json`

3. **Implement fix** in `scripts/fix-custom-errors.mjs` (if automatable)

4. **Add to AI agent** in `.claude/agents/custom-error-fixer.md` (if context-dependent)

5. **Test** on sample files

6. **Update validation script** to report occurrences

### Pattern Testing

```bash

# Test regex pattern

echo "Your test markdown" | grep -P 'your-regex-here'

# Test across all repos

npm run analyze:errors -- --pattern 'your-regex-here'

```

## References

- [Markdownlint Rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)

- [Grep Regex Syntax](https://www.gnu.org/software/grep/manual/grep.html)

- [Sed Manual](https://www.gnu.org/software/sed/manual/sed.html)

- [Awk Tutorial](https://www.gnu.org/software/gawk/manual/gawk.html)

**Version:** 1.0.0
**Last Updated:** 2025-11-13
**Status:** Living Document - Continuously Updated
