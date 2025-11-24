Scan all DVWDesign repositories for markdown files and generate a comprehensive report.

**What this does:**

1. Scans 10 repositories for .md/.mdx files
2. Generates `index/all-markdown-files.json` with metadata
3. Creates `index/scan-report.md` with statistics
4. Reports file counts, sizes, and recent changes

**Repositories scanned:**

- FigmailAPP, FigmaDSController, @figma-core
- @figma-docs, Figma-Plug-ins, Markdown
- GlossiaApp, Contentful, IconJar, AdobePlugIns

**Command:** `npm run scan:report`

**Output location:** `index/` folder (gitignored)
