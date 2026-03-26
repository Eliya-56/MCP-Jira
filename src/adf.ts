/**
 * Minimal Atlassian Document Format (ADF) utilities.
 * v3 API returns description / comment body as ADF JSON.
 */

export interface AdfNode {
  type: string;
  version?: number;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * Map of media-service UUID -> filename.
 * Built from issue attachment[] field (mediaApiFileId -> filename).
 */
export type MediaLookup = Map<string, string>;

/**
 * Recursively extracts plain text from an ADF document tree.
 * Handles paragraphs, headings, lists, code blocks, inline text, etc.
 * When mediaLookup is provided, resolves media UUIDs to filenames.
 */
export function adfToText(node: AdfNode | null | undefined, mediaLookup?: MediaLookup): string {
  if (!node) return "";

  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "media" || node.type === "mediaInline") {
    const id = (node.attrs?.id as string) ?? "";
    const filename =
      (node.attrs?.filename as string) ??
      mediaLookup?.get(id) ??
      null;
    const alt = (node.attrs?.alt as string) ?? null;
    const label = filename ?? alt ?? (id || "unknown");
    return `[attachment: ${label}]`;
  }

  if (node.type === "emoji") {
    return (node.attrs?.shortName as string) ?? (node.attrs?.text as string) ?? "";
  }

  if (node.type === "mention") {
    return (node.attrs?.text as string) ?? "@unknown";
  }

  if (node.type === "inlineCard" || node.type === "blockCard" || node.type === "embedCard") {
    return (node.attrs?.url as string) ?? "[card]";
  }

  if (!node.content || node.content.length === 0) {
    if (node.type === "hardBreak") return "\n";
    if (node.type === "rule") return "---\n";
    return "";
  }

  const childTexts = node.content.map((child) => adfToText(child, mediaLookup));

  switch (node.type) {
    case "paragraph":
    case "heading":
      return childTexts.join("") + "\n";
    case "bulletList":
    case "orderedList":
      return childTexts.map((t, i) => {
        const prefix = node.type === "orderedList" ? `${i + 1}. ` : "- ";
        return prefix + t.trim();
      }).join("\n") + "\n";
    case "listItem":
      return childTexts.join("");
    case "codeBlock":
      return "```\n" + childTexts.join("") + "\n```\n";
    case "blockquote":
      return childTexts.map((l) => "> " + l.trim()).join("\n") + "\n";
    case "mediaSingle":
    case "mediaGroup":
      return childTexts.join("") + "\n";
    default:
      return childTexts.join("");
  }
}

/**
 * Builds a media-UUID -> filename lookup from Jira attachment fields.
 * Uses mediaApiFileId (Cloud) to map the UUID that appears in ADF media nodes.
 */
export function buildMediaLookup(
  attachments: Array<{ filename: string; mediaApiFileId?: string }>,
): MediaLookup {
  const map = new Map<string, string>();
  for (const a of attachments) {
    if (a.mediaApiFileId) {
      map.set(a.mediaApiFileId, a.filename);
    }
  }
  return map;
}

/**
 * Extracts numeric attachment IDs from Jira rendered HTML.
 * Jira renders inline attachments as <img src="/rest/api/3/attachment/content/{id}" />.
 * Returns an array of attachment ID strings (preserves order, deduplicates).
 */
export function extractAttachmentIdsFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /\/attachment\/content\/(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      ids.push(match[1]);
    }
  }
  return ids;
}

/**
 * Extracts media UUIDs from an ADF tree in document order.
 */
export function extractMediaUuids(node: AdfNode | null | undefined): string[] {
  if (!node) return [];
  if (node.type === "media" || node.type === "mediaInline") {
    const id = (node.attrs?.id as string) ?? "";
    return id ? [id] : [];
  }
  if (!node.content) return [];
  return node.content.flatMap((child) => extractMediaUuids(child));
}

/**
 * Builds a media-UUID -> filename lookup by positionally matching
 * UUIDs from ADF with numeric attachment IDs from rendered HTML.
 * This is the workaround for Jira Cloud not returning mediaApiFileId.
 */
export function buildRenderedMediaLookup(
  adfBody: AdfNode | null | undefined,
  renderedHtml: string | null | undefined,
  attachmentById: Map<string, { filename: string }>,
): MediaLookup {
  const uuids = extractMediaUuids(adfBody);
  const attIds = extractAttachmentIdsFromHtml(renderedHtml);
  const map = new Map<string, string>();
  const count = Math.min(uuids.length, attIds.length);
  for (let i = 0; i < count; i++) {
    const att = attachmentById.get(attIds[i]);
    if (att) {
      map.set(uuids[i], att.filename);
    }
  }
  return map;
}

/**
 * Wraps a plain-text string into a minimal ADF document
 * suitable for POST /issue/{key}/comment body.
 */
export function textToAdf(text: string): AdfNode {
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: "doc",
    version: 1,
    content: paragraphs.map((para) => ({
      type: "paragraph",
      content: [{ type: "text", text: para.replace(/\n/g, " ") }],
    })),
  };
}
