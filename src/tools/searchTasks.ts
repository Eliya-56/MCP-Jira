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
  server.registerTool(
    "search_tasks",
    {
      description: "Search Jira issues by text query or raw JQL. Provide either 'query' (text search) or 'jql' (raw JQL), not both.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .optional()
          .describe("Text to search for in issues (uses text ~ \"...\")"),
        jql: z
          .string()
          .min(1)
          .optional()
          .describe("Raw JQL query (e.g. 'project = PROJ AND status = \"In Progress\"')"),
        max_results: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(5)
          .describe("Maximum number of results (1-50, default 5)"),
      },
    },
    async (args) => {
      try {
        if (!args.query && !args.jql) {
          return errorResponse("Either 'query' or 'jql' must be provided.");
        }
        if (args.query && args.jql) {
          return errorResponse("Provide either 'query' or 'jql', not both.");
        }

        const jql = args.jql
          ? args.jql
          : `text ~ "${args.query!.replace(/"/g, '\\"')}"`;

        const data = await client.post<SearchResponse>("/search/jql", {
          jql,
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
