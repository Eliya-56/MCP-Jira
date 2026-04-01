import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { markdownToAdf } from "../adf.js";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

interface CreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

export function register(server: McpServer, client: JiraClient): void {
  server.registerTool(
    "create_task",
    {
      description: "Create a new Jira issue. Description supports Markdown formatting (headings, bold, italic, code, lists, links, blockquotes).",
      inputSchema: {
        project: z
          .string()
          .min(1)
          .describe("Project key (e.g. PROJ)"),
        summary: z
          .string()
          .min(1)
          .describe("Issue title / summary"),
        issue_type: z
          .string()
          .default("Task")
          .describe("Issue type name (default: Task). Common values: Task, Bug, Story, Epic"),
        description: z
          .string()
          .optional()
          .describe("Issue description (supports Markdown)"),
        parent: z
          .string()
          .optional()
          .describe("Parent issue key (e.g. epic key PROJ-100) to link this issue under"),
      },
    },
    async (args) => {
      try {
        const fields: Record<string, unknown> = {
          project: { key: args.project },
          summary: args.summary,
          issuetype: { name: args.issue_type },
        };

        if (args.description) {
          fields.description = markdownToAdf(args.description);
        }
        if (args.parent) {
          fields.parent = { key: args.parent };
        }

        const data = await client.post<CreateIssueResponse>("/issue", { fields });

        return successResponse({
          key: data.key,
          id: data.id,
          url: data.self.replace(/\/rest\/api\/3\/issue\/.*/, `/browse/${data.key}`),
        });
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse(`Failed to create issue: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
