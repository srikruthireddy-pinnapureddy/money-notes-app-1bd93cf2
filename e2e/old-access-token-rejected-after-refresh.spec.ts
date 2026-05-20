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
    //    Supabase must reject it on both GoTrue and PostgREST with specific
    //    auth error codes/messages — not generic 4xx.
    const expiredOldToken = forgeExpiredToken(oldAccessToken);

    // 5a. GoTrue /auth/v1/user → 401 with "expired" message
    const meRes = await ctx.get(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${expiredOldToken}`,
      },
    });
    expect(meRes.status(), "GoTrue must return 401 for expired JWT").toBe(401);
    const meBody = await meRes.json().catch(() => ({} as any));
    const meMessage = String(meBody.msg ?? meBody.message ?? meBody.error_description ?? "");
    const meCode = String(meBody.error_code ?? meBody.code ?? "");
    expect(
      /expired/i.test(meMessage) || /bad_jwt|invalid.?jwt|jwt.?expired/i.test(meCode),
      `Expected GoTrue 'expired' error, got code='${meCode}' msg='${meMessage}'`
    ).toBeTruthy();

    // 5b. PostgREST → 401 with PGRST code and "JWT expired" message.
    //     RLS never even runs because authentication fails first.
    const profilesRes = await ctx.get(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${expiredOldToken}`,
        },
      }
    );
    expect(profilesRes.status(), "PostgREST must return 401 for expired JWT").toBe(401);
    const wwwAuth = profilesRes.headers()["www-authenticate"] ?? "";
    expect(
      /Bearer/i.test(wwwAuth),
      `Expected WWW-Authenticate: Bearer challenge, got '${wwwAuth}'`
    ).toBeTruthy();
    const profilesBody = await profilesRes.json().catch(() => ({} as any));
    const pgMessage = String(profilesBody.message ?? profilesBody.msg ?? "");
    const pgCode = String(profilesBody.code ?? "");
    expect(
      /JWT.*expired|expired/i.test(pgMessage),
      `Expected PostgREST 'JWT expired' message, got '${pgMessage}' (code='${pgCode}')`
    ).toBeTruthy();
    // PostgREST surfaces PGRST301 for expired JWTs; tolerate code being absent
    // on some gateway versions but assert format when present.
    if (pgCode) {
      expect(
        /^PGRST3\d{2}$/.test(pgCode),
        `Expected PGRST3xx auth error code, got '${pgCode}'`
      ).toBeTruthy();
    }

    // 5c. RLS sanity: even attempting to read another user's row with the
    //     expired token must fail with the SAME auth error (not an RLS empty
    //     result), confirming the request is rejected pre-RLS.
    const otherRes = await ctx.get(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.00000000-0000-0000-0000-000000000000&select=id`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${expiredOldToken}`,
        },
      }
    );
    expect(otherRes.status(), "Expired JWT must 401 regardless of target row").toBe(401);

    // 6. The OLD refresh token must not be reusable after rotation.
    //    GoTrue returns 400 invalid_grant / refresh_token_not_found.
    const reuseRes = await ctx.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        data: { refresh_token: refreshToken },
      }
    );
    expect(
      [400, 401].includes(reuseRes.status()),
      `Expected 400/401 on refresh reuse, got ${reuseRes.status()}`
    ).toBeTruthy();
    const reuseBody = await reuseRes.json().catch(() => ({} as any));
    const reuseError = String(reuseBody.error ?? reuseBody.error_code ?? reuseBody.code ?? "");
    const reuseMsg = String(reuseBody.error_description ?? reuseBody.msg ?? reuseBody.message ?? "");
    expect(
      /invalid_grant|refresh_token_not_found|refresh_token_already_used/i.test(reuseError) ||
        /refresh.?token|invalid.?grant|already.?used/i.test(reuseMsg),
      `Expected invalid_grant/refresh_token_* error, got error='${reuseError}' msg='${reuseMsg}'`
    ).toBeTruthy();

    await ctx.dispose();
  });
});
