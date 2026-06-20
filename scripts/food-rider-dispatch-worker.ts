import "dotenv/config";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { FOOD_RIDER_DISPATCH_QUEUE_NAME } from "@/lib/food-rider-dispatch-queue";
import { MEAL_PLAN_RECURRING_QUEUE_NAME } from "@/lib/meal-plan-recurring-queue";
import { MARKETING_SCHEDULED_QUEUE_NAME } from "@/lib/marketing-scheduled-queue";
import { processFoodRiderDispatchJob } from "@/lib/process-food-rider-dispatch-job";
import {
  processScheduledCourierDispatchJob,
  processScheduledRideDispatchJob,
} from "@/lib/process-scheduled-ride-dispatch-job";
import { processMealPlanRecurringJob } from "@/lib/process-meal-plan-recurring-job";
import { processMarketingScheduledJob } from "@/lib/process-marketing-scheduled-job";
import { catchUpOverdueScheduledCampaigns } from "@/lib/marketing-scheduled-catchup";
import { processRiderBonusTick } from "@/lib/rider-bonus-engine";
import { runMarketingAutomationTick } from "@/lib/marketing-automation-runner";
import { processRiderWalletClearance } from "@/lib/process-rider-wallet-clearance";
import { processRiderPayableCommissionRecovery } from "@/lib/process-rider-payable-commission";
import { runPillRemindersJob } from "@/lib/pill-reminders-runner";
import { runHealthActivityNotificationsJob } from "@/lib/health-activity-notifications-runner";
import { runLowStockNotificationsJob } from "@/lib/low-stock-notifications-runner";
import { runHealthDietMealRemindersJob, runHealthDietMorningAdviceJob } from "@/lib/health-diet-notifications-runner";
import { runWellnessModuleNotificationsJob } from "@/lib/wellness-module-notifications-runner";
import { prisma } from "@/lib/prisma";
import {
  processMoneyRateAlerts,
  processMoneyScheduledDue,
  processDueMoneyWalletWithdrawals,
  processSmartAutoPendingWithdrawals,
} from "@/lib/process-money-tasks";
import { MONEY_FX_SNAPSHOT_QUEUE_NAME } from "@/lib/money-fx-snapshot-queue";
import { runMoneyFxSnapshotTick } from "@/lib/process-money-fx-snapshot-job";
import { processDueNotificationBroadcasts } from "@/lib/process-due-notification-broadcasts";
import { runPickupWaitingJobs } from "@/lib/pickup-waiting";
import { processPropertyBookingScheduledJobs } from "@/lib/process-property-booking-jobs";
import { createGuardedInterval } from "@/lib/worker-interval";

const url = process.env.REDIS_URL;

if (!url) {
  console.error("REDIS_URL is required for food-rider-dispatch-worker");
  process.exit(1);
}

const connection = new Redis(url, {
  maxRetriesPerRequest: null,
});

const parseMs = (value: string | undefined, fallback: number, min = 1000) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.floor(parsed);
};

/** Poll FX pairs and insert DB snapshots when rates move (BullMQ scheduler interval). */
const MONEY_FX_SNAPSHOT_MS = parseMs(process.env.MONEY_FX_SNAPSHOT_MS, 2 * 60 * 1000, 30 * 1000);

// Worker
const foodDispatchWorker = new Worker(
  FOOD_RIDER_DISPATCH_QUEUE_NAME,
  async (job) => {
    try {
      console.log(`[Worker] Processing job ${job.id}`, job.name, job.data);

      if (job.name === "scheduled-ride-dispatch") {
        await processScheduledRideDispatchJob(job.data as { rideBookingId: string });
      } else if (job.name === "scheduled-courier-dispatch") {
        await processScheduledCourierDispatchJob(job.data as { courierBookingId: string });
      } else {
        await processFoodRiderDispatchJob(
          job.data as { courierBookingId: string; orderId: string }
        );
      }

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

const marketingScheduledWorker = new Worker(
  MARKETING_SCHEDULED_QUEUE_NAME,
  async (job) => {
    try {
      console.log(`[Worker] Marketing scheduled job ${job.id}`, job.name, job.data);
      await processMarketingScheduledJob(job.data as { campaignId: string });
      console.log(`[Worker] Marketing scheduled completed ${job.id}`);
    } catch (error) {
      console.error(`[Worker] Marketing scheduled failed ${job.id}`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 2000 },
  }
);
void marketingScheduledWorker;

const moneyFxSnapshotQueue = new Queue(MONEY_FX_SNAPSHOT_QUEUE_NAME, { connection });

const moneyFxSnapshotWorker = new Worker(
  MONEY_FX_SNAPSHOT_QUEUE_NAME,
  async () => {
    const r = await runMoneyFxSnapshotTick();
    if (r.inserted > 0 || r.errors > 0) {
      console.log(
        `[money-fx-snapshot] pairs=${r.pairs} inserted=${r.inserted} unchanged=${r.unchanged} errors=${r.errors}`
      );
    }
    return r;
  },
  {
    connection,
    concurrency: 1,
  }
);
void moneyFxSnapshotWorker;

void (async () => {
  try {
    await moneyFxSnapshotQueue.upsertJobScheduler(
      "money-fx-snapshot-scheduler",
      { every: MONEY_FX_SNAPSHOT_MS },
      {
        name: "tick",
        data: {},
        opts: {
          removeOnComplete: { count: 120 },
          attempts: 2,
          backoff: { type: "exponential", delay: 8000 },
        },
      }
    );
    console.log(
      `[bullmq] "${MONEY_FX_SNAPSHOT_QUEUE_NAME}" scheduler every ${MONEY_FX_SNAPSHOT_MS}ms (set MONEY_FX_SNAPSHOT_MS / MONEY_FX_SNAPSHOT_PAIRS)`
    );
  } catch (e) {
    console.error("[money-fx-snapshot] upsertJobScheduler failed:", e);
  }
})();

console.log(
  `[bullmq-workers] "${FOOD_RIDER_DISPATCH_QUEUE_NAME}" (food + scheduled-ride-dispatch) + "${MEAL_PLAN_RECURRING_QUEUE_NAME}" + "${MARKETING_SCHEDULED_QUEUE_NAME}" + "${MONEY_FX_SNAPSHOT_QUEUE_NAME}"`
);

const BONUS_MS = parseMs(process.env.RIDER_BONUS_TICK_MS, 10 * 60 * 1000);
const MARKETING_MS = parseMs(process.env.MARKETING_AUTOMATION_MS, 6 * 60 * 60 * 1000, 60 * 1000);
const MARKETING_CATCHUP_MS = parseMs(process.env.MARKETING_SCHEDULED_CATCHUP_MS, 60 * 1000, 15 * 1000);
const WALLET_CLEARANCE_MS = parseMs(process.env.RIDER_WALLET_CLEARANCE_TICK_MS, 15 * 60 * 1000);
const PAYABLE_COMMISSION_MS = parseMs(process.env.RIDER_PAYABLE_COMMISSION_TICK_MS, 15 * 60 * 1000);
/** Same logic as GET /api/cron/pill-reminders — keeps reminders firing if external cron is misconfigured. */
const PILL_REMINDERS_MS = parseMs(process.env.PILL_REMINDERS_TICK_MS, 60 * 1000, 30 * 1000);
/** Health activity summaries, goal achievements, evening nudges (`runHealthActivityNotificationsJob`). */
const HEALTH_ACTIVITY_MS = parseMs(process.env.HEALTH_ACTIVITY_TICK_MS, 60 * 60 * 1000, 5 * 60 * 1000);
/** Low stock alerts for vendor inventory (`runLowStockNotificationsJob`). */
const LOW_STOCK_MS = parseMs(process.env.LOW_STOCK_TICK_MS, 30 * 60 * 1000, 5 * 60 * 1000);
/** Diet meal reminders on active health diet plans (`runHealthDietMealRemindersJob`). */
const HEALTH_DIET_MS = parseMs(process.env.HEALTH_DIET_TICK_MS, 30 * 60 * 1000, 5 * 60 * 1000);
/** Smart hydration, sleep & walk wellness reminders (`runWellnessModuleNotificationsJob`). */
const WELLNESS_MODULE_MS = parseMs(process.env.WELLNESS_MODULE_TICK_MS, 15 * 60 * 1000, 5 * 60 * 1000);
const BOOKING_CLEANUP_MS = parseMs(process.env.BOOKING_CLEANUP_TICK_MS, 15 * 60 * 1000);
const MONEY_TRANSFER_TICK_MS = parseMs(process.env.MONEY_TRANSFER_WORKER_MS, 60 * 1000, 10 * 1000);
const ACCOUNT_DELETION_PURGE_MS = parseMs(
  process.env.ACCOUNT_DELETION_PURGE_TICK_MS,
  6 * 60 * 60 * 1000,
  60 * 1000
);
/** Poll DB for admin /notifications notices with status SCHEDULED and scheduledAt &lt;= now. */
const NOTIFICATION_BROADCAST_MS = parseMs(
  process.env.NOTIFICATION_BROADCAST_SCHEDULE_MS,
  60 * 1000,
  15 * 1000
);
/** Pickup waiting: grace warnings, per-minute accrual, charge-started push, realtime sockets (`runPickupWaitingJobs`). */
const PICKUP_WAITING_NOTIFY_MS = parseMs(
  process.env.PICKUP_WAITING_NOTIFY_TICK_MS,
  15 * 1000,
  10 * 1000
);

console.log(
  `[worker-intervals] bonus=${BONUS_MS}ms marketing=${MARKETING_MS}ms catchup=${MARKETING_CATCHUP_MS}ms wallet=${WALLET_CLEARANCE_MS}ms payableCommission=${PAYABLE_COMMISSION_MS}ms pill=${PILL_REMINDERS_MS}ms healthActivity=${HEALTH_ACTIVITY_MS}ms healthDiet=${HEALTH_DIET_MS}ms wellnessModule=${WELLNESS_MODULE_MS}ms lowStock=${LOW_STOCK_MS}ms cleanup=${BOOKING_CLEANUP_MS}ms moneyFxSnapshot=${MONEY_FX_SNAPSHOT_MS}ms adminNotices=${NOTIFICATION_BROADCAST_MS}ms pickupWaiting=${PICKUP_WAITING_NOTIFY_MS}ms`
);

createGuardedInterval("rider-bonus-tick", () => processRiderBonusTick(), BONUS_MS);

/** Heuristic abandoned-cart style automation (not schedule-based). */
createGuardedInterval(
  "marketing-automation",
  async () => {
    const { sent, skipped } = await runMarketingAutomationTick();
    if (sent > 0 || skipped !== "ok") {
      console.log(`[marketing-automation] sent=${sent} skipped=${skipped}`);
    }
  },
  MARKETING_MS
);

/** Safety net for SCHEDULED campaigns if a delayed BullMQ job was missed. */
createGuardedInterval(
  "marketing-scheduled-catchup",
  async () => {
    const { attempted, launched } = await catchUpOverdueScheduledCampaigns();
    if (attempted > 0) {
      console.log(`[marketing-scheduled-catchup] attempted=${attempted} launched=${launched}`);
    }
  },
  MARKETING_CATCHUP_MS
);

createGuardedInterval(
  "admin-notification-schedule",
  async () => {
    const { attempted, launched } = await processDueNotificationBroadcasts();
    if (attempted > 0) {
      console.log(`[admin-notification-schedule] due=${attempted} sent=${launched}`);
    }
  },
  NOTIFICATION_BROADCAST_MS
);

createGuardedInterval(
  "pickup-waiting",
  async () => {
    const { rideCandidates, courierCandidates, grace50, grace90, accruals, chargeStarts } =
      await runPickupWaitingJobs();
    if (
      grace50 > 0 ||
      grace90 > 0 ||
      accruals > 0 ||
      chargeStarts > 0 ||
      rideCandidates > 0 ||
      courierCandidates > 0
    ) {
      console.log(
        `[pickup-waiting] rideQ=${rideCandidates} courierQ=${courierCandidates} grace50=${grace50} grace90=${grace90} accruals=${accruals} chargeStarts=${chargeStarts}`
      );
    }
  },
  PICKUP_WAITING_NOTIFY_MS
);

createGuardedInterval(
  "rider-wallet-clearance",
  async () => {
    const { cleared } = await processRiderWalletClearance();
    if (cleared > 0) console.log(`[rider-wallet-clearance] cleared=${cleared}`);
  },
  WALLET_CLEARANCE_MS
);

createGuardedInterval(
  "rider-payable-commission",
  async () => {
    const { collected, reminded, locked } = await processRiderPayableCommissionRecovery();
    if (collected > 0 || reminded > 0 || locked > 0) {
      console.log(
        `[rider-payable-commission] collected=${collected} reminded=${reminded} locked=${locked}`
      );
    }
  },
  PAYABLE_COMMISSION_MS
);

createGuardedInterval(
  "pill-reminders",
  async () => {
    const { notificationsSent, remindersChecked } = await runPillRemindersJob();
    if (notificationsSent > 0 || remindersChecked > 0) {
      console.log(`[pill-reminders] checked=${remindersChecked} notifications=${notificationsSent}`);
    }
  },
  PILL_REMINDERS_MS
);

createGuardedInterval(
  "health-activity",
  async () => {
    const r = await runHealthActivityNotificationsJob();
    if (r.notificationsSent > 0) {
      console.log(
        `[health-activity] sent=${r.notificationsSent} daily=${r.dailySummaries} weekly=${r.weeklySummaries} monthly=${r.monthlySummaries} goals=${r.goalAchievements} nudges=${r.activityNudges} walkReports=${r.todayWalkReports}`
      );
    }
  },
  HEALTH_ACTIVITY_MS
);

createGuardedInterval(
  "low-stock",
  async () => {
    const r = await runLowStockNotificationsJob();
    if (r.notificationsSent > 0) {
      console.log(
        `[low-stock] checked=${r.checked} sent=${r.notificationsSent} modules=${JSON.stringify(r.byModule)}`
      );
    }
  },
  LOW_STOCK_MS
);

createGuardedInterval(
  "health-diet",
  async () => {
    const r = await runHealthDietMealRemindersJob();
    if (r.notificationsSent > 0) {
      console.log(`[health-diet] mealReminders=${r.mealReminders} sent=${r.notificationsSent}`);
    }
    await runHealthDietMorningAdviceJob();
  },
  HEALTH_DIET_MS
);

createGuardedInterval(
  "wellness-module",
  async () => {
    const r = await runWellnessModuleNotificationsJob();
    if (r.notificationsSent > 0) {
      console.log(
        `[wellness-module] sent=${r.notificationsSent} hydration=${r.hydrationReminders} sleep=${r.sleepReminders} walk=${r.walkNudges}`
      );
    }
  },
  WELLNESS_MODULE_MS
);

const PROPERTY_BOOKING_JOBS_MS = parseMs(process.env.PROPERTY_BOOKING_JOBS_MS, 5 * 60 * 1000, 60 * 1000);

createGuardedInterval(
  "property-booking-jobs",
  async () => {
    const r = await processPropertyBookingScheduledJobs();
    if (r.reminders > 0 || r.autoCompleted > 0) {
      console.log(`[property-booking-jobs] reminders=${r.reminders} autoCompleted=${r.autoCompleted}`);
    }
  },
  PROPERTY_BOOKING_JOBS_MS
);

async function cleanupOldBookingRequests() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const removableStatuses = ["EXPIRED", "WITHDRAWN", "CANCELLED"] as const;

  const [courier, ride] = await Promise.all([
    prisma.courierBooking.deleteMany({
      where: {
        status: { in: removableStatuses as any },
        updatedAt: { lt: cutoff },
      },
    }),
    prisma.rideBooking.deleteMany({
      where: {
        status: { in: removableStatuses as any },
        updatedAt: { lt: cutoff },
      },
    }),
  ]);

  const deleted = courier.count + ride.count;
  if (deleted > 0) {
    console.log(`[booking-cleanup] deleted=${deleted} courier=${courier.count} ride=${ride.count}`);
  }
}

async function processScheduledAccountDeletionPurge() {
  const retentionDays = Number(process.env.ACCOUNT_DELETION_RETENTION_DAYS || 30);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: { lte: cutoff },
      isActive: false,
    },
    select: {
      id: true,
      email: true,
      phone: true,
    },
    take: 100,
  });

  let processed = 0;
  for (const user of candidates) {
    const tombstone = `deleted_${user.id}_${Date.now()}`;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: "Deleted User",
          avatar: null,
          password: null,
          email: user.email ? `${tombstone}@deleted.local` : null,
          phone: user.phone ? `${tombstone}` : null,
          resetToken: null,
          resetTokenExpiry: null,
          isVerified: false,
          status: "INACTIVE",
          isActive: false,
        },
      });

      await tx.auditLog.create({
        data: {
          performedBy: user.id,
          action: "ACCOUNT_SECURITY_PURGED",
          entityType: "User",
          entityId: user.id,
          details: {
            purgedAt: new Date().toISOString(),
            retentionDays,
            source: "food-rider-dispatch-worker",
          },
        },
      });
    });
    processed += 1;
  }

  if (processed > 0) {
    console.log(`[account-deletion-purge] processed=${processed} retentionDays=${retentionDays}`);
  }
}

createGuardedInterval("booking-cleanup", () => cleanupOldBookingRequests(), BOOKING_CLEANUP_MS);

createGuardedInterval(
  "account-deletion-purge",
  () => processScheduledAccountDeletionPurge(),
  ACCOUNT_DELETION_PURGE_MS
);

createGuardedInterval(
  "money-transfer-worker",
  async () => {
    const [d, a, w, s] = await Promise.all([
      processMoneyScheduledDue(),
      processMoneyRateAlerts(),
      processDueMoneyWalletWithdrawals(),
      processSmartAutoPendingWithdrawals(),
    ]);
    if (
      d.processed > 0 ||
      a.notified > 0 ||
      w.processed > 0 ||
      w.failed > 0 ||
      s.processed > 0 ||
      s.failed > 0 ||
      s.skipped > 0
    ) {
      console.log(
        `[money-transfer-worker] schedules=${d.processed} rateAlerts=${a.notified} walletPayouts=${w.processed} walletPayoutFailed=${w.failed} smartAuto=${s.processed}/${s.failed}/${s.skipped}`
      );
    }
  },
  MONEY_TRANSFER_TICK_MS
);

// Graceful shutdown (IMPORTANT)
process.on("SIGINT", async () => {
  console.log("[Worker] Shutting down gracefully...");
  await foodDispatchWorker.close();
  await mealPlanWorker.close();
  await marketingScheduledWorker.close();
  await moneyFxSnapshotWorker.close();
  await moneyFxSnapshotQueue.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, shutting down...");
  await foodDispatchWorker.close();
  await mealPlanWorker.close();
  await marketingScheduledWorker.close();
  await moneyFxSnapshotWorker.close();
  await moneyFxSnapshotQueue.close();
  await connection.quit();
  process.exit(0);
});