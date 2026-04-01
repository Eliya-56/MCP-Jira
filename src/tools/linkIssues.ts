import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

export function register(server: McpServer, client: JiraClient): void {
  server.registerTool(
    "link_issues",
    {
      description: "Create a link between two Jira issues. Common link types: Blocks (blocks / is blocked by), Relates (relates to), Duplicate (duplicates / is duplicated by), Cloners (clones / is cloned by).",
      inputSchema: {
        link_type: z
          .string()
          .min(1)
          .describe("Link type name (e.g. 'Blocks', 'Relates', 'Duplicate')"),
        outward_issue: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Must be a valid issue key")
          .describe("Issue key that gets the outward description (e.g. the one that 'blocks')"),
        inward_issue: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Must be a valid issue key")
          .describe("Issue key that gets the inward description (e.g. the one that 'is blocked by')"),
      },
    },
    async (args) => {
      try {
        await client.post("/issueLink", {
          type: { name: args.link_type },
          outwardIssue: { key: args.outward_issue },
          inwardIssue: { key: args.inward_issue },
        });

        return successResponse({
          success: true,
          link_type: args.link_type,
          outward_issue: args.outward_issue,
          inward_issue: args.inward_issue,
        });
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse(`Failed to link issues: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );
}
