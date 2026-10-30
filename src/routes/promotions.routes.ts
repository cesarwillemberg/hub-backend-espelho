import { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { createCoreApiClient } from "../services/coreApiClient";
import { toCamelCaseKeys, toSnakeCaseKeys } from "../utils/caseConverter";

const promotionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().optional(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "PROMOTIONAL_PRICE"]),
  scope: z.enum(["PRODUCTS", "CATEGORIES"]),
  discountValue: z.coerce.number().positive(),
  productIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
}).superRefine((promotion, context) => {
  if (promotion.type === "PERCENTAGE" && promotion.discountValue > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountValue"],
      message: "O desconto percentual não pode ultrapassar 100%.",
    });
  }

  const productIds = promotion.productIds ?? [];
  const categoryIds = promotion.categoryIds ?? [];
  if (productIds.length > 0 && categoryIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["categoryIds"],
      message: "Informe produtos ou categorias, não ambos.",
    });
  }
  if (promotion.scope === "PRODUCTS" && productIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["productIds"],
      message: "Selecione pelo menos um produto.",
    });
  }
  if (promotion.scope === "CATEGORIES" && categoryIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["categoryIds"],
      message: "Selecione pelo menos uma categoria.",
    });
  }
  if (promotion.scope === "PRODUCTS" && categoryIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["categoryIds"],
      message: "Remova as categorias ao aplicar a promoção a produtos.",
    });
  }
  if (promotion.scope === "CATEGORIES" && productIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["productIds"],
      message: "Remova os produtos ao aplicar a promoção a categorias.",
    });
  }

  if (promotion.startsAt && promotion.endsAt && new Date(promotion.endsAt) <= new Date(promotion.startsAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "O fim da promoção deve ser posterior ao início.",
    });
  }
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
  active: z.enum(["true", "false"]).optional(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "PROMOTIONAL_PRICE"]).optional(),
  scope: z.enum(["PRODUCTS", "CATEGORIES"]).optional(),
  search: z.string().max(160).optional(),
});

function clientFor(request: { headers: { authorization?: string }; tenantSlug?: string | null }) {
  return createCoreApiClient({
    accessToken: request.headers.authorization?.replace(/^Bearer\s+/i, ""),
    tenantSlug: request.tenantSlug ?? undefined,
  });
}

function coreError(reply: FastifyReply, err: any) {
  return reply.status(err.status ?? 502).send({
    error: err.data?.error ?? "CORE_API_ERROR",
    message: err.data?.message ?? err.message,
  });
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: "VALIDATION_ERROR",
    message: error.flatten().fieldErrors,
  });
}

const promotionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).get("/api/hub/promotions", {
        params: parsed.data,
      });
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) {
      return coreError(reply, err);
    }
  });

  fastify.get("/:promotionId", async (request, reply) => {
    const { promotionId } = request.params as { promotionId: string };
    if (!z.string().uuid().safeParse(promotionId).success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de promoção inválido." });
    }
    try {
      const response = await clientFor(request).get(`/api/hub/promotions/${promotionId}`);
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) {
      return coreError(reply, err);
    }
  });

  fastify.post("/", async (request, reply) => {
    const parsed = promotionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).post(
        "/api/hub/promotions",
        toSnakeCaseKeys(parsed.data),
      );
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) {
      return coreError(reply, err);
    }
  });

  fastify.put("/:promotionId", async (request, reply) => {
    const { promotionId } = request.params as { promotionId: string };
    if (!z.string().uuid().safeParse(promotionId).success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de promoção inválido." });
    }
    const parsed = promotionSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).put(
        `/api/hub/promotions/${promotionId}`,
        toSnakeCaseKeys(parsed.data),
      );
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) {
      return coreError(reply, err);
    }
  });

  fastify.patch("/:promotionId/status", async (request, reply) => {
    const { promotionId } = request.params as { promotionId: string };
    if (!z.string().uuid().safeParse(promotionId).success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de promoção inválido." });
    }
    const parsed = z.object({ active: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).patch(
        `/api/hub/promotions/${promotionId}/status`,
        parsed.data,
      );
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) {
      return coreError(reply, err);
    }
  });

  fastify.delete("/:promotionId", async (request, reply) => {
    const { promotionId } = request.params as { promotionId: string };
    if (!z.string().uuid().safeParse(promotionId).success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de promoção inválido." });
    }
    try {
      const response = await clientFor(request).delete(`/api/hub/promotions/${promotionId}`);
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) {
      return coreError(reply, err);
    }
  });
};

export default promotionsRoutes;
