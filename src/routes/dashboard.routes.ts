import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";

const dashboardRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/summary", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const [lowStockRes, ordersRes] = await Promise.allSettled([
        client.get("/api/hub/products/low-stock?size=1"),
        client.get("/api/hub/orders?size=1"),
      ]);

      let lowStockCount = 0;
      let pendingOrders = 0;
      let preparingOrders = 0;
      let todayRevenue = 0;

      if (lowStockRes.status === "fulfilled") {
        const data = lowStockRes.value.data as { totalElements?: number } | null;
        lowStockCount = data?.totalElements ?? 0;
      }

      if (ordersRes.status === "fulfilled") {
        const data = ordersRes.value.data as { content?: Array<{ status?: string; total?: number }> } | null;
        const content = data?.content ?? [];
        for (const order of content) {
          if (order.status === "PENDING") pendingOrders += 1;
          if (order.status === "PREPARING") preparingOrders += 1;
          todayRevenue += Number(order.total ?? 0);
        }
      }

      return reply.send({
        lowStockCount,
        pendingOrders,
        preparingOrders,
        todayRevenue,
      });
    } catch (err: any) {
      return reply.status(502).send({ error: "DASHBOARD_ERROR", message: err.message ?? "Erro ao agregar métricas do dashboard" });
    }
  });
};

export default dashboardRoutes;
