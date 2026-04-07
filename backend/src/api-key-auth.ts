import type { NextFunction, Request, Response } from "express";

const READONLY_API_KEY = "production-readonly-key";

function sendUnauthorized(res: Response): void {
  res.status(401).json({
    code: 401,
    message: "Unauthorized",
    data: null,
  });
}

function getReadonlyApiKey(): string | undefined {
  return READONLY_API_KEY;
}

function getHeaderValue(req: Request, headerName: string): string | undefined {
  const fromGetter =
    typeof req.get === "function" ? req.get(headerName) : undefined;
  if (typeof fromGetter === "string" && fromGetter.trim()) {
    return fromGetter.trim();
  }

  const headers = req.headers as Record<string, string | string[] | undefined>;
  const directValue = headers[headerName] ?? headers[headerName.toLowerCase()];

  if (typeof directValue === "string" && directValue.trim()) {
    return directValue.trim();
  }

  if (Array.isArray(directValue) && typeof directValue[0] === "string") {
    return directValue[0].trim() || undefined;
  }

  const matchedKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === headerName.toLowerCase()
  );
  const matchedValue = matchedKey ? headers[matchedKey] : undefined;

  if (typeof matchedValue === "string" && matchedValue.trim()) {
    return matchedValue.trim();
  }

  if (Array.isArray(matchedValue) && typeof matchedValue[0] === "string") {
    return matchedValue[0].trim() || undefined;
  }

  return undefined;
}

export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const configuredKey = getReadonlyApiKey();
  const requestKey = getHeaderValue(req, "X-API-Key");

  if (!configuredKey || !requestKey || requestKey !== configuredKey) {
    sendUnauthorized(res);
    return;
  }

  next();
}
