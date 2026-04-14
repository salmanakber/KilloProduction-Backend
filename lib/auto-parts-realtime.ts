import { getGlobalSocketServer } from "@/lib/socket-server"

/** Customer / mechanic quote lifecycle (request, submit, accept). */
export function emitAutoPartsQuoteSocket(
  userId: string,
  payload: Record<string, unknown> & { quoteId: string }
) {
  try {
    void getGlobalSocketServer().sendNotificationToUser(userId, {
      type: "auto_parts_quote_update",
      ...payload,
    })
  } catch (e) {
    console.error("auto_parts_quote_update socket:", e)
  }
}

/** Customer: new mechanic offer on a service request (part flow or standalone). */
export function emitAutoPartsMechanicOfferSocket(
  customerUserId: string,
  payload: {
    offerId: string
    serviceRequestId: string
    partRequestId?: string | null
  }
) {
  try {
    void getGlobalSocketServer().sendNotificationToUser(customerUserId, {
      type: "auto_parts_mechanic_offer",
      ...payload,
    })
  } catch (e) {
    console.error("auto_parts_mechanic_offer socket:", e)
  }
}

/** Vendor: new part request in their market (optional targeted refresh). */
export function emitAutoPartsRequestToVendor(vendorUserId: string, requestId: string) {
  try {
    void getGlobalSocketServer().sendNotificationToUser(vendorUserId, {
      type: "auto_parts_request_update",
      requestId,
      event: "new_request",
    })
  } catch (e) {
    console.error("auto_parts_request_update socket:", e)
  }
}

/** Mechanic: invited to a part-request job (notify-mechanics). */
export function emitAutoPartsServiceRequestInviteSocket(
  mechanicUserId: string,
  payload: { serviceRequestId: string; partRequestId?: string; offerId?: string }
) {
  try {
    void getGlobalSocketServer().sendNotificationToUser(mechanicUserId, {
      type: "auto_parts_service_request_invite",
      ...payload,
    })
  } catch (e) {
    console.error("auto_parts_service_request_invite socket:", e)
  }
}
