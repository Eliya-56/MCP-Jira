# Jira MCP Server

MCP (Model Context Protocol) server for Jira Cloud.
Provides AI assistants with tools to read, search, create, update, transition, link, comment, and attach files to Jira issues via the REST API v3. Text fields (descriptions, comments) support Markdown formatting.

## Prerequisites

- Node.js 18+
- Jira Cloud instance
- API Token for your Atlassian account ([create one here](https://id.atlassian.com/manage-profile/security/api-tokens))

## Setup

```bash
npm install
npm run build
```

Create a `.env` file (see `.env.example`):

```
JIRA_BASE_URL=https://jira.example.com
JIRA_EMAIL=user@example.com
JIRA_API_TOKEN=your-api-token
```

## Running as MCP Server

Add to your Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["C:\\repos\\Custom-MCP\\Jira\\dist\\index.js"]
    }
  }
}
```

Or run directly for development (without building):

```bash
npm run dev
```

## Tools

### get_my_tasks

Returns active tasks assigned to the current user.

| Parameter     | Type   | Default | Description              |
|---------------|--------|---------|--------------------------|
| `max_results` | number | 10      | Max tasks to return (1-50) |

JQL: `assignee = currentUser() AND status NOT IN (Done, Cancelled) ORDER BY priority DESC`

### get_task_details

Returns full context for a single issue: summary, description, status, assignee, comments, attachments, and issue links.

| Parameter   | Type   | Description                  |
|-------------|--------|------------------------------|
| `issue_key` | string | Issue key, e.g. `PROJ-123`   |

Response includes `issueLinks[]` with `id`, `linkType`, `direction`, `relation`, and linked issue details. Use the link `id` with `unlink_issues` to remove a link.

### search_tasks

Searches issues by text query or raw JQL. Provide either `query` or `jql`, not both.

| Parameter     | Type   | Default | Description                              |
|---------------|--------|---------|------------------------------------------|
| `query`       | string |         | Text to search for (uses `text ~ "..."`) |
| `jql`         | string |         | Raw JQL query                            |
| `max_results` | number | 5       | Max results (1-50)                       |

### update_task_status

Transitions an issue to a new status. Fetches available transitions first, matches by name (case-insensitive), then executes.

| Parameter         | Type   | Description                              |
|-------------------|--------|------------------------------------------|
| `issue_key`       | string | Issue key, e.g. `PROJ-123`               |
| `transition_name` | string | Target transition, e.g. `In Progress`    |

### create_task

Creates a new Jira issue. Description supports [Markdown formatting](docs/markdown-formatting.md).

| Parameter     | Type   | Default  | Description                             |
|---------------|--------|----------|-----------------------------------------|
| `project`     | string |          | Project key (e.g. `PROJ`)               |
| `summary`     | string |          | Issue title                             |
| `issue_type`  | string | `Task`   | Issue type (Task, Bug, Story, Epic ...) |
| `description` | string |          | Description (supports Markdown)         |
| `parent`      | string |          | Parent issue key (e.g. epic key)        |

### update_task

Updates fields on an existing Jira issue. Only provided fields are changed. Description supports [Markdown formatting](docs/markdown-formatting.md).

| Parameter     | Type   | Description                             |
|---------------|--------|-----------------------------------------|
| `issue_key`   | string | Issue key, e.g. `PROJ-123`              |
| `summary`     | string | New issue title                         |
| `description` | string | New description (supports Markdown)     |
| `issue_type`  | string | New issue type (Story, Bug, Task ...)   |
| `parent`      | string | New parent issue key (e.g. epic key)    |

### link_issues

Creates a link between two Jira issues. Use `get_task_details` to see existing links.

| Parameter       | Type   | Description                                            |
|-----------------|--------|--------------------------------------------------------|
| `link_type`     | string | Link type name (e.g. `Blocks`, `Relates`, `Duplicate`) |
| `outward_issue` | string | Issue key that gets the outward relation (e.g. the blocker) |
| `inward_issue`  | string | Issue key that gets the inward relation (e.g. the blocked)  |

Common link types: **Blocks** (blocks / is blocked by), **Relates** (relates to), **Duplicate** (duplicates / is duplicated by), **Cloners** (clones / is cloned by).

### unlink_issues

Removes a link between two issues by link ID. Get the link ID from `get_task_details` → `issueLinks[].id`.

| Parameter | Type   | Description              |
|-----------|--------|--------------------------|
| `link_id` | string | Issue link ID to delete  |

### add_comment

Adds a comment to an issue. Supports [Markdown formatting](docs/markdown-formatting.md).

| Parameter   | Type   | Description                    |
|-------------|--------|--------------------------------|
| `issue_key` | string | Issue key, e.g. `PROJ-123`     |
| `comment`   | string | Comment text (supports Markdown) |

### attach_file

Uploads a file from disk and attaches it to an issue. Optionally adds a comment in the same call.

| Parameter   | Type   | Required | Description                                |
|-------------|--------|----------|--------------------------------------------|
| `issue_key` | string | yes      | Issue key, e.g. `PROJ-123`                 |
| `file_path` | string | yes      | Absolute path to the file on disk          |
| `comment`   | string | no       | Optional comment to add after attaching    |

## CLI

A standalone CLI runner is included for manual testing outside of MCP. It uses the same `.env` config and the same Jira client.

```bash
npm run cli -- <tool_name> [json_args]
```

### Examples (key=value — works everywhere)

The recommended way to pass arguments. No quoting issues on any OS or shell.

```
npm run cli -- --help
npm run cli -- get_my_tasks
npm run cli -- get_my_tasks max_results=5
npm run cli -- get_task_details issue_key=PROJ-123
npm run cli -- search_tasks query="oauth bug" max_results=5
npm run cli -- search_tasks jql="project = PROJ AND status = Open"
npm run cli -- create_task project=PROJ summary="Fix login bug" issue_type=Bug description="**Steps:** ..." parent=PROJ-100
npm run cli -- update_task issue_key=PROJ-123 summary="Updated title" description="New **description**"
npm run cli -- update_task_status issue_key=PROJ-123 transition_name="In Progress"
npm run cli -- add_comment issue_key=PROJ-123 comment="Fixed in PR #42"
npm run cli -- attach_file issue_key=PROJ-123 file_path=C:\path\to\report.pdf
npm run cli -- attach_file issue_key=PROJ-123 file_path=C:\path\to\report.pdf comment="See attached report"
npm run cli -- link_issues link_type=Blocks outward_issue=PROJ-1 inward_issue=PROJ-2
npm run cli -- unlink_issues link_id=12345
```

### Examples (JSON — Bash / macOS / Linux)

JSON is also accepted as a single argument when wrapped in single quotes:

```bash
npm run cli -- get_task_details '{"issue_key": "PROJ-123"}'
npm run cli -- search_tasks '{"query": "oauth bug", "max_results": 5}'
```

> **Windows note:** `npm.cmd` passes arguments through `cmd.exe`, which strips double quotes. Use the `key=value` format on Windows instead of JSON.

Output is formatted JSON printed to stdout. Errors print to stderr with a non-zero exit code.

## Project Structure

```
src/
  index.ts           — MCP server entry point (stdio transport)
  cli.ts             — CLI entry point for manual testing
  config.ts          — .env loader, validates JIRA_BASE_URL / EMAIL / API_TOKEN
  adf.ts             — ADF ↔ Markdown/plain-text conversion
  jira-client.ts     — HTTP wrapper over native fetch with Basic Auth
  response.ts        — successResponse / errorResponse helpers
  tools/
    getMyTasks.ts
    getTaskDetails.ts
    searchTasks.ts
    updateTaskStatus.ts
    addComment.ts
    attachFile.ts
    createTask.ts
    updateTask.ts
    linkIssues.ts
    unlinkIssues.ts
docs/
  markdown-formatting.md  — Supported Markdown syntax reference
```
