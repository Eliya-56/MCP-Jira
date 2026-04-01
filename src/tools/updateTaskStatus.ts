import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

interface TransitionsResponse {
  transitions: Array<{
    id: string;
    name: string;
  }>;
}

export function register(server: McpServer, client: JiraClient): void {
  server.registerTool(
    "update_task_status",
    {
      description: "Transition a Jira issue to a new status using the Jira transitions API.",
      inputSchema: {
        issue_key: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Must be a valid issue key like PROJ-123")
          .describe("Jira issue key (e.g. PROJ-123)"),
        transition_name: z
          .string()
          .min(1)
          .describe("Target transition name (e.g. 'In Progress', 'Done')"),
      },
    },
    async (args) => {
      try {
        const data = await client.get<TransitionsResponse>(
          `/issue/${args.issue_key}/transitions`,
        );

        const match = data.transitions.find(
          (t) => t.name.toLowerCase() === args.transition_name.toLowerCase(),
        );

        if (!match) {
          const available = data.transitions.map((t) => t.name).join(", ");
          return errorResponse(
            `Transition "${args.transition_name}" not found. Available transitions: ${available || "(none)"}`,
          );
        }

        await client.post(`/issue/${args.issue_key}/transitions`, {
          transition: { id: match.id },
        });

        return successResponse({ success: true });
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse(`Failed to transition issue ${args.issue_key}.`);
      }
    },
  );
}
