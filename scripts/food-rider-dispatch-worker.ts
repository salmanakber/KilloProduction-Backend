import "dotenv/config";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { FOOD_RIDER_DISPATCH_QUEUE_NAME } from "@/lib/food-rider-dispatch-queue";
import { MEAL_PLAN_RECURRING_QUEUE_NAME } from "@/lib/meal-plan-recurring-queue";
import { processFoodRiderDispatchJob } from "@/lib/process-food-rider-dispatch-job";
import { processMealPlanRecurringJob } from "@/lib/process-meal-plan-recurring-job";
import { processRiderBonusTick } from "@/lib/rider-bonus-engine";
import { runMarketingAutomationTick } from "@/lib/marketing-automation-runner";

const url = process.env.REDIS_URL;

if (!url) {
  console.error("REDIS_URL is required for food-rider-dispatch-worker");
  process.exit(1);
}

const connection = new Redis(url, {
  maxRetriesPerRequest: null,
});

// Worker
const foodDispatchWorker = new Worker(
  FOOD_RIDER_DISPATCH_QUEUE_NAME,
  async (job) => {
    try {
      console.log(`[Worker] Processing job ${job.id}`, job.data);

      await processFoodRiderDispatchJob(
        job.data as { courierBookingId: string; orderId: string }
      );

      console.log(`[Worker] Completed job ${job.id}`);
    } catch (error) {
      console.error(`[Worker] Failed job ${job.id}`, error);
      throw error; // important for BullMQ retry handling
    }
  },
  {
    connection,
    concurrency: 5,

    removeOnComplete: {
      count: 1000,
    },

    removeOnFail: {
      count: 5000,
    },
  }
);

const mealPlanWorker = new Worker(
  MEAL_PLAN_RECURRING_QUEUE_NAME,
  async (job) => {
    try {
      console.log(`[Worker] Meal plan job ${job.id}`, job.data);
      await processMealPlanRecurringJob(job.data as { planId: string });
      console.log(`[Worker] Meal plan completed ${job.id}`);
    } catch (error) {
      console.error(`[Worker] Meal plan failed ${job.id}`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  }
);
void mealPlanWorker;

console.log(
  `[bullmq-workers] "${FOOD_RIDER_DISPATCH_QUEUE_NAME}" + "${MEAL_PLAN_RECURRING_QUEUE_NAME}"`
);

const BONUS_MS = Number(process.env.RIDER_BONUS_TICK_MS || 10 * 60 * 1000);
const MARKETING_MS = Number(process.env.MARKETING_AUTOMATION_MS || 6 * 60 * 60 * 1000);

setInterval(() => {
  processRiderBonusTick().catch((e) => console.error("[rider-bonus-tick]", e));
}, BONUS_MS);

setInterval(() => {
  runMarketingAutomationTick().catch((e) => console.error("[marketing-automation]", e));
}, MARKETING_MS);

void processRiderBonusTick().catch((e) => console.error("[rider-bonus-tick] boot", e));

// Graceful shutdown (IMPORTANT)
process.on("SIGINT", async () => {
  console.log("[Worker] Shutting down gracefully...");
  await foodDispatchWorker.close();
  await mealPlanWorker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, shutting down...");
  await foodDispatchWorker.close();
  await mealPlanWorker.close();
  await connection.quit();
  process.exit(0);
});