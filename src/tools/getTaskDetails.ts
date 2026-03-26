import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AdfNode } from "../adf.js";
import { adfToText, buildMediaLookup, buildRenderedMediaLookup, extractAttachmentIdsFromHtml } from "../adf.js";
import type { JiraClient } from "../jira-client.js";
import { JiraClientError } from "../jira-client.js";
import { errorResponse, successResponse } from "../response.js";

interface AttachmentField {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  created: string;
  author: { displayName: string };
  content: string;
  mediaApiFileId?: string;
}

interface CommentEntry {
  author: { displayName: string };
  body: AdfNode;
  created: string;
  renderedBody?: string;
}

interface IssueResponse {
  key: string;
  fields: {
    summary: string;
    description: AdfNode | null;
    status: { name: string };
    assignee: { displayName: string; emailAddress?: string } | null;
    attachment: AttachmentField[];
    comment: {
      comments: CommentEntry[];
    };
  };
  renderedFields?: {
    comment?: {
      comments?: Array<{ body?: string }>;
    };
  };
}

export function register(server: McpServer, client: JiraClient): void {
  server.tool(
    "get_task_details",
    "Get full context for a Jira issue including description, status, assignee, and comments.",
    {
      issue_key: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Must be a valid issue key like PROJ-123")
        .describe("Jira issue key (e.g. PROJ-123)"),
    },
    async (args) => {
      try {
        const data = await client.get<IssueResponse>(
          `/issue/${args.issue_key}?fields=summary,description,status,assignee,comment,attachment&expand=renderedFields`,
        );

        const attachments = data.fields.attachment ?? [];
        const mediaLookup = buildMediaLookup(attachments);
        const attachmentById = new Map(attachments.map((a) => [a.id, a]));
        const renderedComments = data.renderedFields?.comment?.comments ?? [];

        const result = {
          key: data.key,
          summary: data.fields.summary,
          description: adfToText(data.fields.description, mediaLookup).trim() || null,
          status: data.fields.status.name,
          assignee: data.fields.assignee?.displayName ?? null,
          comments: data.fields.comment.comments.map((c, i) => {
            const renderedHtml = renderedComments[i]?.body ?? null;
            const refIds = extractAttachmentIdsFromHtml(renderedHtml);
            const referencedAttachments = refIds
              .map((id) => attachmentById.get(id))
              .filter(Boolean)
              .map((a) => ({ filename: a!.filename, content: a!.content }));

            const commentMediaLookup = buildRenderedMediaLookup(c.body, renderedHtml, attachmentById);
            const mergedLookup = new Map([...mediaLookup, ...commentMediaLookup]);

            return {
              author: c.author.displayName,
              body: adfToText(c.body, mergedLookup).trim(),
              created: c.created,
              ...(referencedAttachments.length > 0 ? { referencedAttachments } : {}),
            };
          }),
          attachments: attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            created: a.created,
            author: a.author.displayName,
            content: a.content,
          })),
        };

        return successResponse(result);
      } catch (error) {
        if (error instanceof JiraClientError) {
          return errorResponse(error.message);
        }
        return errorResponse(`Failed to fetch issue ${args.issue_key}.`);
      }
    },
  );
}
