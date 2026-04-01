import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

export function register(server: McpServer, client: JiraClient): void {
  server.registerTool(
    "unlink_issues",
    {
      description: "Remove a link between two Jira issues by link ID. Get the link ID from get_task_details issueLinks field.",
      inputSchema: {
        link_id: z
          .string()
          .min(1)
          .describe("Issue link ID (from get_task_details issueLinks[].id)"),
      },
    },
    async (args) => {
      try {
        await client.delete(`/issueLink/${args.link_id}`);

        return successResponse({ success: true, deletedLinkId: args.link_id });
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse(`Failed to unlink issues: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
