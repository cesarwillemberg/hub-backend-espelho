import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { env } from "../config/env";
import { toSnakeCaseKeys, toCamelCaseKeys } from "../utils/caseConverter";

type RegisterBody = {
  marketName: string;
  slug?: string;
  documentNumber: string;
  contactEmail: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
};

type LoginBody = {
  email: string;
  password: string;
};

type SelectTenantBody = {
  selectionToken: string;
  tenantId: string;
};

type SwitchTenantBody = {
  tenantId: string;
};

type RefreshBody = {
  refreshToken?: string;
};

const authRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.post("/register", async (request, reply) => {
    const body = request.body as RegisterBody;
    const client = createCoreApiClient();

    try {
      const coreResponse = await client.post("/api/hub/auth/register", toSnakeCaseKeys(body));
      const data = toCamelCaseKeys(coreResponse.data) as {
        tenant: { slug: string };
        owner?: { id: string; name: string; email: string; roles: string[] };
        tokens: { accessToken: string; refreshToken: string };
      };

      setRefreshTokenCookie(reply, data.tokens.refreshToken);

      return reply.send({
        user: {
          id: data.owner?.id ?? null,
          name: data.owner?.name ?? null,
          email: data.owner?.email ?? null,
          roles: data.owner?.roles ?? [],
        },
        tenant: data.tenant,
        accessToken: data.tokens.accessToken,
      });
    } catch (err: any) {
      fastify.log.error({ err }, "Register failed");
      return handleCoreApiError(reply, err);
    }
  });

  fastify.post("/login", async (request, reply) => {
    const body = request.body as LoginBody;
    const client = createCoreApiClient();

    try {
      const coreResponse = await client.post("/api/hub/auth/login", toSnakeCaseKeys(body), {
        headers: {
          "X-Tenant-Slug": request.tenantSlug ?? undefined,
        },
      });
      const data = toCamelCaseKeys(coreResponse.data) as {
        status?: string;
        selectionToken?: string;
        user?: { id: string; name: string; email: string; roles: { id: string; name: string }[]; permissions: string[] };
        tenant?: { id: string; marketName: string; slug: string; status: string };
        tenants?: { id: string; marketName: string; slug: string }[];
        tokens: { accessToken: string; refreshToken: string };
        owner?: { id: string; name: string; email: string; roles: string[] };
      };

      if (data.status === "TENANT_SELECTION_REQUIRED") {
        return reply.send({
          status: "TENANT_SELECTION_REQUIRED",
          selectionToken: data.selectionToken,
          user: data.user,
          tenants: (data.tenants ?? []).map((tenant) => ({
            id: tenant.id,
            marketName: tenant.marketName,
            tenantSlug: tenant.slug,
            activeTenant: false,
            roles: [] as string[],
          })),
        });
      }

      setRefreshTokenCookie(reply, data.tokens.refreshToken);

      return reply.send({
        user: data.user,
        tenant: data.tenant,
        accessToken: data.tokens.accessToken,
      });
    } catch (err: any) {
      return handleCoreApiError(reply, err);
    }
  });

  fastify.post("/select-tenant", async (request, reply) => {
    const body = request.body as SelectTenantBody;
    const client = createCoreApiClient();

    try {
      const coreResponse = await client.post("/api/hub/auth/select-tenant", toSnakeCaseKeys(body));
      const data = toCamelCaseKeys(coreResponse.data) as {
        user: { id: string; name: string; email: string };
        tenant: { id: string; marketName: string; slug: string; status: string };
        tokens: { accessToken: string; refreshToken: string };
      };

      setRefreshTokenCookie(reply, data.tokens.refreshToken);

      return reply.send({
        user: data.user,
        tenant: data.tenant,
        accessToken: data.tokens.accessToken,
      });
    } catch (err: any) {
      return handleCoreApiError(reply, err);
    }
  });

  fastify.post("/switch-tenant", async (request, reply) => {
    const body = request.body as SwitchTenantBody;
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreResponse = await client.post("/api/hub/auth/switch-tenant", toSnakeCaseKeys(body));
      const data = toCamelCaseKeys(coreResponse.data) as {
        user: { id: string; name: string; email: string };
        tenant: { id: string; marketName: string; slug: string; status: string };
        tokens: { accessToken: string; refreshToken: string };
      };

      setRefreshTokenCookie(reply, data.tokens.refreshToken);

      return reply.send({
        user: data.user,
        tenant: data.tenant,
        accessToken: data.tokens.accessToken,
      });
    } catch (err: any) {
      return handleCoreApiError(reply, err);
    }
  });

  fastify.post("/refresh", async (request, reply) => {
    const storedRefreshToken = request.cookies[env.REFRESH_TOKEN_COOKIE_NAME];
    const body = request.body as RefreshBody;
    const refreshToken = body.refreshToken ?? storedRefreshToken;

    if (!refreshToken) {
      return reply.status(401).send({ error: "REFRESH_TOKEN_REQUIRED", message: "Refresh token não encontrado." });
    }

    const client = createCoreApiClient();

    try {
      const coreResponse = await client.post("/api/hub/auth/refresh", { refreshToken });
      const data = toCamelCaseKeys(coreResponse.data) as {
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        expiresIn: number;
      };

      setRefreshTokenCookie(reply, data.refreshToken);

      return reply.send({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenType: data.tokenType,
        expiresIn: data.expiresIn,
      });
    } catch (err: any) {
      clearRefreshTokenCookie(reply);
      return handleCoreApiError(reply, err, 401);
    }
  });

  fastify.post("/logout", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const storedRefreshToken = request.cookies[env.REFRESH_TOKEN_COOKIE_NAME];

    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      await client.post("/api/hub/auth/logout", toSnakeCaseKeys({ refreshToken: storedRefreshToken }));
    } catch {
      // Ignorar erros do logout no core-api; ainda limpamos o cookie local
    }

    clearRefreshTokenCookie(reply);
    return reply.status(204).send();
  });
};

function setRefreshTokenCookie(reply: any, refreshToken: string) {
  reply.setCookie(env.REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    path: env.REFRESH_TOKEN_COOKIE_PATH,
    httpOnly: true,
    sameSite: env.COOKIE_SAME_SITE as "lax" | "strict" | "none",
    secure: env.COOKIE_SECURE,
    maxAge: 30 * 24 * 60 * 60, // 30 dias
  });
}

function clearRefreshTokenCookie(reply: any) {
  reply.setCookie(env.REFRESH_TOKEN_COOKIE_NAME, "", {
    path: env.REFRESH_TOKEN_COOKIE_PATH,
    httpOnly: true,
    sameSite: env.COOKIE_SAME_SITE as "lax" | "strict" | "none",
    secure: env.COOKIE_SECURE,
    maxAge: 0,
  });
}

function handleCoreApiError(reply: any, err: any, defaultStatus?: number) {
  if (err.isAxiosError || err.response) {
    const status = err.status ?? defaultStatus ?? 502;
    const message = err.data?.message ?? err.message ?? "Erro ao comunicar com o Core API";
    return reply.status(status).send({ error: err.data?.error ?? "CORE_API_ERROR", message });
  }
  return reply.status(defaultStatus ?? 500).send({ error: "INTERNAL_ERROR", message: err.message ?? "Erro interno" });
}

export default authRoutes;
