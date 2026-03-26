import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
dotenv.config({ path: resolve(currentDirPath, "../.env") });
dotenv.config();

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export function getJiraConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("JIRA_BASE_URL is required. Set it in .env or as an environment variable.");
  }

  const email = process.env.JIRA_EMAIL;
  if (!email) {
    throw new Error("JIRA_EMAIL is required. Set it in .env or as an environment variable.");
  }

  const apiToken = process.env.JIRA_API_TOKEN;
  if (!apiToken) {
    throw new Error("JIRA_API_TOKEN is required. Set it in .env or as an environment variable.");
  }

  return { baseUrl, email, apiToken };
}
