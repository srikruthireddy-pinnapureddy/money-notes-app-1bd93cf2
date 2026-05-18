import { test, expect, request } from "@playwright/test";

const SUPABASE_URL = "https://mrnjywxdrlplpphdjyvf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybmp5d3hkcmxwbHBwaGRqeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MTU5ODIsImV4cCI6MjA4MDk5MTk4Mn0.BquD1xDVoOxd8_HHXGYNyXy3FldGg_Kzm8wNWdyMOX8";

test.describe("Weak password signup", () => {
  test("backend accepts signup with a 1-character password", async () => {
    const ctx = await request.newContext();
    const email = `weakpw_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
    const password = "a"; // 1 character

    const res = await ctx.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      data: { email, password },
    });

    const body = await res.json().catch(() => ({}));
    expect(
      res.ok(),
      `Signup should succeed but got ${res.status()}: ${JSON.stringify(body)}`
    ).toBeTruthy();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("email", email);

    await ctx.dispose();
  });
});
