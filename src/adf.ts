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

// ── Markdown → ADF conversion ──

/**
 * Regex for inline markdown elements (order matters):
 *  1. inline code  2. link  3. bold  4. italic
 */
const INLINE_RE = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*([^\s*][^*]*?)\*/g;

function parseInline(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let lastIndex = 0;

  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, m.index) });
    }

    if (m[1] !== undefined) {
      nodes.push({ type: "text", text: m[1], marks: [{ type: "code" }] });
    } else if (m[2] !== undefined) {
      nodes.push({ type: "text", text: m[2], marks: [{ type: "link", attrs: { href: m[3] } }] });
    } else if (m[4] !== undefined) {
      nodes.push({ type: "text", text: m[4], marks: [{ type: "strong" }] });
    } else if (m[5] !== undefined) {
      nodes.push({ type: "text", text: m[5], marks: [{ type: "em" }] });
    }

    lastIndex = INLINE_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }
  if (nodes.length === 0) {
    nodes.push({ type: "text", text });
  }
  return nodes;
}

/**
 * Converts a Markdown string into an ADF document.
 *
 * Supported block elements: headings, bullet/ordered lists, code blocks,
 * blockquotes, horizontal rules, paragraphs.
 *
 * Supported inline elements: **bold**, *italic*, `code`, [links](url).
 */
export function markdownToAdf(markdown: string): AdfNode {
  const lines = markdown.split("\n");
  const blocks: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const node: AdfNode = { type: "codeBlock", content: [{ type: "text", text: codeLines.join("\n") }] };
      if (lang) node.attrs = { language: lang };
      blocks.push(node);
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", attrs: { level: headingMatch[1].length }, content: parseInline(headingMatch[2]) });
      i++;
      continue;
    }

    // Horizontal rule (---, ***, ___)
    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(line.trim())) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const paraLines: string[] = [];
      const paras: AdfNode[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        const stripped = lines[i].replace(/^>\s?/, "");
        if (stripped.trim() === "") {
          if (paraLines.length > 0) {
            paras.push({ type: "paragraph", content: parseInline(paraLines.join(" ")) });
            paraLines.length = 0;
          }
        } else {
          paraLines.push(stripped);
        }
        i++;
      }
      if (paraLines.length > 0) {
        paras.push({ type: "paragraph", content: parseInline(paraLines.join(" ")) });
      }
      if (paras.length > 0) blocks.push({ type: "blockquote", content: paras });
      continue;
    }

    // Bullet list
    if (/^[-*+]\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        const text = lines[i].replace(/^[-*+]\s+/, "");
        items.push({ type: "listItem", content: [{ type: "paragraph", content: parseInline(text) }] });
        i++;
      }
      blocks.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        const text = lines[i].replace(/^\d+[.)]\s+/, "");
        items.push({ type: "listItem", content: [{ type: "paragraph", content: parseInline(text) }] });
        i++;
      }
      blocks.push({ type: "orderedList", content: items });
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^-{3,}$|^\*{3,}$|^_{3,}$/.test(lines[i].trim()) &&
      !lines[i].startsWith(">") &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+[.)]\s/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length > 0) {
      blocks.push({ type: "paragraph", content: parseInline(pLines.join(" ")) });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", content: [{ type: "text", text: "" }] });
  }

  return { type: "doc", version: 1, content: blocks };
}

/** @deprecated Use markdownToAdf — kept for backward compatibility. */
export function textToAdf(text: string): AdfNode {
  return markdownToAdf(text);
}
