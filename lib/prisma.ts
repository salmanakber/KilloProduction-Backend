// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { eventBus } from "./event-bus";

declare global {
  // allow hot-reload in dev to not create multiple clients
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Middleware: emit events for create/update/delete
prisma.$use(async (params, next) => {
  const result = await next(params);

  if (["create", "update", "delete"].includes(params.action)) {
    const payload = {
      model: params.model,
      action: params.action,
      data: result,
    };

    // General broadcast event
    eventBus.emit("db_change", payload);

    // Convenience: if the result contains userId, emit user-specific event
    // (useful for notifications or user-scoped updates)
    if (result && (result as any).userId) {
      eventBus.emit("db_change:user", {
        userId: (result as any).userId,
        payload,
      });
    }
  }

  return result;
});
