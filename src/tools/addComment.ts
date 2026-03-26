import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textToAdf } from "../adf.js";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

export function register(server: McpServer, client: JiraClient): void {
  server.tool(
    "add_comment",
    "Add a comment to a Jira issue.",
    {
      issue_key: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Must be a valid issue key like PROJ-123")
        .describe("Jira issue key (e.g. PROJ-123)"),
      comment: z.string().min(1).describe("Comment text to add"),
    },
    async (args) => {
      try {
        await client.post(`/issue/${args.issue_key}/comment`, {
          body: textToAdf(args.comment),
        });

        return successResponse({ success: true });
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse(`Failed to add comment to ${args.issue_key}.`);
      }
    },
  );
}
