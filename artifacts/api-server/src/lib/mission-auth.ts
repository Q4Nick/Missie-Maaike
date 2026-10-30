import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "maaike_missie";
const SESSION_SECONDS = 10 * 60 * 60;

export type MissionIdentity =
  | { role: "agent"; agentId: string }
  | { role: "admin"; agentId: null };

type SessionPayload = MissionIdentity & { expiresAt: number };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET must be configured");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function setMissionSession(res: Response, identity: MissionIdentity): void {
  const payload = Buffer.from(
    JSON.stringify({ ...identity, expiresAt: Date.now() + SESSION_SECONDS * 1000 }),
  ).toString("base64url");
  const token = `${payload}.${signature(payload)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/api/missie; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`,
  );
}

export function clearMissionSession(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/api/missie; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

export function getMissionIdentity(req: Request): MissionIdentity | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;

  const token = cookie.slice(COOKIE_NAME.length + 1);
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    if (parsed.role === "admin" && parsed.agentId === null) {
      return { role: "admin", agentId: null };
    }
    if (parsed.role === "agent" && typeof parsed.agentId === "string") {
      return { role: "agent", agentId: parsed.agentId };
    }
    return null;
  } catch {
    return null;
  }
}

export function isSameSecret(candidate: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return (
    candidateBytes.length === expectedBytes.length &&
    timingSafeEqual(candidateBytes, expectedBytes)
  );
}
