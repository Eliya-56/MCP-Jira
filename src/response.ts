export interface McpToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function successResponse(
  data: unknown,
  message: string | null = null,
): McpToolResponse {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ isSuccess: true, message, data }),
      },
    ],
  };
}

export function errorResponse(message: string): McpToolResponse {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ isSuccess: false, message, data: null }),
      },
    ],
  };
}
