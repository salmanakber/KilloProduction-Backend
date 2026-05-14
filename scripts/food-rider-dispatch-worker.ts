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
import { runPillRemindersJob } from "@/lib/pill-reminders-runner";
import { prisma } from "@/lib/prisma";
import { processMoneyRateAlerts, processMoneyScheduledDue } from "@/lib/process-money-tasks";
import { MONEY_FX_SNAPSHOT_QUEUE_NAME } from "@/lib/money-fx-snapshot-queue";
import { runMoneyFxSnapshotTick } from "@/lib/process-money-fx-snapshot-job";
import { processDueNotificationBroadcasts } from "@/lib/process-due-notification-broadcasts";
import { runPickupWaitingJobs } from "@/lib/pickup-waiting";

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
/** Same logic as GET /api/cron/pill-reminders — keeps reminders firing if external cron is misconfigured. */
const PILL_REMINDERS_MS = parseMs(process.env.PILL_REMINDERS_TICK_MS, 60 * 1000, 30 * 1000);
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
  `[worker-intervals] bonus=${BONUS_MS}ms marketing=${MARKETING_MS}ms catchup=${MARKETING_CATCHUP_MS}ms wallet=${WALLET_CLEARANCE_MS}ms pill=${PILL_REMINDERS_MS}ms cleanup=${BOOKING_CLEANUP_MS}ms moneyFxSnapshot=${MONEY_FX_SNAPSHOT_MS}ms adminNotices=${NOTIFICATION_BROADCAST_MS}ms pickupWaiting=${PICKUP_WAITING_NOTIFY_MS}ms`
);

setInterval(() => {
  processRiderBonusTick().catch((e) => console.error("[rider-bonus-tick]", e));
}, BONUS_MS);

/** Heuristic abandoned-cart style automation (not schedule-based). */
setInterval(() => {
  runMarketingAutomationTick()
    .then(({ sent, skipped }) => {
      if (sent > 0 || skipped !== "ok") {
        console.log(`[marketing-automation] sent=${sent} skipped=${skipped}`);
      }
    })
    .catch((e) => console.error("[marketing-automation]", e));
}, MARKETING_MS);

/** Safety net for SCHEDULED campaigns if a delayed BullMQ job was missed. */
setInterval(() => {
  catchUpOverdueScheduledCampaigns()
    .then(({ attempted, launched }) => {
      if (attempted > 0) {
        console.log(`[marketing-scheduled-catchup] attempted=${attempted} launched=${launched}`);
      }
    })
    .catch((e) => console.error("[marketing-scheduled-catchup]", e));
}, MARKETING_CATCHUP_MS);

void processRiderBonusTick().catch((e) => console.error("[rider-bonus-tick] boot", e));

void runMarketingAutomationTick()
  .then(({ sent, skipped }) => {
    console.log(`[marketing-automation] boot sent=${sent} skipped=${skipped}`);
  })
  .catch((e) => console.error("[marketing-automation] boot", e));

void catchUpOverdueScheduledCampaigns().catch((e) =>
  console.error("[marketing-scheduled-catchup] boot", e)
);

setInterval(() => {
  processDueNotificationBroadcasts()
    .then(({ attempted, launched }) => {
      if (attempted > 0) {
        console.log(`[admin-notification-schedule] due=${attempted} sent=${launched}`);
      }
    })
    .catch((e) => console.error("[admin-notification-schedule]", e));
}, NOTIFICATION_BROADCAST_MS);

void processDueNotificationBroadcasts().catch((e) =>
  console.error("[admin-notification-schedule] boot", e)
);

setInterval(() => {
  runPickupWaitingJobs()
    .then(({ rideCandidates, courierCandidates, grace50, grace90, accruals, chargeStarts }) => {
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
    })
    .catch((e) => console.error("[pickup-waiting]", e));
}, PICKUP_WAITING_NOTIFY_MS);

void runPickupWaitingJobs().catch((e) => console.error("[pickup-waiting] boot", e));

setInterval(() => {
  processRiderWalletClearance()
    .then(({ cleared }) => {
      if (cleared > 0) console.log(`[rider-wallet-clearance] cleared=${cleared}`);
    })
    .catch((e) => console.error("[rider-wallet-clearance]", e));
}, WALLET_CLEARANCE_MS);

void processRiderWalletClearance().catch((e) =>
  console.error("[rider-wallet-clearance] boot", e)
);

setInterval(() => {
  runPillRemindersJob()
    .then(({ notificationsSent, remindersChecked }) => {
      if (notificationsSent > 0 || remindersChecked > 0) {
        console.log(
          `[pill-reminders] checked=${remindersChecked} notifications=${notificationsSent}`
        );
      }
    })
    .catch((e) => console.error("[pill-reminders]", e));
}, PILL_REMINDERS_MS);

void runPillRemindersJob().catch((e) => console.error("[pill-reminders] boot", e));

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

setInterval(() => {
  cleanupOldBookingRequests().catch((e) => console.error("[booking-cleanup]", e));
}, BOOKING_CLEANUP_MS);

void cleanupOldBookingRequests().catch((e) => console.error("[booking-cleanup] boot", e));

setInterval(() => {
  processScheduledAccountDeletionPurge().catch((e) => console.error("[account-deletion-purge]", e));
}, ACCOUNT_DELETION_PURGE_MS);

void processScheduledAccountDeletionPurge().catch((e) =>
  console.error("[account-deletion-purge] boot", e)
);

setInterval(() => {
  Promise.all([processMoneyScheduledDue(), processMoneyRateAlerts()])
    .then(([d, a]) => {
      if (d.processed > 0 || a.notified > 0) {
        console.log(`[money-transfer-worker] schedules=${d.processed} rateAlerts=${a.notified}`);
      }
    })
    .catch((e) => console.error("[money-transfer-worker]", e));
}, MONEY_TRANSFER_TICK_MS);

void processMoneyScheduledDue().catch((e) => console.error("[money-transfer-worker] boot schedules", e));
void processMoneyRateAlerts().catch((e) => console.error("[money-transfer-worker] boot alerts", e));

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