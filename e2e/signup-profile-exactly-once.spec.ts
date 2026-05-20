import { test, expect, request } from "@playwright/test";

const SUPABASE_URL = "https://mrnjywxdrlplpphdjyvf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybmp5d3hkcmxwbHBwaGRqeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MTU5ODIsImV4cCI6MjA4MDk5MTk4Mn0.BquD1xDVoOxd8_HHXGYNyXy3FldGg_Kzm8wNWdyMOX8";

test.describe("Signup creates exactly one profile", () => {
  test("public.profiles has exactly one row with correct id and display_name", async () => {
    const ctx = await request.newContext();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `signup_once_${suffix}@example.com`;
    const password = "Test1234!";
    const displayName = `Once Tester ${suffix}`;

    // Sign up
    const signupRes = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email, password, data: { display_name: displayName } },
    });
    const signupBody = await signupRes.json().catch(() => ({}));
    expect(
      signupRes.ok(),
      `Signup failed ${signupRes.status()}: ${JSON.stringify(signupBody)}`
    ).toBeTruthy();
    const userId: string = signupBody.id;
    expect(userId).toBeTruthy();

    // Sign in for RLS-authorized SELECT
    const tokenRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { email, password },
      }
    );
    const tokenBody = await tokenRes.json().catch(() => ({}));
    expect(tokenRes.ok(), `Sign-in failed: ${JSON.stringify(tokenBody)}`).toBeTruthy();
    const accessToken: string = tokenBody.access_token;

    // Wait briefly for trigger, then fetch all rows for this user id
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

    // Exactly one row
    expect(rows.length, `Expected exactly 1 profile row, got ${rows.length}`).toBe(1);

    // Exact field values
    expect(rows[0].id).toBe(userId);
    expect(rows[0].display_name).toBe(displayName);

    // Verify count via HEAD + Prefer: count=exact for an independent check
    const countRes = await ctx.fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id`,
      {
        method: "HEAD",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          Prefer: "count=exact",
        },
      }
    );
    const contentRange = countRes.headers()["content-range"];
    expect(contentRange, "Missing Content-Range header").toBeTruthy();
    const total = contentRange?.split("/")[1];
    expect(total).toBe("1");

    await ctx.dispose();
  });
});
