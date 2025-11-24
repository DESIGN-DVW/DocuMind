/**
 * Central Configuration for DESIGN-DVW organization
 *
 * This file contains canonical names and paths used across all repositories.
 * Import this file in scripts to ensure consistent naming.
 *
 * @module config/constants
 */

// ============================================================================
// GITHUB ORGANIZATION
// ============================================================================

/**
 * Primary GitHub organization name
 * @constant {string}
 */
export const GITHUB_ORG = 'DESIGN-DVW';

/**
 * Legacy GitHub organization (being phased out)
 * @constant {string}
 * @deprecated Use GITHUB_ORG instead
 */
export const LEGACY_GITHUB_ORG = 'DVW-Design';

/**
 * Base GitHub URL
 * @constant {string}
 */
export const GITHUB_BASE_URL = `https://github.com/${GITHUB_ORG}`;

// ============================================================================
// LOCAL FILE SYSTEM
// ============================================================================

/**
 * Local base path for all DVWDesign repositories
 * NOTE: This is a local folder name only, NOT a GitHub organization
 * @constant {string}
 */
export const LOCAL_BASE_PATH = '/Users/Shared/htdocs/github/DVWDesign';

// ============================================================================
// ACTIVE REPOSITORIES
// ============================================================================

/**
 * Active repositories in the DESIGN-DVW organization
 * @constant {Array<Object>}
 */
export const ACTIVE_REPOSITORIES = [
  {
    name: 'Aprimo',
    github: `${GITHUB_BASE_URL}/Aprimo`,
    local: `${LOCAL_BASE_PATH}/Aprimo`,
    description: 'Aprimo integration and tools',
  },
  {
    name: 'CampaignManager',
    github: `${GITHUB_BASE_URL}/CampaignManager`,
    local: `${LOCAL_BASE_PATH}/CampaignManager`,
    description: 'Campaign management system',
  },
  {
    name: 'DocuMind',
    github: `${GITHUB_BASE_URL}/DocuMind`,
    local: `${LOCAL_BASE_PATH}/DocuMind`,
    description: 'Centralized markdown documentation system',
  },
  {
    name: 'Figma-Plug-ins',
    github: `${GITHUB_BASE_URL}/Figma-Plug-ins`,
    local: `${LOCAL_BASE_PATH}/Figma-Plug-ins`,
    description: 'Figma plugins and extensions',
  },
  {
    name: 'LibraryAssetManager',
    github: `${GITHUB_BASE_URL}/LibraryAssetManager`,
    local: `${LOCAL_BASE_PATH}/LibraryAssetManager`,
    description: 'Library asset management system',
  },
  {
    name: 'RootDispatcher',
    github: `${GITHUB_BASE_URL}/RootDispatcher`,
    local: `${LOCAL_BASE_PATH}/RootDispatcher`,
    description: 'Central orchestrator and dispatcher',
  },
  {
    name: 'FigmaDSController',
    github: `${GITHUB_BASE_URL}/FigmaDSController`,
    local: `${LOCAL_BASE_PATH}/FigmaAPI/FigmaDSController`,
    description: 'Figma Design System Controller',
    note: 'Stored in FigmaAPI local directory but NOT under FigmaAPI on GitHub',
  },
  {
    name: 'FigmailAPP',
    github: `${GITHUB_BASE_URL}/FigmailAPP`,
    local: `${LOCAL_BASE_PATH}/FigmaAPI/FigmailAPP`,
    description: 'Figma mail application',
    note: 'Stored in FigmaAPI local directory but NOT under FigmaAPI on GitHub',
  },
];

/**
 * Legacy repositories (to be migrated)
 * @constant {Array<Object>}
 */
export const LEGACY_REPOSITORIES = [
  {
    name: 'GlossiaApp',
    github: `https://github.com/${LEGACY_GITHUB_ORG}/GlossiaApp`,
    local: `${LOCAL_BASE_PATH}/GlossiaApp`,
    description: 'Glossia application',
    status: 'TO BE MIGRATED to DESIGN-DVW',
  },
];

/**
 * Local-only repositories (no GitHub remote)
 * @constant {Array<Object>}
 */
export const LOCAL_ONLY_REPOSITORIES = [
  {
    name: '@figma-agents',
    local: `${LOCAL_BASE_PATH}/@figma-agents`,
    description: 'Figma agent configurations (local only)',
  },
  {
    name: '@figma-core',
    local: `${LOCAL_BASE_PATH}/@figma-core`,
    description: 'Figma core utilities (local only)',
  },
  {
    name: '@figma-core (FigmaAPI)',
    local: `${LOCAL_BASE_PATH}/FigmaAPI/@figma-core`,
    description: 'Figma core in FigmaAPI directory (local only)',
  },
  {
    name: '@figma-docs',
    local: `${LOCAL_BASE_PATH}/FigmaAPI/@figma-docs`,
    description: 'Figma documentation (local only)',
  },
  {
    name: 'RandD',
    local: `${LOCAL_BASE_PATH}/RandD`,
    description: 'Research and development (local only)',
  },
  {
    name: 'mjml-dev-mode',
    local: `${LOCAL_BASE_PATH}/mjml-dev-mode`,
    description: 'MJML development mode (local only)',
  },
  {
    name: 'mjml-dev-mode-proposal',
    local: `${LOCAL_BASE_PATH}/mjml-dev-mode-proposal`,
    description: 'MJML proposal (local only)',
  },
];

// ============================================================================
// NPM PACKAGE SCOPE
// ============================================================================

/**
 * NPM package scope
 * NOTE: Should match GitHub organization name (lowercase with hyphens)
 * @constant {string}
 */
export const NPM_SCOPE = '@design-dvw';

// ============================================================================
// REPOSITORY MAPPINGS
// ============================================================================

/**
 * Map repository names to their GitHub URLs
 * @constant {Map<string, string>}
 */
export const REPO_URL_MAP = new Map(ACTIVE_REPOSITORIES.map(repo => [repo.name, repo.github]));

/**
 * Map repository names to their local paths
 * @constant {Map<string, string>}
 */
export const REPO_PATH_MAP = new Map(
  [...ACTIVE_REPOSITORIES, ...LEGACY_REPOSITORIES, ...LOCAL_ONLY_REPOSITORIES].map(repo => [
    repo.name,
    repo.local,
  ])
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get GitHub URL for a repository
 * @param {string} repoName - Repository name
 * @returns {string|null} GitHub URL or null if not found
 */
export function getGitHubUrl(repoName) {
  return REPO_URL_MAP.get(repoName) || null;
}

/**
 * Get local path for a repository
 * @param {string} repoName - Repository name
 * @returns {string|null} Local path or null if not found
 */
export function getLocalPath(repoName) {
  return REPO_PATH_MAP.get(repoName) || null;
}

/**
 * Check if a repository is active on GitHub
 * @param {string} repoName - Repository name
 * @returns {boolean} True if repository is active
 */
export function isActiveRepository(repoName) {
  return ACTIVE_REPOSITORIES.some(repo => repo.name === repoName);
}

/**
 * Check if a repository is local-only
 * @param {string} repoName - Repository name
 * @returns {boolean} True if repository is local-only
 */
export function isLocalOnly(repoName) {
  return LOCAL_ONLY_REPOSITORIES.some(repo => repo.name === repoName);
}

/**
 * Get all repository names
 * @returns {string[]} Array of all repository names
 */
export function getAllRepositoryNames() {
  return [
    ...ACTIVE_REPOSITORIES.map(r => r.name),
    ...LEGACY_REPOSITORIES.map(r => r.name),
    ...LOCAL_ONLY_REPOSITORIES.map(r => r.name),
  ];
}

// ============================================================================
// IMPORTANT NOTES
// ============================================================================

/**
 * IMPORTANT NAMING CONVENTIONS:
 *
 * 1. GitHub Organization: DESIGN-DVW
 *    - This is the PRIMARY and ONLY active GitHub organization
 *    - All new repositories MUST be created here
 *
 * 2. Legacy Organization: DVW-Design
 *    - Contains GlossiaApp only
 *    - Will be migrated to DESIGN-DVW
 *    - DO NOT create new repositories here
 *
 * 3. Local Folder: DVWDesign
 *    - This is ONLY a local file system folder name
 *    - Does NOT correspond to any GitHub organization
 *    - Used for local organization only
 *
 * 4. FigmaAPI:
 *    - This is ONLY a local subdirectory
 *    - Does NOT exist as a repository on GitHub
 *    - Contains FigmaDSController and FigmailAPP locally
 *    - These repos exist at root level on GitHub (not under FigmaAPI)
 *
 * 5. NPM Scope:
 *    - Use @design-dvw for all packages
 *    - Matches GitHub organization (lowercase)
 *
 * NEVER reference:
 * - github.com/DESIGN-DVW/* (does not exist)
 * - github.com/FigmaAPI/* (does not exist)
 * - @dvwdesign/* (incorrect NPM scope)
 */

export default {
  GITHUB_ORG,
  LEGACY_GITHUB_ORG,
  GITHUB_BASE_URL,
  LOCAL_BASE_PATH,
  ACTIVE_REPOSITORIES,
  LEGACY_REPOSITORIES,
  LOCAL_ONLY_REPOSITORIES,
  NPM_SCOPE,
  getGitHubUrl,
  getLocalPath,
  isActiveRepository,
  isLocalOnly,
  getAllRepositoryNames,
};
