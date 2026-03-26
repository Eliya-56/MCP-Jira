export class JiraClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly statusText: string,
    public readonly method: string,
    public readonly path: string,
    public readonly responseBody: unknown | null,
  ) {
    super(message);
    this.name = "JiraClientError";
  }
}

export class JiraClient {
  private readonly authHeader: string;
  private readonly apiBase: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.apiBase = `${baseUrl}/rest/api/3`;
    this.authHeader =
      "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
  }

  async get<T = unknown>(path: string): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });

    return this.handleResponse<T>(response, "GET", path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return this.handleResponse<T>(response, "POST", path);
  }

  async postFormData<T = unknown>(path: string, formData: FormData): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "X-Atlassian-Token": "no-check",
      },
      body: formData,
    });

    return this.handleResponse<T>(response, "POST", path);
  }

  private async handleResponse<T>(
    response: Response,
    method: string,
    path: string,
  ): Promise<T> {
    if (response.ok) {
      const text = await response.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    }

    let responseBody: unknown | null = null;
    let detail = "";
    try {
      responseBody = await response.json();
      const messages =
        (responseBody as Record<string, unknown>)?.errorMessages
          ? ((responseBody as Record<string, string[]>).errorMessages).join("; ")
          : JSON.stringify((responseBody as Record<string, unknown>)?.errors) || "";
      if (messages) detail = `: ${messages}`;
    } catch {
      // no parseable body
    }

    const statusMessages: Record<number, string> = {
      401: "Authentication failed — check JIRA_EMAIL and JIRA_API_TOKEN",
      403: "Permission denied for this resource",
      404: "Resource not found",
      429: "Rate limited by Jira — try again later",
    };

    const prefix =
      statusMessages[response.status] ??
      `Jira API error (${response.status} ${response.statusText})`;

    throw new JiraClientError(
      `${prefix}${detail} [${method} ${path}]`,
      response.status,
      response.statusText,
      method,
      path,
      responseBody,
    );
  }
}
