import { prisma } from "@/lib/prisma"

const PRE_CHECKOUT_PREFIXES = ["cart-", "pending-"] as const

export function isPreCheckoutClientRef(clientRef: string): boolean {
  return PRE_CHECKOUT_PREFIXES.some((p) => clientRef.startsWith(p))
}

/**
 * Resolves or creates a Prisma `Payment` row for checkout-before-order flows.
 * Stripe/webhooks use `Payment.id` in metadata as `orderId` — must never be a cart placeholder.
 * For `cart-*` / `pending-*` refs, `Payment.orderId` stays null until pharmacy/cart checkout links the real order.
 */
export async function resolvePendingCheckoutPayment(params: {
  userId: string
  clientRef: string
  amount: number
  currency: string
  gateway: string
  description?: string | null
  baseMetadata: Record<string, unknown>
}) {
  const { userId, clientRef, amount, currency, gateway, description, baseMetadata } = params

  const existingByPaymentId = await prisma.payment.findFirst({
    where: { id: clientRef, userId },
  })
  if (existingByPaymentId) {
    return existingByPaymentId
  }

  const linkedOrder = await prisma.order.findFirst({
    where: { id: clientRef, customerId: userId },
    select: { id: true },
  })
  if (linkedOrder) {
    return prisma.payment.create({
      data: {
        userId,
        amount,
        currency,
        status: "PENDING",
        gateway,
        orderId: clientRef,
        description: description ?? undefined,
        metadata: baseMetadata as object,
      },
    })
  }

  if (!isPreCheckoutClientRef(clientRef)) {
    throw new Error("Invalid payment reference")
  }

  const existingPending = await prisma.payment.findFirst({
    where: {
      userId,
      status: "PENDING",
      orderId: null,
      metadata: { path: ["clientCheckoutRef"], equals: clientRef },
    },
    orderBy: { createdAt: "desc" },
  })

  const mergedForPending = {
    ...baseMetadata,
    clientCheckoutRef: clientRef,
  }

  if (existingPending) {
    await prisma.payment.update({
      where: { id: existingPending.id },
      data: {
        amount,
        currency,
        gateway,
        description: description ?? existingPending.description,
        metadata: mergedForPending as object,
      },
    })
    return prisma.payment.findFirstOrThrow({ where: { id: existingPending.id } })
  }

  return prisma.payment.create({
    data: {
      userId,
      amount,
      currency,
      status: "PENDING",
      gateway,
      orderId: null,
      description: description ?? undefined,
      metadata: mergedForPending as object,
    },
  })
}
