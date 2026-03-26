import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

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

export function register(server: McpServer, client: JiraClient): void {
  server.tool(
    "get_my_tasks",
    "Get active tasks assigned to the current user, ordered by priority descending.",
    {
      max_results: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of tasks to return (1-50, default 10)"),
    },
    async (args) => {
      try {
        const data = await client.post<SearchResponse>("/search/jql", {
          jql: "assignee = currentUser() AND status NOT IN (Done, Cancelled) ORDER BY priority DESC",
          maxResults: args.max_results,
          fields: ["summary", "status", "priority"],
        });

        const tasks = data.issues.map((issue) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          priority: issue.fields.priority?.name ?? "None",
        }));

        return successResponse(tasks);
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse("Failed to fetch tasks.");
      }
    },
  );
}
