import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { z } from "zod";
import { toSnakeCaseKeys, toCamelCaseKeys } from "../utils/caseConverter";

const productRequestSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(160),
  description: z.string().optional(),
  sku: z.string().max(80).optional(),
  barcode: z.string().max(80).optional(),
  price: z.coerce.number().nonnegative(),
  promotionalPrice: z.coerce.number().nonnegative().optional(),
  stockQuantity: z.coerce.number().int().nonnegative(),
  lowStockThreshold: z.coerce.number().int().nonnegative().optional(),
  imageUrl: z.string().optional(),
  active: z.boolean().optional(),
});

const stockAdjustSchema = z.object({
  operation: z.enum(["SET", "INCREMENT", "DECREMENT"]),
  quantity: z.coerce.number().int().nonnegative(),
  reason: z.string().max(1000).optional(),
});

// Corpo de POST /api/products/:productId/image-upload-url
// (espelha ProductImageUploadUrlRequest do Core API)
const imageUploadUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
});

// Corpo de PATCH /api/products/:productId/image
// (espelha UpdateProductImageRequest do Core API)
const updateProductImageRequestSchema = z.object({
  imageUrl: z.string().min(1).max(1000),
});

function clientFor(request: FastifyRequest) {
  const accessToken = request.headers.authorization?.replace("Bearer ", "");
  return createCoreApiClient({
    accessToken,
    tenantSlug: request.tenantSlug ?? undefined,
  });
}

function productIdFrom(request: FastifyRequest): string {
  return (request.params as { productId: string }).productId;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: "VALIDATION_ERROR",
    message: error.flatten().fieldErrors,
  });
}

function sendCoreError(reply: FastifyReply, err: any) {
  return reply.status(err.status ?? 502).send({
    error: err.data?.error ?? "CORE_API_ERROR",
    message: err.data?.message ?? err.message,
  });
}

const productsRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    try {
      const coreRes = await clientFor(request).get("/api/hub/products", {
        params: request.query,
      });
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.get("/low-stock", async (request, reply) => {
    try {
      const coreRes = await clientFor(request).get("/api/hub/products/low-stock", {
        params: request.query,
      });
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.get("/:productId", async (request, reply) => {
    try {
      const coreRes = await clientFor(request).get(
        `/api/hub/products/${productIdFrom(request)}`,
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.get("/:productId/stock-movements", async (request, reply) => {
    try {
      const coreRes = await clientFor(request).get(
        `/api/hub/products/${productIdFrom(request)}/stock-movements`,
        { params: request.query },
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.post("/", async (request, reply) => {
    const parsed = productRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    try {
      const coreRes = await clientFor(request).post(
        "/api/hub/products",
        toSnakeCaseKeys(parsed.data),
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.put("/:productId", async (request, reply) => {
    const parsed = productRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    try {
      const coreRes = await clientFor(request).put(
        `/api/hub/products/${productIdFrom(request)}`,
        toSnakeCaseKeys(parsed.data),
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.patch("/:productId/stock", async (request, reply) => {
    const parsed = stockAdjustSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    try {
      const coreRes = await clientFor(request).patch(
        `/api/hub/products/${productIdFrom(request)}/stock`,
        toSnakeCaseKeys(parsed.data),
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.post("/:productId/image-upload-url", async (request, reply) => {
    const parsed = imageUploadUrlRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    try {
      const coreRes = await clientFor(request).post(
        `/api/hub/products/${productIdFrom(request)}/image-upload-url`,
        toSnakeCaseKeys(parsed.data),
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.patch("/:productId/image", async (request, reply) => {
    const parsed = updateProductImageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, parsed.error);
    }

    try {
      const coreRes = await clientFor(request).patch(
        `/api/hub/products/${productIdFrom(request)}/image`,
        toSnakeCaseKeys(parsed.data),
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });

  fastify.delete("/:productId", async (request, reply) => {
    try {
      const coreRes = await clientFor(request).delete(
        `/api/hub/products/${productIdFrom(request)}`,
      );
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return sendCoreError(reply, err);
    }
  });
};

export default productsRoutes;
