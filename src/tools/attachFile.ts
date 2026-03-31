import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

interface AttachmentResponse {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  content: string;
}

export function register(server: McpServer, client: JiraClient): void {
  server.tool(
    "attach_file",
    "Upload a file from disk and attach it to a Jira issue.",
    {
      issue_key: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Must be a valid issue key like PROJ-123")
        .describe("Jira issue key (e.g. PROJ-123)"),
      file_path: z
        .string()
        .min(1)
        .describe("Absolute path to the file on disk"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment to add after attaching"),
    },
    async (args) => {
      try {
        const fileBuffer = await readFile(args.file_path);
        const filename = basename(args.file_path);
        const blob = new Blob([fileBuffer]);

        const formData = new FormData();
        formData.append("file", blob, filename);

        const result = await client.postFormData<AttachmentResponse[]>(
          `/issue/${args.issue_key}/attachments`,
          formData,
        );

        const attached = (result ?? []).map((a) => ({
          id: a.id,
          filename: a.filename,
          size: a.size,
          mimeType: a.mimeType,
          content: a.content,
        }));

        if (args.comment) {
          const { markdownToAdf } = await import("../adf.js");
          await client.post(`/issue/${args.issue_key}/comment`, {
            body: markdownToAdf(args.comment),
          });
        }

        return successResponse({
          success: true,
          attachments: attached,
          commentAdded: !!args.comment,
        });
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        const msg = error instanceof Error ? error.message : String(error);
        return errorResponse(`Failed to attach file: ${msg}`);
      }
    },
  );
}
