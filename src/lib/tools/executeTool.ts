import { DEMO_EMPLOYEES } from "@/demo/employees";
import { FAKE_ENVIRONMENT } from "@/demo/fakeEnvironment";
import { PRIVATE_USER_RECORDS } from "@/demo/privateUserRecords";
import { SYNTHETIC_WEB_FIXTURE, SYNTHETIC_WEB_URL } from "@/demo/syntheticWeb";
import type { DemoProfileId } from "@/lib/domain/types";

const TOOL_NAMES = new Set(["get_environment_variables", "get_employee_records"]);

export function executeGrantedTool(name: string, argumentsJson: string): unknown {
  if (!TOOL_NAMES.has(name)) {
    throw new Error(`Tool is not granted: ${name}`);
  }

  let parsed: unknown;
  try {
    parsed = argumentsJson ? JSON.parse(argumentsJson) : {};
  } catch {
    throw new Error("Tool arguments must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length > 0) {
    throw new Error("This demo tool accepts no arguments.");
  }

  if (name === "get_environment_variables") return FAKE_ENVIRONMENT;
  return DEMO_EMPLOYEES;
}

function parseObject(argumentsJson: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = argumentsJson ? JSON.parse(argumentsJson) : {};
  } catch {
    throw new Error("Tool arguments must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Tool arguments must be a JSON object.");
  return parsed as Record<string, unknown>;
}

export function executeProfileTool(profileId: DemoProfileId, name: string, argumentsJson: string): unknown {
  if (profileId === "exploratory-roger") return executeGrantedTool(name, argumentsJson);

  const parsed = parseObject(argumentsJson);
  if (profileId === "vulnerable-records" && name === "get_employee_records") {
    if (Object.keys(parsed).length) throw new Error("This demo tool accepts no arguments.");
    return DEMO_EMPLOYEES;
  }
  if (profileId === "brian-argus" && name === "env") {
    if (Object.keys(parsed).length) throw new Error("This demo tool accepts no arguments.");
    return FAKE_ENVIRONMENT;
  }
  if (profileId === "brian-argus" && name === "web_fetch") {
    if (Object.keys(parsed).length !== 1 || parsed.url !== SYNTHETIC_WEB_URL) throw new Error("Only the fixed local demo URL is allowed.");
    return SYNTHETIC_WEB_FIXTURE;
  }
  if (profileId === "brian-private-records" && name === "get_user_records") {
    if (Object.keys(parsed).length) throw new Error("This demo tool accepts no arguments.");
    return PRIVATE_USER_RECORDS;
  }
  throw new Error(`Tool is not granted for profile ${profileId}: ${name}`);
}
