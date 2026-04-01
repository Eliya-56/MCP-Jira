import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getJiraConfig } from "./config.js";
import { JiraClient } from "./jira-client.js";
import { register as registerGetMyTasks } from "./tools/getMyTasks.js";
import { register as registerGetTaskDetails } from "./tools/getTaskDetails.js";
import { register as registerSearchTasks } from "./tools/searchTasks.js";
import { register as registerUpdateTaskStatus } from "./tools/updateTaskStatus.js";
import { register as registerAddComment } from "./tools/addComment.js";
import { register as registerAttachFile } from "./tools/attachFile.js";
import { register as registerCreateTask } from "./tools/createTask.js";
import { register as registerUpdateTask } from "./tools/updateTask.js";
import { register as registerLinkIssues } from "./tools/linkIssues.js";
import { register as registerUnlinkIssues } from "./tools/unlinkIssues.js";

async function main(): Promise<void> {
  const config = getJiraConfig();
  const client = new JiraClient(config.baseUrl, config.email, config.apiToken);

  const server = new McpServer({
    name: "Jira",
    version: "1.0.0",
  });

  registerGetMyTasks(server, client);
  registerGetTaskDetails(server, client);
  registerSearchTasks(server, client);
  registerUpdateTaskStatus(server, client);
  registerAddComment(server, client);
  registerAttachFile(server, client);
  registerCreateTask(server, client);
  registerUpdateTask(server, client);
  registerLinkIssues(server, client);
  registerUnlinkIssues(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(
    `Jira MCP server failed to start: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exit(1);
});
