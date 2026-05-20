import { test, expect, request } from "@playwright/test";

const SUPABASE_URL = "https://mrnjywxdrlplpphdjyvf.supabase.co";
const SUPABASE_PROJECT_REF = "mrnjywxdrlplpphdjyvf";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybmp5d3hkcmxwbHBwaGRqeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MTU5ODIsImV4cCI6MjA4MDk5MTk4Mn0.BquD1xDVoOxd8_HHXGYNyXy3FldGg_Kzm8wNWdyMOX8";
const STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

function decodeJwt(jwt: string): any {
  const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? b64 + "=".repeat(4 - (b64.length % 4)) : b64;
  return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
}

function forgeExpired(jwt: string): string {
  const [header, , signature] = jwt.split(".");
  const payload = decodeJwt(jwt);
  payload.exp = Math.floor(Date.now() / 1000) - 60;
  const newPayload = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${newPayload}.${signature}`;
}

test.describe("UI: login → token expiry → auto-refresh → profile data renders", () => {
  test("logs in, forces token expiry, app auto-refreshes, profile screen shows correct data", async ({
    page,
    context,
  }) => {
    // Pre-create a user via the Supabase API so login is deterministic.
    const api = await request.newContext();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `ui_refresh_${suffix}@example.com`;
    const password = "Test1234!";
    const displayName = `UI Refresh Tester ${suffix}`;

    const signupRes = await api.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email, password, data: { display_name: displayName } },
    });
    const signupBody = await signupRes.json().catch(() => ({}));
    expect(
      signupRes.ok(),
      `Signup failed ${signupRes.status()}: ${JSON.stringify(signupBody)}`
    ).toBeTruthy();
    await api.dispose();

    // Skip splash/onboarding to land directly on the auth/dashboard flow.
    await context.addInitScript(() => {
      localStorage.setItem("hasOnboarded", "true");
    });

    // 1. Log in via the UI
    await page.goto("/auth");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // 2. Wait until the Supabase client has persisted the session and we're on /dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForFunction(
      (key) => !!localStorage.getItem(key),
      STORAGE_KEY,
      { timeout: 10000 }
    );

    // Grab and verify the stored access token
    const originalSession = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) as string),
      STORAGE_KEY
    );
    expect(originalSession.access_token).toBeTruthy();
    expect(originalSession.refresh_token).toBeTruthy();
    const originalAccessToken = originalSession.access_token as string;

    // 3. Force token expiry: replace access_token with an expired JWT and mark
    //    expires_at in the past. The Supabase client will detect this on the
    //    next request and auto-refresh using the still-valid refresh_token.
    const expiredAccess = forgeExpired(originalAccessToken);
    await page.evaluate(
      ({ key, expired }) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const sess = JSON.parse(raw);
        sess.access_token = expired;
        sess.expires_at = Math.floor(Date.now() / 1000) - 60;
        sess.expires_in = 0;
        localStorage.setItem(key, JSON.stringify(sess));
      },
      { key: STORAGE_KEY, expired: expiredAccess }
    );

    // 4. Navigate to Settings — this triggers profile fetch from `profiles`.
    //    The auth client should auto-refresh before the request goes out.
    await page.goto("/settings");

    // 5. Verify profile data renders with the correct display_name
    const nameInput = page.locator("#displayName");
    await expect(nameInput).toBeVisible({ timeout: 15000 });
    await expect(nameInput).toHaveValue(displayName, { timeout: 15000 });
    await expect(page.getByText(displayName).first()).toBeVisible();

    // 6. Confirm the session was rotated (access token changed) and not expired
    const refreshedSession = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) as string),
      STORAGE_KEY
    );
    expect(refreshedSession.access_token).toBeTruthy();
    expect(refreshedSession.access_token).not.toBe(expiredAccess);
    expect(refreshedSession.access_token).not.toBe(originalAccessToken);
    expect(refreshedSession.expires_at).toBeGreaterThan(
      Math.floor(Date.now() / 1000)
    );
  });
});
