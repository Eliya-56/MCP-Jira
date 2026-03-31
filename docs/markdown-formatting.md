# Markdown Formatting for Jira

The Jira MCP server converts Markdown to Atlassian Document Format (ADF) when creating issues (`create_task`) and adding comments (`add_comment`, `attach_file` with comment).

## Supported Syntax

### Headings

```
# Heading 1
## Heading 2
### Heading 3
```

### Text Formatting

```
**bold text**
*italic text*
`inline code`
```

### Links

```
[Link text](https://example.com)
```

### Bullet List

```
- First item
- Second item
- Third item
```

Also supported with `*` or `+`:

```
* Item one
* Item two
```

### Ordered List

```
1. First step
2. Second step
3. Third step
```

### Code Block

````
```sql
SELECT * FROM users WHERE active = 1
```
````

Language tag (e.g. `sql`, `typescript`, `json`) is optional but recommended — Jira renders syntax highlighting when provided.

### Blockquote

```
> This is a quoted paragraph.
> It can span multiple lines.
```

### Horizontal Rule

```
---
```

Also `***` or `___`.

## Full Example

Input:

```
# Bug Report

**Component:** Payment Service
*Priority:* High

The checkout flow fails when the cart contains items with `null` prices.

## Steps to Reproduce

1. Add an item with no price to the cart
2. Click **Checkout**
3. Observe the error

## Expected Behavior

> The system should reject items without a valid price
> at the point of adding them to the cart.

## Workaround

- Manually set a price of `0.00` before adding
- Or remove the item and re-add after fixing

## Related

See [PROJ-100](https://jira.example.com/browse/PROJ-100) for the original report.

---

```sql
SELECT * FROM cart_items WHERE price IS NULL
```
```

## Limitations

- **No nested formatting**: `***bold+italic***` is not supported; use `**bold**` and `*italic*` separately.
- **No nested lists**: Sub-lists are not parsed; keep lists flat.
- **No images**: Use the `attach_file` tool to add images.
- **No tables**: Jira ADF supports tables, but the Markdown parser does not convert them.
- Plain `*` in math expressions (e.g. `2 * 3`) may be interpreted as italic if the surrounding text matches the `*text*` pattern. Wrap in backticks to avoid: `` `2 * 3` ``.
