import { describe, expect, it, vi } from "vitest";
import { localDatabaseUrl, shimIdentityFromUser } from "@/lib/auth-shim";

/**
 * The shim row is what the panel reads a confirmed address and a join date from, so a
 * field the app cannot infer must stay empty rather than be invented — and no script
 * may write `auth.users` anywhere but a loopback database.
 */

const NOW = new Date("2026-11-24T12:00:00.000Z");

describe("shimIdentityFromUser", () => {
  it("copies the hosted identity and normalises the address", () => {
    expect(
      shimIdentityFromUser(
        {
          id: "15d0af54-d2bd-4b03-8bc8-c8a398154774",
          email: "  Kuddus@Example.test ",
          user_metadata: { business_name: "ABC" },
          email_confirmed_at: "2026-11-24T15:34:18.499Z",
          created_at: "2026-11-24T10:14:30.775Z",
        },
        NOW,
      ),
    ).toEqual({
      id: "15d0af54-d2bd-4b03-8bc8-c8a398154774",
      email: "kuddus@example.test",
      emailConfirmedAt: new Date("2026-11-24T15:34:18.499Z"),
      createdAt: new Date("2026-11-24T10:14:30.775Z"),
      metadata: { business_name: "ABC" },
    });
  });

  it("leaves confirmation null when Supabase did not report it", () => {
    const identity = shimIdentityFromUser(
      { id: "a04f44fe-5897-4518-a7fe-69cc0feb5fd1", email: "a@b.test" },
      NOW,
    );
    expect(identity?.emailConfirmedAt).toBeNull();
    expect(identity?.metadata).toEqual({});
  });

  it("falls back to now only when the join date is missing or unparseable", () => {
    for (const created_at of [undefined, null, "", "not a date"]) {
      expect(
        shimIdentityFromUser(
          {
            id: "a04f44fe-5897-4518-a7fe-69cc0feb5fd1",
            email: "a@b.test",
            created_at,
          },
          NOW,
        )?.createdAt,
      ).toEqual(NOW);
    }
  });

  it("refuses an account without an address, because email is not nullable", () => {
    expect(
      shimIdentityFromUser({ id: "a04f44fe-5897-4518-a7fe-69cc0feb5fd1" }),
    ).toBeNull();
    expect(
      shimIdentityFromUser({
        id: "a04f44fe-5897-4518-a7fe-69cc0feb5fd1",
        email: "   ",
      }),
    ).toBeNull();
  });
});

describe("localDatabaseUrl", () => {
  it("refuses a database that is not loopback", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://owner:secret@db.abcdefgh.supabase.co:5432/postgres",
    );
    expect(() => localDatabaseUrl()).toThrow(/outside the local database/);
    vi.unstubAllEnvs();
  });

  it("accepts the compose database", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres:postgres@127.0.0.1:4432/inventory",
    );
    expect(localDatabaseUrl()).toBe(
      "postgresql://postgres:postgres@127.0.0.1:4432/inventory",
    );
    vi.unstubAllEnvs();
  });
});
