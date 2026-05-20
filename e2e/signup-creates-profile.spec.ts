import { test, expect, request } from "@playwright/test";

const SUPABASE_URL = "https://mrnjywxdrlplpphdjyvf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybmp5d3hkcmxwbHBwaGRqeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MTU5ODIsImV4cCI6MjA4MDk5MTk4Mn0.BquD1xDVoOxd8_HHXGYNyXy3FldGg_Kzm8wNWdyMOX8";

test.describe("Signup creates profile", () => {
  test("a profiles row is created for the new user", async () => {
    const ctx = await request.newContext();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `signup_profile_${suffix}@example.com`;
    const password = "Test1234!";
    const displayName = `Tester ${suffix}`;

    // 1. Sign up
    const signupRes = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      data: {
        email,
        password,
        data: { display_name: displayName },
      },
    });
    const signupBody = await signupRes.json().catch(() => ({}));
    expect(
      signupRes.ok(),
      `Signup failed ${signupRes.status()}: ${JSON.stringify(signupBody)}`
    ).toBeTruthy();
    expect(signupBody).toHaveProperty("id");
    const userId: string = signupBody.id;

    // 2. Sign in to get an access token (needed for RLS on profiles SELECT)
    const tokenRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        data: { email, password },
      }
    );
    const tokenBody = await tokenRes.json().catch(() => ({}));
    expect(
      tokenRes.ok(),
      `Sign-in failed ${tokenRes.status()}: ${JSON.stringify(tokenBody)}`
    ).toBeTruthy();
    const accessToken: string = tokenBody.access_token;
    expect(accessToken).toBeTruthy();

    // 3. Query public.profiles for the new user id (retry briefly for trigger)
    let profile: any = null;
    for (let i = 0; i < 5; i++) {
      const profRes = await ctx.get(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,display_name`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      expect(profRes.ok(), `Profiles query failed ${profRes.status()}`).toBeTruthy();
      const rows = await profRes.json();
      if (Array.isArray(rows) && rows.length > 0) {
        profile = rows[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(profile, "Expected a profiles row for the new user").toBeTruthy();
    expect(profile.id).toBe(userId);
    expect(profile.display_name).toBe(displayName);

    await ctx.dispose();
  });
});
