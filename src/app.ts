import fastify, { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import corsPlugin from "./plugins/cors";
import jwtPlugin from "./plugins/jwt";
import tenantResolver from "./middleware/tenantResolver";
import authRoutes from "./routes/auth.routes";
import usersRoutes from "./routes/users.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import productsRoutes from "./routes/products.routes";
import ordersRoutes from "./routes/orders.routes";
import categoriesRoutes from "./routes/categories.routes";
import catalogCategoriesRoutes from "./routes/catalog-categories.routes";
import settingsRoutes from "./routes/settings.routes";
import promotionsRoutes from "./routes/promotions.routes";
import notificationsRoutes from "./routes/notifications.routes";
import couponsRoutes from "./routes/coupons.routes";
import activityLogsRoutes from "./routes/activity-logs.routes";
import rolesRoutes from "./routes/roles.routes";

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: { redact: ["req.headers.authorization", "req.headers.cookie", "req.url"] },
    requestTimeout: 30_000,
    keepAliveTimeout: 5_000,
  });

  await app.register(fastifyCookie, {
    secret: process.env.JWT_SECRET,
    parseOptions: {},
  });

  await app.register(corsPlugin);
  await app.register(jwtPlugin);
  await app.register(tenantResolver);

  app.get("/health", async () => ({ status: "ok", service: "hubbackend" }));

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(usersRoutes, { prefix: "/api/users" });
  app.register(rolesRoutes, { prefix: "/api/roles" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(productsRoutes, { prefix: "/api/products" });
  app.register(ordersRoutes, { prefix: "/api/orders" });
  app.register(categoriesRoutes, { prefix: "/api/categories" });
  app.register(catalogCategoriesRoutes, { prefix: "/api/catalog-categories" });
  app.register(settingsRoutes, { prefix: "/api/settings" });
  app.register(promotionsRoutes, { prefix: "/api/promotions" });
  app.register(notificationsRoutes, { prefix: "/api/notifications" });
  app.register(couponsRoutes, { prefix: "/api/coupons" });
  app.register(activityLogsRoutes, { prefix: "/api/activity-logs" });

  return app;
}
