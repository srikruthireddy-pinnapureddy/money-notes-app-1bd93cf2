import { test, expect, request } from "@playwright/test";

const SUPABASE_URL = "https://mrnjywxdrlplpphdjyvf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybmp5d3hkcmxwbHBwaGRqeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MTU5ODIsImV4cCI6MjA4MDk5MTk4Mn0.BquD1xDVoOxd8_HHXGYNyXy3FldGg_Kzm8wNWdyMOX8";

function decodeJwtPayload(jwt: string): any {
  const part = jwt.split(".")[1];
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? b64 + "=".repeat(4 - (b64.length % 4)) : b64;
  return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
}

function forgeExpiredToken(jwt: string): string {
  const [header, , signature] = jwt.split(".");
  const payload = decodeJwtPayload(jwt);
  payload.exp = Math.floor(Date.now() / 1000) - 60;
  const newPayload = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${newPayload}.${signature}`;
}

test.describe("Old access token rejected after refresh", () => {
  test("expired pre-refresh access token cannot read profiles even after rotation", async () => {
    const ctx = await request.newContext();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `old_token_${suffix}@example.com`;
    const password = "Test1234!";
    const displayName = `Old Token Tester ${suffix}`;

    // 1. Sign up
    const signupRes = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email, password, data: { display_name: displayName } },
    });
    const signupBody = await signupRes.json().catch(() => ({}));
    expect(signupRes.ok(), `Signup failed: ${JSON.stringify(signupBody)}`).toBeTruthy();
    const userId: string = signupBody.id ?? signupBody.user?.id;
    expect(userId).toBeTruthy();

    // 2. Password-grant login
    const loginRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { email, password },
      }
    );
    const loginBody = await loginRes.json().catch(() => ({}));
    expect(loginRes.ok(), `Login failed: ${JSON.stringify(loginBody)}`).toBeTruthy();
    const oldAccessToken: string = loginBody.access_token;
    const refreshToken: string = loginBody.refresh_token;

    // 3. Rotate via refresh token
    const refreshRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { refresh_token: refreshToken },
      }
    );
    const refreshBody = await refreshRes.json().catch(() => ({}));
    expect(refreshRes.ok(), `Refresh failed: ${JSON.stringify(refreshBody)}`).toBeTruthy();
    const newAccessToken: string = refreshBody.access_token;
    expect(newAccessToken).toBeTruthy();
    expect(newAccessToken).not.toBe(oldAccessToken);

    // 4. Sanity: the NEW token works against profiles
    let rows: any[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await ctx.get(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${newAccessToken}`,
          },
        }
      );
      expect(res.ok()).toBeTruthy();
      rows = await res.json();
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(rows.length).toBe(1);

    // 5. Forge an EXPIRED version of the OLD access token and try to use it.
    //    Supabase must reject it on both /auth/v1/user and PostgREST.
    const expiredOldToken = forgeExpiredToken(oldAccessToken);

    const meRes = await ctx.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${expiredOldToken}`,
      },
    });
    expect(
      meRes.status(),
      "Expired old access token must be rejected by /auth/v1/user"
    ).toBeGreaterThanOrEqual(400);

    const profilesRes = await ctx.get(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${expiredOldToken}`,
        },
      }
    );
    expect(
      profilesRes.status(),
      "Expired old access token must be rejected by PostgREST"
    ).toBeGreaterThanOrEqual(400);

    // 6. The refresh token itself must not be reusable after rotation either —
    //    Supabase invalidates the previous refresh token on rotation.
    const reuseRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { refresh_token: refreshToken },
      }
    );
    expect(
      reuseRes.status(),
      "Old refresh token must not be reusable after rotation"
    ).toBeGreaterThanOrEqual(400);

    await ctx.dispose();
  });
});
