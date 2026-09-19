export function appOrigin(): string | null {
  try {
    const url = new URL(process.env.APP_URL || "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function authConfigured() {
  return Boolean(
    process.env.ENABLE_GOOGLE_AUTH === "true" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      appOrigin(),
  );
}

// Server-only authentication: session tokens never enter client props.
export function authCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: appOrigin()?.startsWith("https:") ?? true,
  };
}
export const returnCookie = "osh-auth-return";

export function safeReturnPath(path: string | null) {
  if (!path || path.length > 2048) return "/account";
  try {
    let decoded = path;
    for (let i = 0; i < 4; i++) {
      if (
        !decoded.startsWith("/") ||
        decoded.startsWith("//") ||
        /[\\\u0000-\u0020\u007f]/.test(decoded)
      )
        return "/account";
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    const url = new URL(path, "https://return.invalid");
    if (
      url.origin !== "https://return.invalid" ||
      /^\/(auth|login)(\/|$)/.test(url.pathname)
    )
      return "/account";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/account";
  }
}
