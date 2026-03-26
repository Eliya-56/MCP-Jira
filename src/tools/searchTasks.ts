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
    "search_tasks",
    "Search Jira issues by text query.",
    {
      query: z.string().min(1).describe("Text to search for in issues"),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .describe("Maximum number of results (1-50, default 5)"),
    },
    async (args) => {
      try {
        const escaped = args.query.replace(/"/g, '\\"');
        const data = await client.post<SearchResponse>("/search/jql", {
          jql: `text ~ "${escaped}"`,
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
        return errorResponse("Failed to search tasks.");
      }
    },
  );
}
