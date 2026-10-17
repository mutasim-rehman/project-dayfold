import { describe, expect, it } from "vitest";
import { ADMIN_SESSION_SECONDS, createAdminSession, verifyAdminCredentials, verifyAdminSession } from "@/lib/admin-session";

const env = { Admin_Panel_Name: "Dayfold Ops", Admin_Panel_Pass: "a-long-test-only-secret" };

describe("admin panel session", () => {
  it("accepts only the configured credentials without exposing their values", () => {
    expect(verifyAdminCredentials("Dayfold Ops", env.Admin_Panel_Pass, env)).toBe(true);
    expect(verifyAdminCredentials("dayfold ops", env.Admin_Panel_Pass, env)).toBe(false);
    expect(verifyAdminCredentials(env.Admin_Panel_Name, "wrong", env)).toBe(false);
    expect(verifyAdminCredentials(env.Admin_Panel_Name, env.Admin_Panel_Pass, {})).toBe(false);
  });

  it("signs, verifies, expires, and rejects tampered sessions", () => {
    const now = Date.UTC(2026, 9, 17, 12);
    const token = createAdminSession(now, env);
    expect(verifyAdminSession(token, now, env)).toBe(true);
    expect(verifyAdminSession(token, now + (ADMIN_SESSION_SECONDS + 1) * 1000, env)).toBe(false);
    expect(verifyAdminSession(`${token.slice(0, -1)}x`, now, env)).toBe(false);
    expect(verifyAdminSession(token, now, { ...env, Admin_Panel_Pass: "another-secret" })).toBe(false);
  });
});
