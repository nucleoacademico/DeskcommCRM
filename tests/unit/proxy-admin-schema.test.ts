import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClient, rpc } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-publishable-key",
    NEXT_PUBLIC_SUPABASE_DB_SCHEMA: "crm_comm",
    NEXT_PUBLIC_APP_URL: "https://crm.example.com",
  },
}));
vi.mock("@/lib/supabase/cookie-secure", () => ({ cookieSecure: () => true }));
vi.mock("@/lib/auth/public-paths", () => ({ isPublicPath: () => false }));

describe("proxy /admin", () => {
  it("consulta a RPC no schema do CRM e deixa passar o platform admin", async () => {
    createServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) },
      rpc,
    });
    rpc.mockResolvedValueOnce({ data: true, error: null });

    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("https://crm.example.com/admin"));

    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-publishable-key",
      expect.objectContaining({ db: { schema: "crm_comm" } }),
    );
    expect(rpc).toHaveBeenCalledWith("fn_is_platform_admin");
    expect(response.status).toBe(200);
  });

  it("continua negando o usuário sem permissão de plataforma", async () => {
    createServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: "regular" } } }) },
      rpc,
    });
    rpc.mockResolvedValueOnce({ data: false, error: null });

    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("https://crm.example.com/admin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://crm.example.com/admin/forbidden");
  });
});
