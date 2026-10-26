/**
 * DocuMind v3.0 — Context Profile Zod Schema
 *
 * Validates the JSON profile that configures all DocuMind subsystems.
 * Use `profileSchema.parse(json)` to validate — throws ZodError with
 * field-level messages on failure.
 *
 * @module context/schema
 */

import { z } from 'zod';

const repositorySchema = z.object({
  name: z.string().describe('Repository display name'),
  path: z.string().describe('Path relative to basePath, or absolute'),
  active: z.boolean().default(true).describe('Whether to include this repo in scans'),
});

// A doc SOURCE is not a repository: no code, no git, nothing to scan for
// relationships. It is a tree of markdown that must still be searchable —
// Dave's strategy briefs and the Obsidian session logs under
// DVWDesign/docs live here. Without this, index_file rejects them outright
// ("not under any known repo root") and search_docs cannot see them, so any
// agent following the MCP-first protocol concludes the rule does not exist.
const sourceSchema = z.object({
  name: z.string().describe('Source display name, used as the `repo` filter value'),
  path: z.string().describe('Path relative to the registry basePath, or absolute'),
  active: z.boolean().default(true).describe('Whether to include this source in scans'),
});

const classificationRuleSchema = z.object({
  pattern: z.string().describe('Regex pattern string (no delimiters) tested against document path'),
  classification: z
    .string()
    .describe('Materialized path classification, e.g. "engineering/api-docs"'),
});

const keywordTaxonomySchema = z.object({
  technology: z.array(z.string()).describe('Technology keyword list'),
  action: z.array(z.string()).describe('Action keyword list'),
});

const lintRulesSchema = z.object({
  profile: z
    .enum(['strict', 'standard', 'relaxed'])
    .default('standard')
    .describe('Lint severity profile'),
  customPatternsPath: z.string().optional().describe('Path to custom error patterns JSON file'),
});

export const profileSchema = z
  .object({
    id: z.string().describe('Profile slug, e.g. "dvwdesign-internal"'),
    name: z.string().describe('Profile display name'),
    version: z.string().describe('Profile version string'),
    repositories: z
      .array(repositorySchema)
      .optional()
      .describe('Inline repository list (mutually exclusive with repositoryRegistryPath)'),
    repositoryRegistryPath: z
      .string()
      .optional()
      .describe('Path to external repository registry JSON (relative to profile file)'),
    sources: z
      .array(sourceSchema)
      .optional()
      .describe(
        'Non-repository markdown roots (briefs, Obsidian notes) — additive to repositories'
      ),
    scanIgnore: z
      .array(z.string())
      .optional()
      .describe('Extra glob patterns excluded from scans, appended to the built-in defaults'),
    classificationRules: z
      .array(classificationRuleSchema)
      .describe('Ordered classification rules — first match wins'),
    keywordTaxonomy: keywordTaxonomySchema.describe('Keyword taxonomy by category'),
    relationshipTypes: z
      .array(z.string())
      .describe('Allowed document relationship type identifiers'),
    lintRules: lintRulesSchema.optional().describe('Markdown lint configuration'),
  })
  .strict()
  .refine(data => data.repositories || data.repositoryRegistryPath, {
    message: 'Profile must define either "repositories" or "repositoryRegistryPath"',
  });
