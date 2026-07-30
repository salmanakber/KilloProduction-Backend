import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAjoGroupForUser, notifyAjoMember } from "@/lib/ajo-service"
import { socketIOServer } from "@/lib/socket-server"

const chatMessageInclude = {
  sender: { select: { id: true, name: true, avatar: true } },
  poll: {
    include: {
      votes: true,
      createdBy: { select: { id: true, name: true } },
    },
  },
  replyTo: {
    include: {
      sender: { select: { id: true, name: true, avatar: true } },
    },
  },
} satisfies Prisma.AjoChatMessageInclude

function assertMember(group: NonNullable<Awaited<ReturnType<typeof getAjoGroupForUser>>>, userId: string) {
  const ok = group.members.some(
    (m) => m.userId === userId && (m.status === "ACTIVE" || m.status === "INVITED"),
  )
  if (!ok && group.creatorId !== userId) throw new Error("Not a group member")
}

function isGroupAdmin(
  group: NonNullable<Awaited<ReturnType<typeof getAjoGroupForUser>>>,
  userId: string,
) {
  if (group.creatorId === userId) return true
  const membership = group.members.find((m) => m.userId === userId)
  return membership?.role === "CREATOR" || membership?.role === "ADMIN"
}

function emitAjoChat(groupId: string, message: ReturnType<typeof serializeChatMessage>) {
  try {
    socketIOServer.emitToAjoGroupChatRoom(groupId, "ajo_chat_message", {
      groupId,
      message,
    })
  } catch (e) {
    console.error("Ajo chat socket emit failed:", e)
  }
}

function emitAjoPollUpdate(groupId: string, poll: ReturnType<typeof serializePoll>) {
  try {
    socketIOServer.emitToAjoGroupChatRoom(groupId, "ajo_poll_update", {
      groupId,
      poll,
    })
  } catch (e) {
    console.error("Ajo poll socket emit failed:", e)
  }
}

function emitAjoPinUpdate(groupId: string, pinnedMessage: ReturnType<typeof serializeChatMessage> | null) {
  try {
    socketIOServer.emitToAjoGroupChatRoom(groupId, "ajo_chat_pin_update", {
      groupId,
      pinnedMessage,
    })
  } catch (e) {
    console.error("Ajo chat pin socket emit failed:", e)
  }
}

async function loadPinnedMessage(groupId: string, viewerId: string) {
  const group = await prisma.ajoGroup.findUnique({
    where: { id: groupId },
    select: { pinnedMessageId: true },
  })
  if (!group?.pinnedMessageId) return null

  const message = await prisma.ajoChatMessage.findFirst({
    where: { id: group.pinnedMessageId, groupId },
    include: chatMessageInclude,
  })
  return message ? serializeChatMessage(message, viewerId) : null
}

export async function listAjoChatMessages(groupId: string, userId: string, opts?: { limit?: number; before?: string }) {
  const group = await getAjoGroupForUser(groupId, userId)
  if (!group) throw new Error("Group not found")
  assertMember(group, userId)

  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100)
  const messages = await prisma.ajoChatMessage.findMany({
    where: {
      groupId,
      ...(opts?.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: chatMessageInclude,
  })

  const pinnedMessage = await loadPinnedMessage(groupId, userId)

  return {
    messages: messages.reverse().map((m) => serializeChatMessage(m, userId)),
    pinnedMessage,
    viewer: {
      isAdmin: isGroupAdmin(group, userId),
    },
  }
}

export async function sendAjoChatMessage(args: {
  groupId: string
  userId: string
  content: string
  replyToMessageId?: string
  mentionUserIds?: string[]
}) {
  const group = await getAjoGroupForUser(args.groupId, args.userId)
  if (!group) throw new Error("Group not found")
  assertMember(group, args.userId)

  const content = args.content.trim()
  if (!content) throw new Error("Message cannot be empty")
  if (content.length > 2000) throw new Error("Message is too long")

  if (args.replyToMessageId) {
    const parent = await prisma.ajoChatMessage.findFirst({
      where: { id: args.replyToMessageId, groupId: args.groupId },
    })
    if (!parent) throw new Error("Reply target not found")
  }

  const activeMemberIds = new Set(
    group.members
      .filter((m) => m.status === "ACTIVE" || m.status === "INVITED")
      .map((m) => m.userId),
  )
  activeMemberIds.add(group.creatorId)

  const mentionUserIds = Array.from(
    new Set((args.mentionUserIds ?? []).filter((id) => activeMemberIds.has(id) && id !== args.userId)),
  )

  const message = await prisma.ajoChatMessage.create({
    data: {
      groupId: args.groupId,
      senderId: args.userId,
      content,
      type: "TEXT",
      replyToMessageId: args.replyToMessageId || null,
      mentionUserIds: mentionUserIds as Prisma.InputJsonValue,
    },
    include: chatMessageInclude,
  })

  const serialized = serializeChatMessage(message, args.userId)
  emitAjoChat(args.groupId, serialized)

  for (const mentionedId of mentionUserIds) {
    await notifyAjoMember({
      userId: mentionedId,
      title: "Mentioned in group chat",
      body: `${message.sender?.name || "Someone"} mentioned you in ${group.name}`,
      data: {
        type: "ajo_chat_mention",
        groupId: group.id,
        messageId: message.id,
        actionType: "navigate",
        screen: "AjoGroupChat",
      },
    })
  }

  return serialized
}

export async function pinAjoChatMessage(args: {
  groupId: string
  userId: string
  messageId: string
}) {
  const group = await getAjoGroupForUser(args.groupId, args.userId)
  if (!group) throw new Error("Group not found")
  if (!isGroupAdmin(group, args.userId)) throw new Error("Only group admins can pin messages")

  const message = await prisma.ajoChatMessage.findFirst({
    where: { id: args.messageId, groupId: args.groupId },
    include: chatMessageInclude,
  })
  if (!message) throw new Error("Message not found")

  await prisma.ajoGroup.update({
    where: { id: args.groupId },
    data: {
      pinnedMessageId: message.id,
      pinnedAt: new Date(),
      pinnedById: args.userId,
    },
  })

  const serialized = serializeChatMessage(message, args.userId)
  emitAjoPinUpdate(args.groupId, serialized)
  return serialized
}

export async function unpinAjoChatMessage(args: { groupId: string; userId: string }) {
  const group = await getAjoGroupForUser(args.groupId, args.userId)
  if (!group) throw new Error("Group not found")
  if (!isGroupAdmin(group, args.userId)) throw new Error("Only group admins can unpin messages")

  await prisma.ajoGroup.update({
    where: { id: args.groupId },
    data: {
      pinnedMessageId: null,
      pinnedAt: null,
      pinnedById: null,
    },
  })

  emitAjoPinUpdate(args.groupId, null)
  return { success: true }
}

export async function createAjoPoll(args: {
  groupId: string
  userId: string
  question: string
  options: string[]
}) {
  const group = await getAjoGroupForUser(args.groupId, args.userId)
  if (!group) throw new Error("Group not found")
  assertMember(group, args.userId)

  const question = args.question.trim()
  if (!question) throw new Error("Question is required")
  const labels = args.options.map((o) => o.trim()).filter(Boolean)
  if (labels.length < 2 || labels.length > 6) throw new Error("Provide 2–6 poll options")

  const options = labels.map((label, i) => ({
    id: `opt_${i + 1}`,
    label,
  }))

  const poll = await prisma.ajoPoll.create({
    data: {
      groupId: args.groupId,
      createdById: args.userId,
      question,
      options: options as Prisma.InputJsonValue,
      status: "OPEN",
    },
  })

  const message = await prisma.ajoChatMessage.create({
    data: {
      groupId: args.groupId,
      senderId: args.userId,
      content: `📊 Poll: ${question}`,
      type: "TEXT",
      pollId: poll.id,
    },
    include: chatMessageInclude,
  })

  for (const m of group.members.filter((x) => x.status === "ACTIVE" && x.userId !== args.userId)) {
    await notifyAjoMember({
      userId: m.userId,
      title: "New group poll",
      body: `${question} — vote in ${group.name}`,
      data: {
        type: "ajo_poll",
        groupId: group.id,
        actionType: "navigate",
        screen: "AjoGroupChat",
      },
    })
  }

  const serialized = serializeChatMessage(message, args.userId)
  emitAjoChat(args.groupId, serialized)
  return serialized
}

export async function voteAjoPoll(args: {
  groupId: string
  userId: string
  pollId: string
  optionId: string
}) {
  const group = await getAjoGroupForUser(args.groupId, args.userId)
  if (!group) throw new Error("Group not found")
  assertMember(group, args.userId)

  const poll = await prisma.ajoPoll.findFirst({
    where: { id: args.pollId, groupId: args.groupId },
  })
  if (!poll) throw new Error("Poll not found")
  if (poll.status !== "OPEN") throw new Error("This poll is closed")

  const options = (Array.isArray(poll.options) ? poll.options : []) as Array<{ id: string; label: string }>
  if (!options.some((o) => o.id === args.optionId)) throw new Error("Invalid option")

  await prisma.ajoPollVote.upsert({
    where: { pollId_userId: { pollId: args.pollId, userId: args.userId } },
    create: { pollId: args.pollId, userId: args.userId, optionId: args.optionId },
    update: { optionId: args.optionId },
  })

  const updated = await prisma.ajoPoll.findUnique({
    where: { id: args.pollId },
    include: {
      votes: true,
      createdBy: { select: { id: true, name: true } },
    },
  })

  const serialized = serializePoll(updated!, args.userId)
  emitAjoPollUpdate(args.groupId, serialized)
  return serialized
}

function serializePoll(
  poll: {
    id: string
    question: string
    options: unknown
    status: string
    createdAt: Date
    createdBy?: { id: string; name: string | null } | null
    votes: Array<{ userId: string; optionId: string }>
  },
  viewerId?: string,
) {
  const options = (Array.isArray(poll.options) ? poll.options : []) as Array<{ id: string; label: string }>
  const counts: Record<string, number> = {}
  for (const o of options) counts[o.id] = 0
  for (const v of poll.votes) {
    counts[v.optionId] = (counts[v.optionId] || 0) + 1
  }
  return {
    id: poll.id,
    question: poll.question,
    status: poll.status,
    createdAt: poll.createdAt.toISOString(),
    createdBy: poll.createdBy,
    options: options.map((o) => ({
      ...o,
      votes: counts[o.id] || 0,
    })),
    totalVotes: poll.votes.length,
    myVoteOptionId: viewerId
      ? poll.votes.find((v) => v.userId === viewerId)?.optionId ?? null
      : null,
  }
}

function serializeChatMessage(message: any, viewerId?: string) {
  const poll = message.poll ? serializePoll(message.poll, viewerId) : null
  const mentionUserIds = Array.isArray(message.mentionUserIds) ? message.mentionUserIds : []
  return {
    id: message.id,
    groupId: message.groupId,
    content: message.content,
    type: message.type,
    createdAt: message.createdAt.toISOString(),
    sender: message.sender,
    poll,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          content: message.replyTo.content,
          sender: message.replyTo.sender,
        }
      : null,
    mentionUserIds,
  }
}
