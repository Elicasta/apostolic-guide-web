import "server-only";
import { createPrivateKey, sign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const SEARCH_ANALYTICS_URL = "https://www.googleapis.com/webmasters/v3/sites";
const REQUEST_TIMEOUT_MS = 12_000;

type SearchAnalyticsApiRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchAnalyticsApiResponse = {
  rows?: SearchAnalyticsApiRow[];
};

export type SearchConsoleRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsolePeriod = {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  rows: SearchConsoleRow[];
};

export type SearchConsoleSnapshot = {
  configured: boolean;
  siteUrl: string | null;
  current: SearchConsolePeriod | null;
  previous: SearchConsolePeriod | null;
  error: string | null;
};

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function completeSearchConsoleWindows(now = new Date()) {
  // Search Console reporting is not real time. End two full days ago so the dashboard
  // compares complete data instead of interpreting Google's normal reporting delay as a decline.
  const currentEnd = new Date(now);
  currentEnd.setUTCDate(currentEnd.getUTCDate() - 2);
  const currentStart = new Date(currentEnd);
  currentStart.setUTCDate(currentStart.getUTCDate() - 6);
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - 6);
  return {
    current: { startDate: isoDate(currentStart), endDate: isoDate(currentEnd) },
    previous: { startDate: isoDate(previousStart), endDate: isoDate(previousEnd) }
  };
}

function serviceAccountConfig() {
  const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() ?? "";
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "";
  if (!siteUrl || !email || !privateKey) return null;
  return { siteUrl, email, privateKey };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(email: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: SEARCH_CONSOLE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claims}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), createPrivateKey(privateKey));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `Google token request failed (${response.status}).`);
  }
  return payload.access_token;
}

function summarizePeriod(startDate: string, endDate: string, rows: SearchConsoleRow[]): SearchConsolePeriod {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition = rows.reduce((sum, row) => sum + row.position * row.impressions, 0);
  return {
    startDate,
    endDate,
    clicks,
    impressions,
    ctr: impressions ? Number(((clicks / impressions) * 100).toFixed(1)) : 0,
    position: impressions ? Number((weightedPosition / impressions).toFixed(1)) : 0,
    rows
  };
}

async function queryPeriod(token: string, siteUrl: string, startDate: string, endDate: string) {
  const url = `${SEARCH_ANALYTICS_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: 500,
      dataState: "final"
    })
  });
  const payload = await response.json().catch(() => ({})) as SearchAnalyticsApiResponse & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Search Console request failed (${response.status}).`);
  const rows = (payload.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "",
    page: row.keys?.[1] ?? "",
    clicks: Math.round(Number(row.clicks ?? 0)),
    impressions: Math.round(Number(row.impressions ?? 0)),
    ctr: Number(((row.ctr ?? 0) * 100).toFixed(1)),
    position: Number(Number(row.position ?? 0).toFixed(1))
  })).filter((row) => row.query || row.page);
  return summarizePeriod(startDate, endDate, rows);
}

export function searchConsoleConfigured() {
  return Boolean(serviceAccountConfig());
}

export async function getSearchConsoleSnapshot(): Promise<SearchConsoleSnapshot> {
  const config = serviceAccountConfig();
  if (!config) return { configured: false, siteUrl: null, current: null, previous: null, error: null };
  try {
    const token = await accessToken(config.email, config.privateKey);
    const windows = completeSearchConsoleWindows();
    const [current, previous] = await Promise.all([
      queryPeriod(token, config.siteUrl, windows.current.startDate, windows.current.endDate),
      queryPeriod(token, config.siteUrl, windows.previous.startDate, windows.previous.endDate)
    ]);
    return { configured: true, siteUrl: config.siteUrl, current, previous, error: null };
  } catch (error) {
    return {
      configured: true,
      siteUrl: config.siteUrl,
      current: null,
      previous: null,
      error: error instanceof Error ? error.message : "Search Console is temporarily unavailable."
    };
  }
}

export function searchConsoleOpportunities(snapshot: SearchConsoleSnapshot) {
  const current = snapshot.current;
  if (!current) return [];
  return current.rows
    .filter((row) => row.impressions >= 25)
    .map((row) => {
      if (row.position >= 4 && row.position <= 15) return { kind: "ranking" as const, ...row, reason: "Already visible on Google and close enough to improve materially." };
      if (row.position <= 5 && row.ctr < 2.5) return { kind: "ctr" as const, ...row, reason: "Strong position with a low click-through rate. Title or search snippet may be leaving clicks behind." };
      return null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8);
}
