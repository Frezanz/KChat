export type ToolPermission = "read" | "write" | "execute" | "deploy";

export type ToolDefinition = {
  name: string;
  description: string;
  permission: ToolPermission;
  confirmationRequired: boolean;
  input: Record<string, unknown>;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: "e2b_git_branch", description: "Read the current Git branch inside an E2B workspace.", permission: "read", confirmationRequired: false, input: { type: "object", required: ["sandboxId"], properties: { sandboxId: { type: "string" }, directory: { type: "string" } } } },
  { name: "e2b_git_create_branch", description: "Create and switch to a Git branch inside an E2B workspace.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["sandboxId", "branch"], properties: { sandboxId: { type: "string" }, branch: { type: "string" }, directory: { type: "string" } } } },
  { name: "e2b_git_add", description: "Stage changes in an E2B Git workspace. With no paths, stages all changes.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["sandboxId"], properties: { sandboxId: { type: "string" }, directory: { type: "string" }, paths: { type: "array", items: { type: "string" } } } } },
  { name: "e2b_git_commit", description: "Commit staged changes inside an E2B workspace.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["sandboxId", "message"], properties: { sandboxId: { type: "string" }, message: { type: "string" }, directory: { type: "string" } } } },
  { name: "e2b_git_push", description: "Push an E2B workspace branch to its GitHub origin using the connected GitHub credential.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["sandboxId", "branch"], properties: { sandboxId: { type: "string" }, branch: { type: "string" }, directory: { type: "string" } } } },

  { name: "github_list_repositories", description: "List repositories accessible to the connected GitHub account, or import a selected GitHub repository into an E2B sandbox when action=import_to_e2b.", permission: "read", confirmationRequired: false, input: { type: "object", properties: { action: { type: "string", enum: ["list", "import_to_e2b"] }, visibility: { type: "string", enum: ["all", "public", "private"] }, owner: { type: "string" }, repo: { type: "string" }, ref: { type: "string" }, sandboxId: { type: "string" }, directory: { type: "string" } } } },
  { name: "github_read_file", description: "Read a text file from a GitHub repository.", permission: "read", confirmationRequired: false, input: { type: "object", required: ["owner", "repo", "path"], properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, ref: { type: "string" } } } },
  { name: "github_write_file", description: "Create or update one text file in a GitHub repository. This changes the repository and requires confirmation.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["owner", "repo", "path", "content", "message"], properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, content: { type: "string" }, message: { type: "string" }, branch: { type: "string" }, sha: { type: "string" } } } },
  { name: "github_commit_multiple_files", description: "Atomically commit multiple text file changes to a GitHub branch. Creates the branch when needed and requires confirmation.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["owner", "repo", "branch", "message", "upserts"], properties: { owner: { type: "string" }, repo: { type: "string" }, branch: { type: "string" }, base_branch: { type: "string" }, message: { type: "string" }, upserts: { type: "array", items: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } } }, deletes: { type: "array", items: { type: "string" } } } } },
  { name: "github_create_branch", description: "Create a branch from an existing branch in a GitHub repository.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["owner", "repo", "branch", "from"], properties: { owner: { type: "string" }, repo: { type: "string" }, branch: { type: "string" }, from: { type: "string" } } } },
  { name: "github_create_pull_request", description: "Create a pull request from one branch to another.", permission: "write", confirmationRequired: true, input: { type: "object", required: ["owner", "repo", "head", "base", "title"], properties: { owner: { type: "string" }, repo: { type: "string" }, head: { type: "string" }, base: { type: "string" }, title: { type: "string" }, body: { type: "string" }, draft: { type: "boolean" } } } },
  { name: "github_get_pull_request", description: "Inspect a pull request and its current head, state, and mergeability.", permission: "read", confirmationRequired: false, input: { type: "object", required: ["owner", "repo", "pull_number"], properties: { owner: { type: "string" }, repo: { type: "string" }, pull_number: { type: "integer" } } } },
  { name: "github_list_checks", description: "Inspect CI check runs for a commit or branch.", permission: "read", confirmationRequired: false, input: { type: "object", required: ["owner", "repo", "ref"], properties: { owner: { type: "string" }, repo: { type: "string" }, ref: { type: "string" } } } },
  { name: "netlify_list_sites", description: "List Netlify projects/sites available to the connected account.", permission: "read", confirmationRequired: false, input: { type: "object", properties: {} } },
  { name: "netlify_get_site", description: "Get a Netlify project/site by project ID or domain.", permission: "read", confirmationRequired: false, input: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" } } } },
  { name: "netlify_list_deploys", description: "List deploys for a Netlify project.", permission: "read", confirmationRequired: false, input: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" } } } },
  { name: "netlify_get_deploy", description: "Get a specific Netlify deploy.", permission: "read", confirmationRequired: false, input: { type: "object", required: ["siteId", "deployId"], properties: { siteId: { type: "string" }, deployId: { type: "string" } } } },
  { name: "netlify_trigger_build", description: "Trigger a build for a Netlify project, optionally for a branch.", permission: "deploy", confirmationRequired: true, input: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" }, branch: { type: "string" }, clear_cache: { type: "boolean" }, title: { type: "string" } } } },
];

export const OPENAI_FUNCTION_TOOLS = TOOL_DEFINITIONS.map((tool) => ({
  type: "function" as const,
  name: tool.name,
  description: tool.description,
  strict: false,
  parameters: tool.input,
}));
