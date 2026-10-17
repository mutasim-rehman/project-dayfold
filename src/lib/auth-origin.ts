const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Use one cookie host for OAuth. Next's internal request URL can normalize 127.0.0.1 to localhost. */
export function incomingOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) {
    try {
      const actual = new URL(`${url.protocol}//${host}`);
      if (loopback.has(actual.hostname) && loopback.has(url.hostname) && !actual.username && !actual.password) return actual.origin;
    } catch { /* Ignore malformed host headers. */ }
  }
  return url.origin;
}

export function authOrigin(request: Request, configured?: string) {
  const incoming = new URL(incomingOrigin(request));
  if (configured) {
    const canonical = new URL(configured);
    if (canonical.username || canonical.password || canonical.search || canonical.hash || !["http:", "https:"].includes(canonical.protocol)) throw new Error("Invalid application origin");
    if (!loopback.has(canonical.hostname) && canonical.protocol !== "https:") throw new Error("HTTPS is required");
    // Local tests/development must never send a verifier to a production host.
    if (loopback.has(incoming.hostname) && !loopback.has(canonical.hostname)) return `http://localhost${incoming.port ? `:${incoming.port}` : ""}`;
    if (!loopback.has(incoming.hostname) && loopback.has(canonical.hostname)) throw new Error("Set APP_URL to the deployed HTTPS origin");
    return canonical.origin;
  }
  if (loopback.has(incoming.hostname)) return `${incoming.protocol}//localhost${incoming.port ? `:${incoming.port}` : ""}`;
  return incoming.origin;
}

export function authFailureCode(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["flow_state_not_found", "bad_code_verifier", "validation_failed", "flow_state_expired"].includes(code)) return "verification";
  if (code === "provider_disabled") return "provider";
  return "exchange";
}

export function authErrorMessage(code:string) {
  switch(code){
    case "verification": return "Your sign-in verification expired or its browser cookie was missing. Start sign-in again from this tab; keep using the same browser and hostname.";
    case "denied": return "Google sign-in was canceled or denied. You can try again when you're ready.";
    case "missing_code": return "The sign-in callback did not include a verification code. Please check that this app's /auth/callback URL is allowed in Supabase, then start sign-in again.";
    case "provider": return "Google sign-in could not start. Please check that the Google provider is enabled for this Supabase project.";
    case "configuration": return "Sign-in is not configured for this address. Check APP_URL and the server's Supabase configuration.";
    default:return "The sign-in session could not be completed. Start Google sign-in again from this tab. If it repeats, check the app callback URL in Supabase.";
  }
}
