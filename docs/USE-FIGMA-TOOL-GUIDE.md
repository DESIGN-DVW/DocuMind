# `use_figma` Tool Guide

**Version:** 1.0.0
**Created:** 2026-03-27
**Audience:** DVWDesign team members and agents

---

## What It Is

`use_figma` is the Figma MCP's general-purpose write tool. It executes JavaScript code via the Figma Plugin API against any Figma Design or FigJam file you have edit access to. It can create, edit, delete, or inspect any object: pages, frames, text, stickies, connectors, components, variants, variables, styles, and auto layout.

It is the only MCP tool that can **modify existing files**. All other write tools (`generate_diagram`, `create_new_file`) are create-only.

---

## Parameters

| Parameter     | Type   | Required | Description                                                                                                         |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `fileKey`     | string | Yes      | The Figma file key. Extract from URL: `figma.com/design/:fileKey/:fileName` or `figma.com/board/:fileKey/:fileName` |
| `code`        | string | Yes      | JavaScript code to execute. Has access to the `figma` global (Plugin API). Max 50,000 characters.                   |
| `description` | string | Yes      | Concise description of what the code does. Max 2,000 characters.                                                    |

### Extracting the file key

From a Figma URL like:

```text
https://www.figma.com/board/L8gOzoOCb90ur2g9fDI9hm/DVW-Design-Dev-Strategy?node-id=118-669
```

The `fileKey` is `L8gOzoOCb90ur2g9fDI9hm`.

From a node-specific URL, the `node-id` uses dashes in the URL but colons in the API: `118-669` becomes `118:669`.

---

## How It Works

1. You provide a `fileKey` and JavaScript code
2. The MCP server executes that code in the context of the Figma file via the Plugin API
3. The code has full access to the `figma` global object (same as a Figma plugin)
4. Results are returned via `figma.closePlugin(JSON.stringify(result))`
5. Errors are returned via `figma.closePluginWithFailure(error.toString())`

The code runs server-side — the file does not need to be open in a browser or desktop app.

---

## Requirements

- **Full seat** on a Pro, Organization, or Enterprise plan (Dev seats are read-only)
- **Edit permission** on the target file
- **Remote MCP server** only (`claude.ai Figma`) — the desktop server has no write tools
- Currently free during beta; will become usage-based paid feature

---

## Code Patterns

### Read: Inspect a file's structure

```javascript
(async () => {
  try {
    const pages = figma.root.children.map(p => ({
      id: p.id,
      name: p.name,
      childCount: p.children.length
    }));
    figma.closePlugin(JSON.stringify({ pages }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

### Read: List all sections on a FigJam page

```javascript
(async () => {
  try {
    const page = figma.currentPage;
    const sections = page.findAll(n => n.type === 'SECTION').map(s => ({
      id: s.id,
      name: s.name,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      childCount: s.children.length
    }));
    figma.closePlugin(JSON.stringify({ page: page.name, sections }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

### Read: Get all stickies and their text content

```javascript
(async () => {
  try {
    const stickies = figma.currentPage.findAll(n => n.type === 'STICKY').map(s => ({
      id: s.id,
      text: s.text.characters,
      x: s.x,
      y: s.y
    }));
    figma.closePlugin(JSON.stringify({ count: stickies.length, stickies }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

### Write: Create a sticky note on a FigJam board

```javascript
(async () => {
  try {
    const sticky = figma.createSticky();
    sticky.text.characters = "Created by use_figma";
    sticky.x = 100;
    sticky.y = 100;
    figma.closePlugin(JSON.stringify({ created: sticky.id }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

### Write: Create a section with stickies inside

```javascript
(async () => {
  try {
    const section = figma.createSection();
    section.name = "DocuMind Diagrams";
    section.x = 0;
    section.y = 0;
    section.resizeWithoutConstraints(800, 600);

    const sticky1 = figma.createSticky();
    sticky1.text.characters = "Architecture Diagram";
    section.appendChild(sticky1);
    sticky1.x = 50;
    sticky1.y = 50;

    const sticky2 = figma.createSticky();
    sticky2.text.characters = "Data Flow Diagram";
    section.appendChild(sticky2);
    sticky2.x = 50;
    sticky2.y = 200;

    figma.closePlugin(JSON.stringify({
      section: { id: section.id, name: section.name },
      stickies: 2
    }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

### Write: Create a connector between two nodes

```javascript
(async () => {
  try {
    const sticky1 = figma.createSticky();
    sticky1.text.characters = "Step 1";
    sticky1.x = 100;
    sticky1.y = 100;

    const sticky2 = figma.createSticky();
    sticky2.text.characters = "Step 2";
    sticky2.x = 400;
    sticky2.y = 100;

    const connector = figma.createConnector();
    connector.connectorStart = { endpointNodeId: sticky1.id, magnet: 'AUTO' };
    connector.connectorEnd = { endpointNodeId: sticky2.id, magnet: 'AUTO' };

    figma.closePlugin(JSON.stringify({ connector: connector.id }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

### Delete: Remove all nodes in a section

```javascript
(async () => {
  try {
    const section = figma.currentPage.findOne(
      n => n.type === 'SECTION' && n.name === 'Old Diagrams'
    );
    if (!section) {
      figma.closePlugin(JSON.stringify({ error: "Section not found" }));
      return;
    }
    const count = section.children.length;
    for (const child of [...section.children]) {
      child.remove();
    }
    section.remove();
    figma.closePlugin(JSON.stringify({ removed: count + 1 }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

### Update: Change text content of existing stickies

```javascript
(async () => {
  try {
    const stickies = figma.currentPage.findAll(
      n => n.type === 'STICKY' && n.text.characters.includes('TODO')
    );
    let updated = 0;
    for (const s of stickies) {
      s.text.characters = s.text.characters.replace('TODO', 'DONE');
      updated++;
    }
    figma.closePlugin(JSON.stringify({ updated }));
  } catch(e) { figma.closePluginWithFailure(e.toString()); }
})()
```

---

## FigJam-Specific Node Types

FigJam supports these node types via the Plugin API:

| Node Type | Create Method | Properties |
| --- | --- | --- |
| Sticky | `figma.createSticky()` | `text.characters`, `x`, `y`, `authorVisible` |
| Section | `figma.createSection()` | `name`, `x`, `y`, `resizeWithoutConstraints()`, `appendChild()` |
| Connector | `figma.createConnector()` | `connectorStart`, `connectorEnd`, `connectorLineType` |
| Shape with Text | `figma.createShapeWithText()` | `text.characters`, `shapeType`, `x`, `y` |
| Stamp | `figma.createStamp()` | Predefined stamp types |
| Text | `figma.createText()` | `characters`, `fontSize` (requires font loading) |
| Frame | `figma.createFrame()` | Standard frame properties |

### Finding nodes

```javascript
// By type
figma.currentPage.findAll(n => n.type === 'STICKY')
figma.currentPage.findAll(n => n.type === 'SECTION')
figma.currentPage.findAll(n => n.type === 'CONNECTOR')

// By name
figma.currentPage.findOne(n => n.name === 'My Section')

// By ID
figma.getNodeById('118:669')

// Navigate pages
figma.root.children  // all pages
figma.root.children.find(p => p.name === 'DocuMind')  // specific page
```

---

## What `use_figma` Cannot Do

| Limitation            | Details                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Delete files          | Plugin API operates within files, not on files. No file deletion.                        |
| Cross-file operations | Each `use_figma` call targets one `fileKey`. Cannot copy between files in a single call. |
| Import images         | No asset/image support yet (beta limitation)                                             |
| Custom fonts          | Only system/default fonts available                                                      |
| Exceed 20KB response  | Output is capped at 20KB per call                                                        |
| Exceed 50K code chars | Code parameter limited to 50,000 characters                                              |
| Run on desktop server | `use_figma` is remote-only (`claude.ai Figma`)                                           |
| Background/batch      | One file per call, synchronous execution                                                 |

---

## Relevance to DVWDesign Diagram Workflow

### What `use_figma` could solve

| Task                                          | Approach                                                       |
| --------------------------------------------- | -------------------------------------------------------------- |
| Read central board content                    | Inspect pages, sections, stickies, connectors via `findAll()`  |
| Verify diagram placement after curation       | Check if expected nodes exist on target page/section           |
| Clear old diagram content before regeneration | `remove()` on section children, then recreate                  |
| Add metadata to diagrams                      | Attach stickies or text with source hash, timestamp, repo name |
| Create sections for new repos                 | `createSection()` with repo name on the appropriate page       |

### What `use_figma` cannot solve for our workflow

| Task                                          | Why Not                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Regenerate Mermaid diagram in FigJam          | `generate_diagram`'s Mermaid rendering logic is internal. Reproducing node layout, connector routing, and styling in raw JS is impractical. |
| Get file key from `generate_diagram` URL      | The redirect URLs (`/online-whiteboard/create-diagram/...`) don't contain a file key. The file only exists after a human opens the link.    |
| Delete standalone FigJam files after curation | File deletion is not in the Plugin API.                                                                                                     |
| Move content between files                    | Single-file scope per call. Would need read from one + create in another as two separate calls, losing connector relationships and layout.  |

### Recommended approach

Use `use_figma` for **board management** (reading content, verifying curation, creating sections, adding metadata) while continuing to rely on `generate_diagram` for **Mermaid rendering**. The two tools complement each other — `generate_diagram` handles the hard rendering problem, and `use_figma` handles everything else.

---

## Error Handling

Always wrap code in try/catch and use the proper exit methods:

```javascript
(async () => {
  try {
    // ... your code ...
    figma.closePlugin(JSON.stringify({ success: true, data: result }));
  } catch(e) {
    figma.closePluginWithFailure(e.toString());
  }
})()
```

On error:

1. Do not immediately retry
2. Use `get_metadata` or a read-only `use_figma` call to inspect partial state
3. Clean up any orphaned nodes before retrying
4. Fix the root cause, then retry

---

## Rate Limits

`use_figma` is **exempt from standard rate limits** during the beta period. Standard read tools are subject to:

| Plan | Limit |
| --- | --- |
| Enterprise (Full/Dev seat) | 20/min, 600/day |
| Organization (Full/Dev seat) | 15/min, 200/day |
| Pro (Full/Dev seat) | 10/min, 200/day |
| Starter / View / Collab | 6/month |

---

## References

- [Figma MCP: Write to Canvas](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/)
- [Figma MCP: Tools and Prompts](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Figma Plugin API Reference](https://www.figma.com/plugin-docs/api/api-reference/)
- [Figma Blog: The Canvas is Now Open to Agents](https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/)
