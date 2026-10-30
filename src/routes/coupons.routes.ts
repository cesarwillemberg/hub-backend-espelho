import { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { createCoreApiClient } from "../services/coreApiClient";
import { toCamelCaseKeys, toSnakeCaseKeys } from "../utils/caseConverter";

const couponType = z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]);
const couponSchema = z.object({
  code: z.string().trim().min(1).max(60).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
  description: z.string().nullable().optional(),
  type: couponType,
  discountValue: z.coerce.number().positive().nullable().optional(),
  minimumOrderValue: z.coerce.number().min(0).nullable().optional(),
  usageLimit: z.coerce.number().int().positive().nullable().optional(),
  perCustomerLimit: z.coerce.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
}).superRefine((coupon, context) => {
  if (coupon.type === "FREE_SHIPPING" && coupon.discountValue != null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Frete grátis não usa valor de desconto." });
  }
  if (coupon.type !== "FREE_SHIPPING" && coupon.discountValue == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Informe o valor do desconto." });
  }
  if (coupon.type === "PERCENTAGE" && (coupon.discountValue ?? 0) > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "O desconto percentual não pode ultrapassar 100%." });
  }
  if (coupon.startsAt && coupon.endsAt && new Date(coupon.endsAt) <= new Date(coupon.startsAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "A data final deve ser posterior à inicial." });
  }
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
  active: z.enum(["true", "false"]).optional(),
  type: couponType.optional(),
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
  return reply.status(400).send({ error: "VALIDATION_ERROR", message: error.flatten().fieldErrors });
}

function validId(id: string): boolean {
  return z.string().uuid().safeParse(id).success;
}

const couponsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).get("/api/hub/coupons", { params: parsed.data });
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) { return coreError(reply, err); }
  });

  fastify.get("/:couponId", async (request, reply) => {
    const { couponId } = request.params as { couponId: string };
    if (!validId(couponId)) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de cupom inválido." });
    try {
      const response = await clientFor(request).get(`/api/hub/coupons/${couponId}`);
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) { return coreError(reply, err); }
  });

  fastify.post("/", async (request, reply) => {
    const parsed = couponSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).post("/api/hub/coupons", toSnakeCaseKeys(parsed.data));
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) { return coreError(reply, err); }
  });

  fastify.put("/:couponId", async (request, reply) => {
    const { couponId } = request.params as { couponId: string };
    if (!validId(couponId)) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de cupom inválido." });
    const parsed = couponSchema.safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).put(`/api/hub/coupons/${couponId}`, toSnakeCaseKeys(parsed.data));
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) { return coreError(reply, err); }
  });

  fastify.patch("/:couponId/status", async (request, reply) => {
    const { couponId } = request.params as { couponId: string };
    if (!validId(couponId)) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de cupom inválido." });
    const parsed = z.object({ active: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).patch(`/api/hub/coupons/${couponId}/status`, parsed.data);
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) { return coreError(reply, err); }
  });

  fastify.delete("/:couponId", async (request, reply) => {
    const { couponId } = request.params as { couponId: string };
    if (!validId(couponId)) return reply.status(400).send({ error: "VALIDATION_ERROR", message: "ID de cupom inválido." });
    try {
      const response = await clientFor(request).delete(`/api/hub/coupons/${couponId}`);
      if (response.status === 204) return reply.status(204).send();
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) { return coreError(reply, err); }
  });

  fastify.post("/validate", async (request, reply) => {
    const parsed = z.object({ code: z.string().trim().min(1).max(60), subtotal: z.coerce.number().min(0), deliveryFee: z.coerce.number().min(0).optional(), customerEmail: z.string().email().optional() }).safeParse(request.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    try {
      const response = await clientFor(request).post("/api/hub/coupons/validate", toSnakeCaseKeys(parsed.data));
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (err: any) { return coreError(reply, err); }
  });
};

export default couponsRoutes;
