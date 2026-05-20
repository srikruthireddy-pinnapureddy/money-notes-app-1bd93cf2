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

test.describe("Refresh-token flow → read profiles after access token expires", () => {
  test("rotates access token via refresh_token grant and reads profiles row", async () => {
    const ctx = await request.newContext();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `refresh_flow_${suffix}@example.com`;
    const password = "Test1234!";
    const displayName = `Refresh Tester ${suffix}`;

    // 1. Sign up
    const signupRes = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email, password, data: { display_name: displayName } },
    });
    const signupBody = await signupRes.json().catch(() => ({}));
    expect(
      signupRes.ok(),
      `Signup failed ${signupRes.status()}: ${JSON.stringify(signupBody)}`
    ).toBeTruthy();
    const userId: string = signupBody.id ?? signupBody.user?.id;
    expect(userId).toBeTruthy();

    // 2. Password-grant login to obtain initial tokens
    const loginRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { email, password },
      }
    );
    const loginBody = await loginRes.json().catch(() => ({}));
    expect(
      loginRes.ok(),
      `Login failed ${loginRes.status()}: ${JSON.stringify(loginBody)}`
    ).toBeTruthy();
    const initialAccessToken: string = loginBody.access_token;
    const refreshToken: string = loginBody.refresh_token;
    expect(initialAccessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    // 3. Forge an EXPIRED variant of the access token to simulate expiry.
    //    Use it against /auth/v1/user — Supabase must reject it.
    const payload = decodeJwtPayload(initialAccessToken);
    payload.exp = Math.floor(Date.now() / 1000) - 60; // 1 minute in the past
    const header = initialAccessToken.split(".")[0];
    const fakeExpired =
      header +
      "." +
      Buffer.from(JSON.stringify(payload))
        .toString("base64")
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_") +
      "." +
      initialAccessToken.split(".")[2];

    const expiredRes = await ctx.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${fakeExpired}`,
      },
    });
    expect(
      expiredRes.status(),
      "Expired token should not be accepted"
    ).toBeGreaterThanOrEqual(400);

    // 4. Exchange refresh token for a NEW access token
    const refreshRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { refresh_token: refreshToken },
      }
    );
    const refreshBody = await refreshRes.json().catch(() => ({}));
    expect(
      refreshRes.ok(),
      `Refresh failed ${refreshRes.status()}: ${JSON.stringify(refreshBody)}`
    ).toBeTruthy();
    const newAccessToken: string = refreshBody.access_token;
    const newRefreshToken: string = refreshBody.refresh_token;
    expect(newAccessToken, "Missing rotated access_token").toBeTruthy();
    expect(newRefreshToken, "Missing rotated refresh_token").toBeTruthy();
    expect(newAccessToken).not.toBe(initialAccessToken);
    expect(refreshBody.user?.id).toBe(userId);

    // 5. New access token works against /auth/v1/user
    const meRes = await ctx.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${newAccessToken}`,
      },
    });
    expect(meRes.ok(), `me failed ${meRes.status()}`).toBeTruthy();
    const meBody = await meRes.json();
    expect(meBody.id).toBe(userId);

    // 6. Use the new access token to read public.profiles (RLS-protected)
    let rows: any[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await ctx.get(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,display_name`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${newAccessToken}`,
          },
        }
      );
      expect(res.ok(), `Profiles query failed ${res.status()}`).toBeTruthy();
      rows = await res.json();
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(rows.length, "Refreshed session could not read profiles row").toBe(1);
    expect(rows[0].id).toBe(userId);
    expect(rows[0].display_name).toBe(displayName);

    await ctx.dispose();
  });
});
