import { test, expect, request } from "@playwright/test";

const SUPABASE_URL = "https://mrnjywxdrlplpphdjyvf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybmp5d3hkcmxwbHBwaGRqeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MTU5ODIsImV4cCI6MjA4MDk5MTk4Mn0.BquD1xDVoOxd8_HHXGYNyXy3FldGg_Kzm8wNWdyMOX8";

test.describe("Signup → token login → session reads profile", () => {
  test("signs up, logs in via password grant, and reads own profiles row", async () => {
    const ctx = await request.newContext();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `signup_token_${suffix}@example.com`;
    const password = "Test1234!";
    const displayName = `Token Tester ${suffix}`;

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
    expect(userId, "Signup response missing user id").toBeTruthy();

    // 2. Token login (password grant) returns a working access token
    const tokenRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { email, password },
      }
    );
    const tokenBody = await tokenRes.json().catch(() => ({}));
    expect(
      tokenRes.ok(),
      `Token login failed ${tokenRes.status()}: ${JSON.stringify(tokenBody)}`
    ).toBeTruthy();
    const accessToken: string = tokenBody.access_token;
    const refreshToken: string = tokenBody.refresh_token;
    expect(accessToken, "Missing access_token from token endpoint").toBeTruthy();
    expect(refreshToken, "Missing refresh_token from token endpoint").toBeTruthy();
    expect(tokenBody.user?.id).toBe(userId);

    // 3. Verify the token is a valid session — /auth/v1/user returns the same user
    const meRes = await ctx.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const meBody = await meRes.json().catch(() => ({}));
    expect(
      meRes.ok(),
      `auth/v1/user failed ${meRes.status()}: ${JSON.stringify(meBody)}`
    ).toBeTruthy();
    expect(meBody.id).toBe(userId);
    expect(meBody.email).toBe(email);

    // 4. Use the session to read public.profiles (RLS-protected)
    let rows: any[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await ctx.get(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,display_name`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      expect(res.ok(), `Profiles query failed ${res.status()}`).toBeTruthy();
      rows = await res.json();
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(rows.length, "Session could not read own profiles row").toBe(1);
    expect(rows[0].id).toBe(userId);
    expect(rows[0].display_name).toBe(displayName);

    await ctx.dispose();
  });
});
