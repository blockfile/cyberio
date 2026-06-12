const LOCAL_API_BASE = "http://localhost:3001";
const PROD_HOSTS = new Set(["cyberio.fun", "www.cyberio.fun", "dapp.cyberio.io"]);

function isLocalBrowser() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function resolveEndpoint(value, fallback = LOCAL_API_BASE) {
  const configured = cleanUrl(value);

  if (isLocalBrowser()) {
    if (!configured) return fallback;

    try {
      if (PROD_HOSTS.has(new URL(configured).hostname)) {
        return fallback;
      }
    } catch {
      return fallback;
    }
  }

  return configured || fallback;
}

export const API_BASE_URL = resolveEndpoint(
  process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_SOCKET_URL,
  LOCAL_API_BASE
);

export const SOCKET_URL = resolveEndpoint(
  process.env.REACT_APP_SOCKET_URL ||
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE,
  LOCAL_API_BASE
);
