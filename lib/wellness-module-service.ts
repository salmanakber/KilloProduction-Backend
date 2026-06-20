import { prisma } from "@/lib/prisma"
import { analyzeWithAI } from "@/lib/ai/queue"
import { AIUseCase, WellnessModule } from "@prisma/client"

export type WellnessModuleKey = "WALK" | "WATER" | "SLEEP"

export type WellnessChallenge = {
  id: string
  title: string
  description: string
  points: number
  category: string
  completed: boolean
}

export type WellnessRecommendation = {
  id: string
  message: string
  priority: "high" | "medium" | "low"
}

export type ModuleGamification = {
  points: number
  streak: number
  completionPct: number
  badges: string[]
  totalPoints: number
}

export type WaterFrequencyConfig = {
  dailyGoalGlasses: number
  frequencyMode: "custom" | "hourly" | "half_hourly" | "split_day"
  glassesPerInterval?: number
  intervalMinutes?: number
  morningTarget?: number
  eveningTarget?: number
  remindersEnabled: boolean
}

export type SleepScheduleConfig = {
  bedtimeTarget: string
  wakeTarget: string
  reminderMinutesBefore: number
  remindersEnabled: boolean
}

export type WalkConfig = {
  dailyStepGoal: number
  remindersEnabled: boolean
}

const MODULES: WellnessModuleKey[] = ["WALK", "WATER", "SLEEP"]

const DEFAULT_WATER_CONFIG: WaterFrequencyConfig = {
  dailyGoalGlasses: 8,
  frequencyMode: "hourly",
  glassesPerInterval: 1,
  intervalMinutes: 60,
  morningTarget: 4,
  eveningTarget: 4,
  remindersEnabled: true,
}

const DEFAULT_SLEEP_CONFIG: SleepScheduleConfig = {
  bedtimeTarget: "22:30",
  wakeTarget: "07:00",
  reminderMinutesBefore: 30,
  remindersEnabled: true,
}

const DEFAULT_WALK_CONFIG: WalkConfig = {
  dailyStepGoal: 10000,
  remindersEnabled: true,
}

function dateKey(d = new Date()) {
  return d.toISOString().split("T")[0]
}

function yesterdayKey(d = new Date()) {
  const x = new Date(d)
  x.setDate(x.getDate() - 1)
  return dateKey(x)
}

function parseAiJson(content: string): Record<string, unknown> | null {
  try {
    let cleaned = content.trim()
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
    const first = cleaned.indexOf("{")
    const last = cleaned.lastIndexOf("}")
    if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

function stepsFromLogs(logs: { logType: string; value: unknown }[]): number {
  let max = 0
  for (const log of logs) {
    if (log.logType !== "STEPS") continue
    const v = log.value as { count?: number; steps?: number } | null
    const n = Number(v?.count ?? v?.steps ?? 0)
    if (n > max) max = n
  }
  return max
}

function waterGlassesToday(logs: { logType: string; value: unknown; recordedAt: Date }[], dayStart: Date): number {
  let total = 0
  for (const log of logs) {
    if (log.logType !== "WATER_INTAKE") continue
    if (log.recordedAt < dayStart) continue
    const v = log.value as { glasses?: number; ml?: number } | null
    total += Number(v?.glasses ?? (v?.ml ? Math.round(v.ml / 250) : 0) ?? 0)
  }
  return total
}

function latestSleepHours(logs: { logType: string; value: unknown }[]): number {
  const sleep = logs.find((l) => l.logType === "SLEEP")
  return Number((sleep?.value as { hours?: number } | null)?.hours ?? 0)
}

function avgSleepHours(logs: { logType: string; value: unknown }[]): number {
  const sleeps = logs.filter((l) => l.logType === "SLEEP")
  if (!sleeps.length) return 0
  const sum = sleeps.reduce((a, l) => a + Number((l.value as { hours?: number })?.hours ?? 0), 0)
  return Math.round((sum / sleeps.length) * 10) / 10
}

function modulePrompt(module: WellnessModuleKey): string {
  const base = `Return ONLY valid JSON:
{
  "recommendations": [
    { "id": "rec1", "message": "Personalized tip", "priority": "high|medium|low" }
  ],
  "challenges": [
    { "id": "ch1", "title": "Short title", "description": "Actionable challenge", "points": 10, "category": "movement|hydration|sleep|recovery" }
  ]
}
Generate 2-3 recommendations and exactly 3-4 challenges. Be specific to the user's data. Use encouraging, concise language.`

  if (module === "WALK") {
    return `You are an AI walking & activity coach. Analyze steps, energy, inactivity, sleep recovery, and vitals.
Suggest contextual activity like outdoor walks, post-dinner runs, stretch breaks when inactive.
${base}`
  }
  if (module === "WATER") {
    return `You are an AI hydration coach. Analyze water intake vs goal, activity level, time of day, and vitals.
Suggest when to drink, post-workout hydration, and catching up on goals.
${base}`
  }
  return `You are an AI sleep & recovery coach. Analyze sleep duration, consistency, hydration, evening activity.
Suggest bedtime adjustments, wind-down routines, screen-time limits, and recovery insights.
${base}`
}

function fallbackContent(module: WellnessModuleKey, ctx: Record<string, unknown>) {
  const steps = Number(ctx.todaySteps ?? 0)
  const water = Number(ctx.waterGlasses ?? 0)
  const waterGoal = Number(ctx.waterGoal ?? 8)
  const sleepH = Number(ctx.latestSleepHours ?? 0)
  const hour = Number(ctx.hour ?? 12)

  if (module === "WALK") {
    const recs: WellnessRecommendation[] =
      steps < 3000
        ? [
            { id: "fb-w1", message: "You've been inactive — a 10-minute walk can boost energy.", priority: "high" },
            { id: "fb-w2", message: "A 20-minute outdoor walk would be great for your current energy level.", priority: "medium" },
          ]
        : [
            { id: "fb-w1", message: `Great progress at ${steps.toLocaleString()} steps — a light evening stroll aids recovery.`, priority: "medium" },
            { id: "fb-w2", message: "Try a quick stretch break if you've been sitting for a while.", priority: "low" },
          ]
    const challenges: Omit<WellnessChallenge, "completed">[] = [
      { id: "fb-wc1", title: "5,000 steps before evening", description: "Hit 5,000 steps before 6 PM", points: 15, category: "movement" },
      { id: "fb-wc2", title: "Post-dinner walk", description: "Take a 20-minute walk after dinner", points: 20, category: "movement" },
      { id: "fb-wc3", title: "Movement break", description: "Stand and move for 5 minutes every 2 hours", points: 10, category: "movement" },
      { id: "fb-wc4", title: "Morning stretch", description: "Complete a 5-minute stretch routine", points: 10, category: "recovery" },
    ]
    return { recommendations: recs, challenges }
  }

  if (module === "WATER") {
    const behind = water < waterGoal / 2 && hour >= 14
    const recs: WellnessRecommendation[] = behind
      ? [
          { id: "fb-h1", message: "You are behind your hydration goal today — take a water break now.", priority: "high" },
          { id: "fb-h2", message: `You're only ${Math.max(0, waterGoal - water)} glasses away from today's goal.`, priority: "medium" },
        ]
      : [
          { id: "fb-h1", message: "Hydration levels look steady — keep sipping throughout the day.", priority: "medium" },
          { id: "fb-h2", message: "Drink a glass of water after your next activity session.", priority: "low" },
        ]
    const challenges: Omit<WellnessChallenge, "completed">[] = [
      { id: "fb-hc1", title: "Morning hydration", description: `Drink ${Math.min(2, waterGoal)} glasses before noon`, points: 10, category: "hydration" },
      { id: "fb-hc2", title: "Hourly sip", description: "Take 1 glass every 2 hours today", points: 15, category: "hydration" },
      { id: "fb-hc3", title: "Post-activity refill", description: "Drink 2 glasses after physical activity", points: 15, category: "hydration" },
      { id: "fb-hc4", title: "Evening catch-up", description: "Reach your full daily water goal", points: 20, category: "hydration" },
    ]
    return { recommendations: recs, challenges }
  }

  const recs: WellnessRecommendation[] =
    sleepH > 0 && sleepH < 6
      ? [
          { id: "fb-s1", message: "Sleeping 30 minutes earlier tonight may improve recovery.", priority: "high" },
          { id: "fb-s2", message: "Avoid screen time 1 hour before bed to improve sleep quality.", priority: "medium" },
        ]
      : [
          { id: "fb-s1", message: "Maintain the same bedtime tonight for better sleep consistency.", priority: "medium" },
          { id: "fb-s2", message: "A short evening walk may help improve sleep quality tonight.", priority: "low" },
        ]
  const challenges: Omit<WellnessChallenge, "completed">[] = [
    { id: "fb-sc1", title: "Consistent bedtime", description: "Be in bed within 30 min of your target time", points: 20, category: "sleep" },
    { id: "fb-sc2", title: "Wind-down routine", description: "15 minutes of screen-free relaxation before bed", points: 15, category: "sleep" },
    { id: "fb-sc3", title: "Sleep log", description: "Log last night's sleep duration", points: 10, category: "sleep" },
    { id: "fb-sc4", title: "Recovery goal", description: "Aim for 7+ hours of sleep tonight", points: 20, category: "recovery" },
  ]
  return { recommendations: recs, challenges }
}

async function buildContext(userId: string, activityContext?: Record<string, unknown>) {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const weekAgo = new Date(todayStart)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [vitals, todayLogs, weekLogs] = await Promise.all([
    prisma.healthVital.findUnique({ where: { userId } }),
    prisma.healthLog.findMany({
      where: { userId, recordedAt: { gte: todayStart } },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.healthLog.findMany({
      where: { userId, recordedAt: { gte: weekAgo } },
      orderBy: { recordedAt: "desc" },
      take: 100,
    }),
  ])

  const todaySteps = Math.max(
    stepsFromLogs(todayLogs),
    Number(activityContext?.todaySteps ?? 0)
  )
  const waterGlasses = waterGlassesToday(todayLogs, todayStart)
  const profile = await getOrCreateProfile(userId)
  const waterConfig = mergeWaterConfig(profile.waterConfig)
  const sleepConfig = mergeSleepConfig(profile.sleepConfig)

  return {
    date: dateKey(now),
    hour: now.getHours(),
    todaySteps,
    todayDistanceKm: Number(activityContext?.todayDistanceKm ?? 0),
    activeSeconds: Number(activityContext?.activeSeconds ?? 0),
    calories: Number(activityContext?.calories ?? 0),
    waterGlasses,
    waterGoal: waterConfig.dailyGoalGlasses,
    latestSleepHours: latestSleepHours(weekLogs),
    avgSleepHours: avgSleepHours(weekLogs.filter((l) => l.logType === "SLEEP")),
    vitals: vitals
      ? {
          weight: vitals.weight,
          height: vitals.height,
          bloodType: vitals.bloodType,
          chronicConditions: vitals.chronicConditions,
        }
      : null,
    sleepConfig,
    waterConfig,
  }
}

export function mergeWaterConfig(raw: unknown): WaterFrequencyConfig {
  const r = (raw || {}) as Partial<WaterFrequencyConfig>
  return { ...DEFAULT_WATER_CONFIG, ...r }
}

export function mergeSleepConfig(raw: unknown): SleepScheduleConfig {
  const r = (raw || {}) as Partial<SleepScheduleConfig>
  return { ...DEFAULT_SLEEP_CONFIG, ...r }
}

export function mergeWalkConfig(raw: unknown): WalkConfig {
  const r = (raw || {}) as Partial<WalkConfig>
  return { ...DEFAULT_WALK_CONFIG, ...r }
}

export async function getOrCreateProfile(userId: string) {
  return prisma.wellnessModuleProfile.upsert({
    where: { userId },
    create: {
      userId,
      walkConfig: DEFAULT_WALK_CONFIG,
      waterConfig: DEFAULT_WATER_CONFIG,
      sleepConfig: DEFAULT_SLEEP_CONFIG,
      gamification: {},
    },
    update: {},
  })
}

function readGamification(raw: unknown): Record<string, ModuleGamification & { lastActiveDate?: string }> {
  return (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    ModuleGamification & { lastActiveDate?: string }
  >
}

function computeCompletionPct(challenges: WellnessChallenge[]): number {
  if (!challenges.length) return 0
  return Math.round((challenges.filter((c) => c.completed).length / challenges.length) * 100)
}

function computeBadges(module: WellnessModuleKey, streak: number, totalPoints: number): string[] {
  const badges: string[] = []
  if (streak >= 3) badges.push("3-Day Streak")
  if (streak >= 7) badges.push("Week Warrior")
  if (totalPoints >= 100) badges.push("Century Club")
  if (module === "WALK" && totalPoints >= 200) badges.push("Step Champion")
  if (module === "WATER" && totalPoints >= 200) badges.push("Hydration Hero")
  if (module === "SLEEP" && totalPoints >= 200) badges.push("Rest Master")
  return badges
}

function buildGamificationView(
  module: WellnessModuleKey,
  profileGamification: Record<string, ModuleGamification & { lastActiveDate?: string }>,
  daily: { pointsEarned: number; challenges: WellnessChallenge[] }
): ModuleGamification {
  const stored = profileGamification[module] || { points: 0, streak: 0, totalPoints: 0 }
  const completionPct = computeCompletionPct(daily.challenges)
  const totalPoints = (stored.totalPoints ?? stored.points ?? 0) + daily.pointsEarned
  return {
    points: daily.pointsEarned,
    streak: stored.streak ?? 0,
    completionPct,
    badges: computeBadges(module, stored.streak ?? 0, totalPoints),
    totalPoints,
  }
}

async function generateWithAi(
  module: WellnessModuleKey,
  context: Record<string, unknown>
): Promise<{ recommendations: WellnessRecommendation[]; challenges: Omit<WellnessChallenge, "completed">[] }> {
  try {
    const aiResponse = await analyzeWithAI(
      "GENERAL_ANALYSIS" as AIUseCase,
      { module, context },
      {
        category: "TEXT_TO_TEXT",
        customPrompt: `${modulePrompt(module)}\n\nUser context:\n${JSON.stringify(context, null, 2)}`,
        maxTokens: 1200,
      }
    )
    if (!aiResponse.content) return fallbackContent(module, context)
    const parsed = parseAiJson(aiResponse.content)
    if (!parsed) return fallbackContent(module, context)

    const recommendations = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
      .slice(0, 3)
      .map((r: any, i: number) => ({
        id: String(r.id || `ai-rec-${i}`),
        message: String(r.message || r.text || "Stay consistent with your wellness goals today."),
        priority: (["high", "medium", "low"].includes(r.priority) ? r.priority : "medium") as WellnessRecommendation["priority"],
      }))

    const challenges = (Array.isArray(parsed.challenges) ? parsed.challenges : [])
      .slice(0, 4)
      .map((c: any, i: number) => ({
        id: String(c.id || `ai-ch-${i}`),
        title: String(c.title || `Challenge ${i + 1}`),
        description: String(c.description || c.title || "Complete this wellness challenge"),
        points: Math.min(50, Math.max(5, Number(c.points) || 10)),
        category: String(c.category || module.toLowerCase()),
      }))

    if (!recommendations.length || !challenges.length) return fallbackContent(module, context)
    return { recommendations, challenges }
  } catch {
    return fallbackContent(module, context)
  }
}

async function getOrGenerateDaily(
  userId: string,
  module: WellnessModuleKey,
  activityContext?: Record<string, unknown>,
  forceRefresh = false
) {
  const today = dateKey()
  const profile = await getOrCreateProfile(userId)
  const gamificationStore = readGamification(profile.gamification)

  let daily = await prisma.wellnessModuleDaily.findUnique({
    where: { userId_module_dateKey: { userId, module: module as WellnessModule, dateKey: today } },
  })

  if (!daily || forceRefresh) {
    const context = await buildContext(userId, activityContext)
    const generated = await generateWithAi(module, context)
    const challenges = generated.challenges.map((c) => ({ ...c, completed: false }))

    daily = await prisma.wellnessModuleDaily.upsert({
      where: { userId_module_dateKey: { userId, module: module as WellnessModule, dateKey: today } },
      create: {
        userId,
        module: module as WellnessModule,
        dateKey: today,
        recommendations: generated.recommendations,
        challenges,
        completedIds: [],
        pointsEarned: 0,
      },
      update: forceRefresh
        ? {
            recommendations: generated.recommendations,
            challenges,
            completedIds: [],
            pointsEarned: 0,
            generatedAt: new Date(),
          }
        : {},
    })
  }

  const completedSet = new Set(daily.completedIds)
  const challenges = (daily.challenges as WellnessChallenge[]).map((c) => ({
    ...c,
    completed: completedSet.has(c.id) || Boolean(c.completed),
  }))

  return {
    module,
    dateKey: today,
    recommendations: daily.recommendations as WellnessRecommendation[],
    challenges,
    gamification: buildGamificationView(module, gamificationStore, {
      pointsEarned: daily.pointsEarned,
      challenges,
    }),
    config:
      module === "WALK"
        ? mergeWalkConfig(profile.walkConfig)
        : module === "WATER"
          ? mergeWaterConfig(profile.waterConfig)
          : mergeSleepConfig(profile.sleepConfig),
  }
}

export async function getWellnessModulesState(
  userId: string,
  activityContext?: Record<string, unknown>,
  forceRefresh = false
) {
  const modules = await Promise.all(
    MODULES.map((m) => getOrGenerateDaily(userId, m, activityContext, forceRefresh))
  )
  return { modules, generatedAt: new Date().toISOString() }
}

export async function completeWellnessChallenge(
  userId: string,
  module: WellnessModuleKey,
  challengeId: string
) {
  const today = dateKey()
  const daily = await prisma.wellnessModuleDaily.findUnique({
    where: { userId_module_dateKey: { userId, module: module as WellnessModule, dateKey: today } },
  })
  if (!daily) throw new Error("No daily challenges found")

  if (daily.completedIds.includes(challengeId)) {
    return getOrGenerateDaily(userId, module)
  }

  const challenges = daily.challenges as WellnessChallenge[]
  const challenge = challenges.find((c) => c.id === challengeId)
  if (!challenge) throw new Error("Challenge not found")

  const completedIds = [...daily.completedIds, challengeId]
  const pointsEarned = daily.pointsEarned + (challenge.points || 10)
  const updatedChallenges = challenges.map((c) =>
    c.id === challengeId ? { ...c, completed: true } : c
  )

  await prisma.wellnessModuleDaily.update({
    where: { id: daily.id },
    data: { completedIds, pointsEarned, challenges: updatedChallenges },
  })

  const profile = await getOrCreateProfile(userId)
  const gamificationStore = readGamification(profile.gamification)
  const prev = gamificationStore[module] || { streak: 0, totalPoints: 0, points: 0 }
  const yesterday = yesterdayKey()
  const yesterdayDaily = await prisma.wellnessModuleDaily.findUnique({
    where: { userId_module_dateKey: { userId, module: module as WellnessModule, dateKey: yesterday } },
  })
  const yesterdayDone =
    yesterdayDaily &&
    yesterdayDaily.completedIds.length >=
      Math.ceil(((yesterdayDaily.challenges as WellnessChallenge[]) || []).length * 0.5)

  let streak = prev.streak ?? 0
  if (prev.lastActiveDate === today) {
    /* same day */
  } else if (prev.lastActiveDate === yesterday && yesterdayDone) {
    streak += 1
  } else if (prev.lastActiveDate !== today) {
    streak = 1
  }

  const totalPoints = (prev.totalPoints ?? 0) + (challenge.points || 10)
  gamificationStore[module] = {
    ...prev,
    streak,
    totalPoints,
    points: pointsEarned,
    lastActiveDate: today,
    completionPct: computeCompletionPct(updatedChallenges),
    badges: computeBadges(module, streak, totalPoints),
  }

  await prisma.wellnessModuleProfile.update({
    where: { userId },
    data: { gamification: gamificationStore },
  })

  return getOrGenerateDaily(userId, module)
}

export async function updateWellnessConfig(
  userId: string,
  module: WellnessModuleKey,
  config: Record<string, unknown>
) {
  const profile = await getOrCreateProfile(userId)
  const data: Record<string, unknown> = {}
  if (module === "WALK") data.walkConfig = { ...mergeWalkConfig(profile.walkConfig), ...config }
  if (module === "WATER") data.waterConfig = { ...mergeWaterConfig(profile.waterConfig), ...config }
  if (module === "SLEEP") data.sleepConfig = { ...mergeSleepConfig(profile.sleepConfig), ...config }

  await prisma.wellnessModuleProfile.update({
    where: { userId },
    data,
  })

  return getOrGenerateDaily(userId, module)
}

export async function listUsersWithWellnessReminders() {
  const [profiles, vitalUsers] = await Promise.all([
    prisma.wellnessModuleProfile.findMany({
      select: {
        userId: true,
        waterConfig: true,
        sleepConfig: true,
        walkConfig: true,
        user: { select: { userSettings: { select: { pushNotifications: true } } } },
      },
      take: 2000,
    }),
    prisma.healthVital.findMany({
      select: { userId: true, user: { select: { userSettings: { select: { pushNotifications: true } } } } },
      take: 2000,
    }),
  ])

  const byUser = new Map(profiles.map((p) => [p.userId, p]))
  for (const v of vitalUsers) {
    if (!byUser.has(v.userId)) {
      const created = await getOrCreateProfile(v.userId)
      byUser.set(v.userId, {
        userId: v.userId,
        waterConfig: created.waterConfig,
        sleepConfig: created.sleepConfig,
        walkConfig: created.walkConfig,
        user: v.user,
      })
    }
  }
  return Array.from(byUser.values())
}
