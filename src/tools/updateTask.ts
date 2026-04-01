import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { markdownToAdf } from "../adf.js";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

export function register(server: McpServer, client: JiraClient): void {
  server.registerTool(
    "update_task",
    {
      description: "Update fields on an existing Jira issue. Only provided fields are changed. Description supports Markdown.",
      inputSchema: {
        issue_key: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Must be a valid issue key like PROJ-123")
          .describe("Jira issue key (e.g. PROJ-123)"),
        summary: z
          .string()
          .min(1)
          .optional()
          .describe("New issue title"),
        description: z
          .string()
          .optional()
          .describe("New description (supports Markdown)"),
        issue_type: z
          .string()
          .optional()
          .describe("New issue type (e.g. Story, Bug, Task)"),
        parent: z
          .string()
          .optional()
          .describe("New parent issue key (e.g. epic key PROJ-100)"),
      },
    },
    async (args) => {
      try {
        const fields: Record<string, unknown> = {};

        if (args.summary) fields.summary = args.summary;
        if (args.description) fields.description = markdownToAdf(args.description);
        if (args.issue_type) fields.issuetype = { name: args.issue_type };
        if (args.parent) fields.parent = { key: args.parent };

        if (Object.keys(fields).length === 0) {
          return errorResponse("At least one field to update must be provided (summary, description, issue_type, parent).");
        }

        await client.put(`/issue/${args.issue_key}`, { fields });

        return successResponse({ success: true, key: args.issue_key });
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse(`Failed to update issue: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
