import { adfToText, buildMediaLookup, buildRenderedMediaLookup, extractAttachmentIdsFromHtml, textToAdf, type AdfNode } from "./adf.js";
import { getJiraConfig } from "./config.js";
import { JiraClient, JiraClientError } from "./jira-client.js";

interface TaskRow {
  key: string;
  summary: string;
  status: string;
  priority: string;
}

interface SearchResponse {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      priority: { name: string } | null;
    };
  }>;
}

interface AttachmentField {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  created: string;
  author: { displayName: string };
  content: string;
  mediaApiFileId?: string;
}

interface IssueResponse {
  key: string;
  fields: {
    summary: string;
    description: AdfNode | null;
    status: { name: string };
    assignee: { displayName: string } | null;
    attachment: AttachmentField[];
    comment: {
      comments: Array<{
        author: { displayName: string };
        body: AdfNode;
        created: string;
      }>;
    };
  };
  renderedFields?: {
    comment?: {
      comments?: Array<{ body?: string }>;
    };
  };
}

interface TransitionsResponse {
  transitions: Array<{ id: string; name: string }>;
}

// ── handlers ──

async function getMyTasks(client: JiraClient, args: Record<string, unknown>): Promise<unknown> {
  const maxResults = Number(args.max_results ?? 10);
  const data = await client.post<SearchResponse>("/search/jql", {
    jql: "assignee = currentUser() AND status NOT IN (Done, Cancelled) ORDER BY priority DESC",
    maxResults,
    fields: ["summary", "status", "priority"],
  });
  return data.issues.map<TaskRow>((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status.name,
    priority: i.fields.priority?.name ?? "None",
  }));
}

async function getTaskDetails(client: JiraClient, args: Record<string, unknown>): Promise<unknown> {
  const key = String(args.issue_key ?? "");
  if (!key) throw new Error("issue_key is required");
  const data = await client.get<IssueResponse>(
    `/issue/${key}?fields=summary,description,status,assignee,comment,attachment&expand=renderedFields`,
  );
  const attachments = data.fields.attachment ?? [];
  const mediaLookup = buildMediaLookup(attachments);
  const attachmentById = new Map(attachments.map((a) => [a.id, a]));
  const renderedComments = data.renderedFields?.comment?.comments ?? [];

  return {
    key: data.key,
    summary: data.fields.summary,
    description: adfToText(data.fields.description, mediaLookup).trim() || null,
    status: data.fields.status.name,
    assignee: data.fields.assignee?.displayName ?? null,
    comments: data.fields.comment.comments.map((c, i) => {
      const renderedHtml = renderedComments[i]?.body ?? null;
      const refIds = extractAttachmentIdsFromHtml(renderedHtml);
      const referencedAttachments = refIds
        .map((id) => attachmentById.get(id))
        .filter(Boolean)
        .map((a) => ({ filename: a!.filename, content: a!.content }));

      const commentMediaLookup = buildRenderedMediaLookup(c.body, renderedHtml, attachmentById);
      const mergedLookup = new Map([...mediaLookup, ...commentMediaLookup]);

      return {
        author: c.author.displayName,
        body: adfToText(c.body, mergedLookup).trim(),
        created: c.created,
        ...(referencedAttachments.length > 0 ? { referencedAttachments } : {}),
      };
    }),
    attachments: attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      created: a.created,
      author: a.author.displayName,
      content: a.content,
    })),
  };
}

async function searchTasks(client: JiraClient, args: Record<string, unknown>): Promise<unknown> {
  const query = args.query ? String(args.query) : null;
  const jql = args.jql ? String(args.jql) : null;
  if (!query && !jql) throw new Error("Either 'query' or 'jql' is required");
  if (query && jql) throw new Error("Provide either 'query' or 'jql', not both");
  const maxResults = Number(args.max_results ?? 5);

  const finalJql = jql
    ? jql
    : `text ~ "${query!.replace(/"/g, '\\"')}"`;

  const data = await client.post<SearchResponse>("/search/jql", {
    jql: finalJql,
    maxResults,
    fields: ["summary", "status", "priority"],
  });
  return data.issues.map<TaskRow>((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status.name,
    priority: i.fields.priority?.name ?? "None",
  }));
}

async function updateTaskStatus(client: JiraClient, args: Record<string, unknown>): Promise<unknown> {
  const key = String(args.issue_key ?? "");
  const transitionName = String(args.transition_name ?? "");
  if (!key) throw new Error("issue_key is required");
  if (!transitionName) throw new Error("transition_name is required");

  const data = await client.get<TransitionsResponse>(`/issue/${key}/transitions`);
  const match = data.transitions.find(
    (t) => t.name.toLowerCase() === transitionName.toLowerCase(),
  );
  if (!match) {
    const available = data.transitions.map((t) => `"${t.name}"`).join(", ");
    throw new Error(`Transition "${transitionName}" not found. Available: ${available || "(none)"}`);
  }

  await client.post(`/issue/${key}/transitions`, { transition: { id: match.id } });
  return { success: true, transitionId: match.id, transitionName: match.name };
}

async function addComment(client: JiraClient, args: Record<string, unknown>): Promise<unknown> {
  const key = String(args.issue_key ?? "");
  const comment = String(args.comment ?? "");
  if (!key) throw new Error("issue_key is required");
  if (!comment) throw new Error("comment is required");

  await client.post(`/issue/${key}/comment`, { body: textToAdf(comment) });
  return { success: true };
}

async function attachFile(client: JiraClient, args: Record<string, unknown>): Promise<unknown> {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");

  const key = String(args.issue_key ?? "");
  const filePath = String(args.file_path ?? "");
  if (!key) throw new Error("issue_key is required");
  if (!filePath) throw new Error("file_path is required");

  const fileBuffer = await readFile(filePath);
  const filename = basename(filePath);
  const blob = new Blob([fileBuffer]);

  const formData = new FormData();
  formData.append("file", blob, filename);

  const result = await client.postFormData<Array<{
    id: string; filename: string; size: number; mimeType: string; content: string;
  }>>(`/issue/${key}/attachments`, formData);

  const attached = (result ?? []).map((a) => ({
    id: a.id,
    filename: a.filename,
    size: a.size,
    mimeType: a.mimeType,
    content: a.content,
  }));

  const comment = args.comment ? String(args.comment) : null;
  if (comment) {
    await client.post(`/issue/${key}/comment`, { body: textToAdf(comment) });
  }

  return { success: true, attachments: attached, commentAdded: !!comment };
}

async function rawIssue(client: JiraClient, args: Record<string, unknown>): Promise<unknown> {
  const key = String(args.issue_key ?? "");
  if (!key) throw new Error("issue_key is required");
  return client.get(`/issue/${key}?fields=comment,attachment,description`);
}

// ── dispatcher ──

const TOOLS: Record<string, (client: JiraClient, args: Record<string, unknown>) => Promise<unknown>> = {
  get_my_tasks: getMyTasks,
  get_task_details: getTaskDetails,
  search_tasks: searchTasks,
  update_task_status: updateTaskStatus,
  raw_issue: rawIssue,
  add_comment: addComment,
  attach_file: attachFile,
};

function printUsage(): void {
  console.log(`
Jira CLI — manual tool runner (uses .env for auth)

Usage:
  npm run cli -- <tool> key=value [key=value ...]
  npm run cli -- <tool> '<json>'

Tools:
  get_my_tasks        [max_results=10]
  get_task_details    issue_key=PROJ-123
  search_tasks        query="oauth bug" max_results=5   (text search)
  search_tasks        jql="project = PROJ AND status = Open"  (raw JQL)
  update_task_status  issue_key=PROJ-123 transition_name="In Progress"
  add_comment         issue_key=PROJ-123 comment="Fixed in PR #42"
  attach_file         issue_key=PROJ-123 file_path=C:\path\to\file.txt [comment="See attached"]
  raw_issue           issue_key=PROJ-123  (dump raw API response for debugging)
`.trim());
}

async function main(): Promise<void> {
  const toolName = process.argv[2];

  if (!toolName || toolName === "--help" || toolName === "-h") {
    printUsage();
    process.exit(0);
  }

  const handler = TOOLS[toolName];
  if (!handler) {
    console.error(`Unknown tool: "${toolName}". Available: ${Object.keys(TOOLS).join(", ")}`);
    process.exit(1);
  }

  let args: Record<string, unknown> = {};
  const extraArgs = process.argv.slice(3);

  if (extraArgs.length === 1 && extraArgs[0].trimStart().startsWith("{")) {
    try {
      args = JSON.parse(extraArgs[0]);
    } catch {
      console.error(`Invalid JSON argument: ${extraArgs[0]}`);
      process.exit(1);
    }
  } else if (extraArgs.length > 0) {
    for (const token of extraArgs) {
      const eq = token.indexOf("=");
      if (eq === -1) {
        console.error(`Invalid argument "${token}". Use key=value format or a single JSON string.`);
        process.exit(1);
      }
      const key = token.slice(0, eq);
      let value: string | number = token.slice(eq + 1);
      const num = Number(value);
      if (value !== "" && Number.isFinite(num)) {
        args[key] = num;
      } else {
        args[key] = value;
      }
    }
  }

  const config = getJiraConfig();
  const client = new JiraClient(config.baseUrl, config.email, config.apiToken);

  console.log(`\n> ${toolName}`, Object.keys(args).length ? JSON.stringify(args) : "");

  try {
    const result = await handler(client, args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof JiraClientError) {
      console.error("\n--- Jira API Error ---");
      console.error(`  Status:   ${error.statusCode} ${error.statusText}`);
      console.error(`  Method:   ${error.method}`);
      console.error(`  Path:     ${error.path}`);
      console.error(`  Message:  ${error.message}`);
      if (error.responseBody) {
        console.error("  Response body:");
        console.error(JSON.stringify(error.responseBody, null, 4));
      }
      console.error("----------------------");
    } else {
      console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

main();
