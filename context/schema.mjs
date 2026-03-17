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
