export function internalCopdEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.COPD_INTERNAL_PREVIEW === "true" &&
    (process.env.COPD_API_TOKEN?.length ?? 0) >= 32
  );
}

export function copdRequestAllowed(
  url: string,
  origin: string | null,
  method: string,
) {
  const parsed = new URL(url);
  return (
    internalCopdEnabled() &&
    ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
    (method === "GET"
      ? !origin || origin === parsed.origin
      : origin === parsed.origin)
  );
}
