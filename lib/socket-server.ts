// lib/socket-server.ts
import { Server as IOServer, Socket } from "socket.io";
import { verifyToken } from "@/lib/auth";
import { prisma } from "./prisma";
import { eventBus } from "./event-bus";
import { fetchRider } from "./services/riderService";
import { NotificationBridge } from "./notification-bridge";
import {
  buildRiderServiceFilter,
} from "@/lib/rider-request-eligibility";
import {
  extractRequestType,
  extractRequestVehicleType,
  isRequestListingExpired,
  isScheduledRequestVisible,
  shouldBroadcastRequestToRider,
} from "@/lib/rider-available-requests-shared";
import { getTripShareSnapshotByToken, tripShareRoom } from "@/lib/ride-trip-share";

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    role?: string;
    authToken?: string;
    [key: string]: any;
  };
}

const ADMIN_BOOKINGS_MONITOR_ROOM = "admin:bookings_monitor";

function tokenFromHandshake(socket: AuthenticatedSocket): string | null {
  const authTok = (socket.handshake.auth as { token?: string })?.token;
  if (authTok) return String(authTok);
  const queryTok = (socket.handshake.query as { token?: string })?.token;
  if (queryTok) return String(queryTok);
  const cookie = socket.handshake.headers.cookie;
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)admin-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

class SocketIOServer {
  private io: IOServer | null = null;
  private clients = new Map<string, AuthenticatedSocket>();
  private clientsCheckInterval: NodeJS.Timeout | null = null;
  private totalConnections = 0;
  public authUsers = new Map<string, AuthenticatedSocket>();
  private userSockets = new Map<string, Set<AuthenticatedSocket>>();

  initialize(server: any) {
    if (!server) {
      return;
    }

    const g = globalThis as typeof globalThis & {
      __killoHttpServer?: any;
      __killoSocketIOServer?: SocketIOServer;
      __socketIOServer?: SocketIOServer;
    };
    g.__killoHttpServer = server;
    g.__killoSocketIOServer = this;
    g.__socketIOServer = this;

    if (server.io) {
      this.io = server.io as IOServer;
    } else if (!this.io) {
      this.io = new IOServer(server, {
        path: "/api/socketio",
        cors: { origin: process.env.SOCKET_CORS_ORIGIN || "*" },
        pingInterval: 25000,
        pingTimeout: 120000,
        transports: ["websocket", "polling"],
        allowUpgrades: true,
      });
      server.io = this.io;
    }

    if ((server as any).__socketIOServerInitialized) {
      this.reconcileConnectionsFromIo();
      return;
    }
    (server as any).__socketIOServerInitialized = true;

    // Handshake authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = tokenFromHandshake(socket);
        if (!token) {
          return next();
        }

        const payload = await verifyToken(token);
        if (!payload?.userId) return next(new Error("Invalid token"));

        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, role: true },
        });
        if (!user) return next(new Error("User not found"));

        socket.data.userId = user.id;
        socket.data.role = user.role;
        socket.data.authToken = token;
        this.clients.set(socket.id, socket);
        this.addUserSocket( user.id, socket);  

        next();
      } catch (err) {
        return next(new Error("Authentication failed"));
      }
    });

    // Connection
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      this.totalConnections++;
      this.clients.set(socket.id, socket);
      if (socket.data?.userId) {
        this.joinAuthenticatedUserRooms(socket);
        this.addUserSocket(socket.data.userId, socket);
    
        socket.emit("authenticated", {
          success: true,
          userId: socket.data.userId,
          role: socket.data.role,
        });
        void this._sendInitialEvents(socket, socket.data.userId);
        void this._notifyUserPresence(socket.data.userId, true);
      }

      // Fallback event-based authentication
      socket.on("authenticate", async (payload: { token: string }, ack?: Function) => {
        try {
          const verified = await verifyToken(payload.token);
          if (!verified?.userId) throw new Error("Invalid token");

          const user = await prisma.user.findUnique({
            where: { id: verified.userId },
            select: { id: true, role: true },
          });
          if (!user) throw new Error("User not found");

          socket.data.userId = user.id;
          socket.data.role = user.role;
          socket.data.authToken = payload.token;
          this.clients.set(socket.id, socket)
          this.addUserSocket(user.id, socket)
          this.joinAuthenticatedUserRooms(socket);

          ack?.({ ok: true });
          socket.emit("authenticated", { userId: user.id, role: user.role, success: true });
          void this._sendInitialEvents(socket, user.id);
          void this._notifyUserPresence(user.id, true);
        } catch (e: any) {
          ack?.({ ok: false, error: e.message });
          socket.emit("auth_error", { message: e.message });
        }
      });

      socket.on("property_chat_subscribe", (payload: { conversationId?: string }) => {
        const cid = typeof payload?.conversationId === "string" ? payload.conversationId : null;
        if (cid && socket.connected && socket.data?.userId) {
          socket.join(`prop_chat:${cid}`);
          socket.emit("property_chat_subscribed", { conversationId: cid });
        }
      });

      socket.on("property_chat_unsubscribe", (payload: { conversationId?: string }) => {
        const cid = typeof payload?.conversationId === "string" ? payload.conversationId : null;
        if (cid && socket.connected) {
          socket.leave(`prop_chat:${cid}`);
        }
      });

      socket.on("auto_parts_subscribe", (payload: { requestId?: string }) => {
        const rid = typeof payload?.requestId === "string" ? payload.requestId : null;
        if (rid && socket.connected) {
          socket.join(`ap_req:${rid}`);
          socket.emit("auto_parts_subscribed", { requestId: rid });
        }
      });
      socket.on("auto_parts_subscribe_quote", (payload: { quoteId?: string }) => {
        const qid = typeof payload?.quoteId === "string" ? payload.quoteId : null;
        if (qid && socket.connected) {
          socket.join(`ap_quote:${qid}`);
          socket.emit("auto_parts_subscribed_quote", { quoteId: qid });
        }
      });
      
      socket.on("auto_parts_unsubscribe", (payload: { requestId?: string }) => {
        const rid = typeof payload?.requestId === "string" ? payload.requestId : null;
        if (rid) socket.leave(`ap_req:${rid}`);
      });
      socket.on("auto_parts_unsubscribe_quote", (payload: { quoteId?: string }) => {
        const qid = typeof payload?.quoteId === "string" ? payload.quoteId : null;
        if (qid) socket.leave(`ap_quote:${qid}`);
      });

      socket.on("join_rider_dispatch", (payload: { riderUserId?: string }) => {
        const riderUserId = payload?.riderUserId || socket.data?.userId;
        if (
          socket.data?.role === "RIDER" &&
          riderUserId &&
          riderUserId === socket.data?.userId
        ) {
          socket.join(`rider_dispatch:${socket.data.userId}`);
          socket.join("riders:online");
          this.emitRiderStatusChange(riderUserId, true, socket);
        }
      });

      socket.on("leave_rider_dispatch", (payload: { riderUserId?: string }) => {
        const riderUserId = payload?.riderUserId || socket.data?.userId;
        if (riderUserId && riderUserId === socket.data?.userId) {
          socket.leave(`rider_dispatch:${socket.data.userId}`);
          this.emitRiderStatusChange(riderUserId, false, socket);
        }
      });

      socket.on("join_app_presence", () => {
        if (!socket.data?.userId) return;
        this.joinAuthenticatedUserRooms(socket);
      });

      /** Family / friends: track trip with temporary share token (no login). */
      socket.on(
        "join_trip_share",
        async (payload: { token?: string }, ack?: (res: unknown) => void) => {
          try {
            const token = String(payload?.token || "").trim();
            if (!token) {
              ack?.({ ok: false, error: "Missing token" });
              return;
            }
            const snapshot = await getTripShareSnapshotByToken(token);
            if (!snapshot?.trip) {
              ack?.({ ok: false, error: "Invalid or expired link" });
              return;
            }
            const room = tripShareRoom(snapshot.trip.bookingId);
            socket.join(room);
            socket.data.tripShareToken = token;
            socket.data.tripShareBookingId = snapshot.trip.bookingId;
            ack?.({ ok: true, trip: snapshot.trip, expiresAt: snapshot.expiresAt });
            socket.emit("trip_share_update", snapshot.trip);
          } catch (e: any) {
            ack?.({ ok: false, error: e?.message || "Failed to join" });
          }
        },
      );

      socket.on("leave_trip_share", () => {
        const bookingId = socket.data?.tripShareBookingId;
        if (bookingId) {
          socket.leave(tripShareRoom(String(bookingId)));
        }
        delete socket.data.tripShareToken;
        delete socket.data.tripShareBookingId;
      });

      /** Admin live bookings map — uses httpOnly admin-token cookie via withCredentials. */
      socket.on("join_admin_bookings_monitor", (_payload: unknown, ack?: (res: unknown) => void) => {
        const role = socket.data?.role;
        if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
          ack?.({ ok: false, error: "Admin access required" });
          return;
        }
        socket.join(ADMIN_BOOKINGS_MONITOR_ROOM);
        ack?.({ ok: true });
      });

      socket.on("leave_admin_bookings_monitor", () => {
        socket.leave(ADMIN_BOOKINGS_MONITOR_ROOM);
      });

      socket.on("rider_status_change", (payload: { riderUserId?: string; riderId?: string; isOnline?: boolean; status?: string }) => {
        if (socket.data?.role !== "RIDER" || !socket.data?.userId) return;
        const riderUserId = payload?.riderUserId || payload?.riderId || socket.data.userId;
        if (riderUserId !== socket.data.userId) return;
        const isOnline =
          typeof payload?.isOnline === "boolean"
            ? payload.isOnline
            : String(payload?.status || "").toLowerCase() === "online";
        this.emitRiderStatusChange(riderUserId, isOnline, socket);
      });

      /**
       * Client-initiated refresh (after mutations or when backend emit may be delayed).
       * Re-broadcasts to part-request room and/or pings the same user for quote / service request lists.
       */
      socket.on(
        "auto_parts_client_refresh",
        (payload: {
          requestId?: string;
          quoteId?: string;
          serviceRequestId?: string;
          orderId?: string;
        }) => {

          
          
          const uid = socket.data?.userId;

          if (!uid) return;
          if (payload?.requestId) {
            this.emitAutoPartsRequestRoom(payload.requestId, {
              type: "client_refresh",
              triggeredBy: uid,
            });
          }
          if (payload?.quoteId) {
            void this.sendNotificationToUser(uid, {
              type: "auto_parts_quote_update",
              quoteId: payload.quoteId,
              event: "client_refresh",
            });
            this.emitAutoPartsQuoteRoom(payload.quoteId, {
              type: "client_refresh",
              triggeredBy: uid,
            });
          }
          if (payload?.serviceRequestId) {
            void this.sendNotificationToUser(uid, {
              type: "auto_parts_service_request_refresh",
              serviceRequestId: payload.serviceRequestId,
              event: "client_refresh",
            });
            this.emitAutoPartsServiceRequestRoom(payload.serviceRequestId, {
              type: "client_refresh",
              triggeredBy: uid,
            });
          }
          /** Mechanic (or other party) pings customer + every vendor on the order cluster (same shape as broadcast). */
          if (payload?.orderId) {
            void (async () => {
              try {
                const ord = await prisma.order.findFirst({
                  where: { id: payload.orderId, module: "AUTO_PARTS" },
                  select: { id: true, customerId: true, vendorId: true, isChildOrder: true, childId: true },
                });
                if (!ord) return;
                const parentId = ord.isChildOrder && ord.childId ? ord.childId : ord.id;
                const parentRow = await prisma.order.findUnique({
                  where: { id: parentId },
                  select: { customerId: true },
                });
                const customerId = parentRow?.customerId || ord.customerId;
                const cluster = await prisma.order.findMany({
                  where: {
                    OR: [{ id: parentId }, { childId: parentId, isChildOrder: true }],
                  },
                  select: { id: true, vendorId: true },
                });
                const relatedOrderIds = Array.from(new Set(cluster.map((c) => c.id)));
                const vendorUserIds = Array.from(
                  new Set(cluster.map((c) => c.vendorId).filter((id): id is string => Boolean(id)))
                );

                const pingPayload = {
                  type: "auto_parts_order_update" as const,
                  orderId: parentId,
                  parentOrderId: parentId,
                  scannedOrderId: ord.id,
                  relatedOrderIds,
                  childOrderId: ord.isChildOrder ? ord.id : undefined,
                  event: "order_updated" as const,
                  clientRefresh: true,
                };

                if (customerId) {
                  await this.sendNotificationToUser(customerId, { ...pingPayload });
                }
                for (const vid of vendorUserIds) {
                  await this.sendNotificationToUser(vid, { ...pingPayload });
                }
              } catch (e) {
                console.error("auto_parts_client_refresh orderId:", e);
              }
            })();
          }
        }
      );

      socket.on(
        "request_view_ping",
        async (payload: {
          bookingId?: string
          riderName?: string
          avatar?: string | null
        }) => {
          if (socket.data?.role !== "RIDER" || !socket.data?.userId) return
          const bookingId = String(payload?.bookingId || "").trim()
          if (!bookingId) return
          try {
            const { upsertRequestViewer } = await import("@/lib/riding-request-viewers")
            const viewers = upsertRequestViewer(bookingId, {
              riderUserId: socket.data.userId,
              riderName: payload?.riderName || "Rider",
              avatar: payload?.avatar ?? null,
            })
            const booking =
              (await prisma.rideBooking.findUnique({
                where: { id: bookingId },
                select: { customerId: true },
              })) ||
              (await prisma.courierBooking.findUnique({
                where: { id: bookingId },
                select: { customerId: true },
              }))
            if (booking?.customerId) {
              await this.sendNotificationToUser(booking.customerId, {
                type: "request_viewers_update",
                bookingId,
                viewers: viewers.map((v) => ({
                  riderUserId: v.riderUserId,
                  riderName: v.riderName,
                  avatar: v.avatar ?? null,
                })),
              })
            }
          } catch (e) {
            console.error("request_view_ping:", e)
          }
        }
      )

      socket.on(
        "request_view_leave",
        async (payload: { bookingId?: string }) => {
          if (socket.data?.role !== "RIDER" || !socket.data?.userId) return
          const bookingId = String(payload?.bookingId || "").trim()
          if (!bookingId) return
          try {
            const { removeRequestViewer } = await import("@/lib/riding-request-viewers")
            const viewers = removeRequestViewer(bookingId, socket.data.userId)
            const booking =
              (await prisma.rideBooking.findUnique({
                where: { id: bookingId },
                select: { customerId: true },
              })) ||
              (await prisma.courierBooking.findUnique({
                where: { id: bookingId },
                select: { customerId: true },
              }))
            if (booking?.customerId) {
              await this.sendNotificationToUser(booking.customerId, {
                type: "request_viewers_update",
                bookingId,
                viewers: viewers.map((v) => ({
                  riderUserId: v.riderUserId,
                  riderName: v.riderName,
                  avatar: v.avatar ?? null,
                })),
              })
            }
          } catch (e) {
            console.error("request_view_leave:", e)
          }
        }
      )

      socket.on("rider_location_update", async ({ bookingId, riderId, lat, lng, heading, timestamp }) => {
        
        if (!socket.data?.userId) return;
        
        // Emit to mechanics (for auto-parts service)
        const mechanicSockets = Array.from(this.clients.values()).filter(s => 
          s.data?.role === 'MECHANIC' && s.id !== socket.id && s.connected
        );
        if (mechanicSockets.length > 0) {

          mechanicSockets.forEach(s => {
            s.emit("rider_location_update", { bookingId, riderId, lat, lng, heading, timestamp })
          });
        }

        // Also emit to CUSTOMER who has this booking (for ride tracking)
        if (bookingId) {
          try {
            // Find the customer for this booking
            const booking = await prisma.rideBooking.findUnique({
              where: { id: bookingId },
              select: { customerId: true }
            }) || await prisma.courierBooking.findUnique({
              where: { id: bookingId },
              select: { customerId: true }
            });
            
            if (booking?.customerId) {
              const customerSockets = this.getUserSockets(booking.customerId);
              if (customerSockets.length > 0) {
                
                customerSockets.forEach(s => {
                  s.emit("rider_location_update", { 
                    bookingId, 
                    riderId: riderId || socket.data.userId, 
                    lat, 
                    lng, 
                    heading, 
                    timestamp 
                  });
                });
              }
            }

            const shareRoom = tripShareRoom(String(bookingId));
            const sharePayload = {
              bookingId,
              riderId: riderId || socket.data.userId,
              lat,
              lng,
              heading: heading ?? null,
              timestamp: timestamp || new Date().toISOString(),
            };
            this.io?.to(shareRoom).emit("trip_share_location", sharePayload);
            this.emitAdminBookingsMonitor("admin_booking_location", sharePayload);
          } catch (error) {
            console.error('Error finding customer for booking:', error);
          }
        }
      })



      socket.on("live_tracking", async ({ lat, lng, userId }) => {
        if (!socket.data?.userId) return;
        
        
        
        // Broadcast to all connected users (pharmacies tracking this rider)
        // This is a simple broadcast - in production you might want to be more specific
        const allSockets = Array.from(this.clients.values()).filter(s => s.id !== socket.id);
        
        if (allSockets.length > 0) {
          
          allSockets.forEach(s => {
            s.emit("live_tracking_response", { 
              lat, 
              lng, 
              userId: socket.data.userId,
              timestamp: new Date().toISOString()
            });
          });
        } else {
          
        }
        
        if (userId) {
          this.addUserSocket(userId, socket);
        }
      });

      socket.on("booking_status_update", async ({ bookingId, bookingType, status, bookingNumber, isBookedByAnother, riderId, userId, latitude, longitude, timestamp }) => {
        
        if (!socket.data?.userId) {
          return;
        }
        
        // Broadcast to all connected users (pharmacies tracking this rider)
        // This is a simple broadcast - in production you might want to be more specific
        const allSockets = Array.from(this.clients.values()).filter(s => s.id !== socket.id);
        
        
        this.emitAdminBookingsMonitor("admin_booking_status_update", {
          bookingId,
          bookingType,
          status,
          bookingNumber,
          riderId,
          latitude,
          longitude,
          timestamp: timestamp || new Date().toISOString(),
        });

        if (allSockets.length > 0) {
          allSockets.forEach(s => {
            s.emit("booking_status_update", { 
              bookingId, 
              bookingType, 
              status, 
              bookingNumber, 
              isBookedByAnother, 
              riderId, 
              userId: socket.data.userId,
              latitude,
              longitude,
              timestamp: timestamp || new Date().toISOString()
            });
          });
        } else {
        }
        
        if (userId) {
          this.addUserSocket(userId, socket);
        }
      });

      // Location update - Broadcast to nearby customers (within 2km radius)
      socket.on("update_location", async (data: { lat: number; lng: number; userId: string; timestamp: string; heading: number; speed: number; userName: string }) => {
        if (!socket.data?.userId) return;
        try {
          // Re-validate token on high-frequency rider updates so expired sessions cannot keep mutating state.
          const token = socket.data?.authToken;
          if (token) {
            const payload = await verifyToken(token);
            if (!payload?.userId || payload.userId !== socket.data.userId) {
              socket.emit("auth_error", { message: "Session expired. Please login again." });
              socket.disconnect(true);
              return;
            }
          }

          // Guardrail: only rider sockets should update rider geo state.
          if (socket.data.role !== "RIDER") {
            return;
          }


          // Update rider location in database
          const result = await fetchRider(socket.data.userId, data.lat, data.lng);
          
          socket.emit("location_updated", { success: true });
          
          // Broadcast to all CUSTOMER sockets (for nearby rider tracking)
          // Frontend will filter by distance
          const customerSockets = Array.from(this.clients.values()).filter(s => 
            s.data?.role === 'CUSTOMER' && s.id !== socket.id && s.connected
          );
          
          if (customerSockets.length > 0) {
            customerSockets.forEach(s => {
              s.emit("live_tracking_response", { 
                lat: data.lat, 
                lng: data.lng, 
                userId: socket.data.userId, 
                timestamp: data.timestamp || new Date().toISOString(),
                heading: data.heading,
                speed: data.speed,
                userName: data.userName
              });
            });
          }
          
          if (result.hasNewRequests) {
            socket.emit("refresh_requests", {
              message: "New requests nearby",
              timestamp: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error("❌ update_location error:", e);
        }
      });


      

      socket.on("handover_code_verified", async ({ serviceRequestId, orderId, handoverCode, message }) => {
        if (!socket.data?.userId) return
        
        // Emit to the mechanic
        socket.emit("handover_code_verified", { serviceRequestId, orderId, handoverCode, message })

      })

      // New ride request (from rider/client)
      socket.on("new_request", async (data) => { 
        await this.broadcastCourierNewRequestToRiders(data)
      });
      // Chat typing status - supports both AutoPartsChat and Ride/Courier chat
      socket.on("typing", async ({ chatId, bookingId, isTyping }) => {
        if (!socket.data?.userId) return
        
        const chatIdToUse = bookingId || chatId
        if (!chatIdToUse) return

        try {
          let recipientId: string | null = null

          // Try to find AutoPartsChat first
          const autoPartsChat = await prisma.autoPartsChat.findUnique({
            where: { id: chatIdToUse },
            select: { userId: true, vendorId: true }
          })

          const pharmacyChat = await prisma.pharmacyChat.findUnique({
            where: { id: chatIdToUse },
            select: {
              userId: true,
              pharmacyId: true,
              pharmacy: {
                select: {
                  userId: true,
                  user: {
                    select: {
                      name: true,
                      avatar: true,
                    }
                  }
                }
              }
            }
          })
          
          if (autoPartsChat) {
            recipientId = autoPartsChat.userId === socket.data.userId ? autoPartsChat.vendorId : autoPartsChat.userId
          } else {
            // Try to find RideBooking or CourierBooking
            let booking: any = await prisma.rideBooking.findFirst({
              where: {
                OR: [
                  { id: chatIdToUse },
                  { bookingNumber: chatIdToUse }
                ]
              },
              select: { customerId: true, riderId: true }
            })

            if (!booking) {
              booking = await prisma.courierBooking.findFirst({
                where: {
                  OR: [
                    { id: chatIdToUse },
                    { bookingNumber: chatIdToUse }
                  ]
                },
                select: { customerId: true, riderId: true }
              })
            }

            if (booking) {
              recipientId = booking.customerId === socket.data.userId ? booking.riderId : booking.customerId
            }
          }

          if (pharmacyChat) {
            recipientId = pharmacyChat.userId === socket.data.userId ? pharmacyChat.pharmacyId : pharmacyChat.userId
          }

          if (!recipientId) {
            console.warn('⚠️ No recipient found for typing status:', chatIdToUse)
            return
          }

          // Emit to recipient's sockets only
          const recipientSockets = this.getUserSockets(recipientId)
          
          recipientSockets.forEach(s => {
            s.emit("user_typing", {
              chatId: chatIdToUse,
              bookingId: chatIdToUse, // Add bookingId for compatibility
              userId: socket.data.userId,
              isTyping
            })
          })
        } catch (error) {
          console.error('❌ Error handling typing status:', error)
        }
      })

      // Instant chat message (socket-first before DB save)
      // Supports both: AutoPartsChat and Ride/Courier chat
      socket.on("chat_message", async ({ chatId, bookingId, message, messageType, tempImageUri, fileUrl, duration, fileName, fileSize, attachments }) => {
        
        if (!socket.data?.userId) return

        try {
          const chatIdToUse = bookingId || chatId
          if (!chatIdToUse) {
            console.error('❌ No chatId or bookingId provided')
            return
          }

          let recipientId: string | null = null
          let senderName = 'User'
          let senderRole = 'USER'
          let senderAvatar: string | null = null
          let chatType: 'autoParts' | 'ride' | 'property' = 'autoParts'

          const propertyConversation = await prisma.conversation.findFirst({
            where: { id: chatIdToUse, module: "PROPERTY" },
            select: { id: true, customerId: true, vendorId: true },
          })

          if (propertyConversation) {
            chatType = "property"
            recipientId =
              propertyConversation.customerId === socket.data.userId
                ? propertyConversation.vendorId
                : propertyConversation.customerId

            const sender = await prisma.user.findUnique({
              where: { id: socket.data.userId },
              select: {
                id: true,
                name: true,
                role: true,
                avatar: true,
                vendorProfile: { select: { businessName: true } },
              },
            })
            senderName = sender?.vendorProfile?.businessName || sender?.name || "User"
            senderRole = sender?.role || "USER"
            senderAvatar = sender?.avatar || null

            const chatPayload = {
              id: `socket-${Date.now()}`,
              conversationId: chatIdToUse,
              chatId: chatIdToUse,
              senderId: socket.data.userId,
              senderName,
              senderAvatar,
              senderRole,
              message,
              messageType: messageType || "TEXT",
              attachments,
              timestamp: new Date().toISOString(),
              module: "PROPERTY",
            }

            const recipientSockets = this.getUserSockets(recipientId!)
            recipientSockets.forEach((s) => {
              if (s.connected) s.emit("chat_message", chatPayload)
            })
            this.io?.to(`prop_chat:${chatIdToUse}`).emit("chat_message", chatPayload)
            return
          }

          // Try to find AutoPartsChat first
          const autoPartsChat = await prisma.autoPartsChat.findUnique({
            where: { id: chatIdToUse },
            select: { userId: true, vendorId: true }
          })
          const pharmacyChat = await prisma.pharmacyChat.findUnique({
            where: { id: chatIdToUse },
            select: {
              userId: true,
              pharmacyId: true,
              pharmacy: {
                select: {
                  userId: true,
                  user: {
                    select: {
                      name: true,
                      avatar: true,
                    }
                  }
                }
              }
            }
          })
          
          
          if (autoPartsChat) {
            chatType = 'autoParts'
            // Determine recipient ID for auto-parts chat
            recipientId = autoPartsChat.userId === socket.data.userId ? autoPartsChat.vendorId : autoPartsChat.userId
            
            // Get sender info
            const sender = await prisma.user.findUnique({
              where: { id: socket.data.userId },
              select: { 
                id: true, 
                name: true,
                role: true,
                avatar: true,
                vendorProfile: {
                  select: {
                    businessName: true
                  }
                }
              }
            })
            
            senderName = sender?.vendorProfile?.businessName || sender?.name || 'User'
            senderRole = sender?.role || 'USER'
            senderAvatar = sender?.avatar || null
          } else {
            // Try to find RideBooking or CourierBooking
            let booking: any = await prisma.rideBooking.findFirst({
              where: {
                OR: [
                  { id: chatIdToUse },
                  { bookingNumber: chatIdToUse }
                ]
              },
              include: {
                customer: { select: { id: true, name: true, avatar: true } },
                rider: { select: { id: true, name: true, avatar: true } }
              }
            })

            let isCourierBooking = false
            if (!booking) {
              booking = await prisma.courierBooking.findFirst({
                where: {
                  OR: [
                    { id: chatIdToUse },
                    { bookingNumber: chatIdToUse }
                  ]
                },
                include: {
                  customer: { select: { id: true, name: true, avatar: true } },
                  rider: { select: { id: true, name: true, avatar: true } }
                }
              })
              isCourierBooking = !!booking
            }

            if (booking) {
              chatType = 'ride'
              // Determine recipient ID for ride chat
              recipientId = booking.customerId === socket.data.userId ? booking.riderId : booking.customerId
              
              // Get sender info from booking
              if (socket.data.userId === booking.customerId) {
                senderName = booking.customer?.name || 'Customer'
                senderRole = 'CUSTOMER'
                senderAvatar = booking.customer?.avatar || null
              } else {
                senderName = booking.rider?.name || 'Rider'
                senderRole = 'RIDER'
                senderAvatar = booking.rider?.avatar || null
              }
            }
          }

          if (pharmacyChat) {
            // Route by user IDs (customer userId <-> pharmacy owner userId)
            const pharmacyOwnerUserId = pharmacyChat.pharmacy?.userId || null
            recipientId = pharmacyChat.userId === socket.data.userId ? pharmacyOwnerUserId : pharmacyChat.userId
            const isPharmacySender = pharmacyOwnerUserId === socket.data.userId
            if (isPharmacySender) {
              senderName = pharmacyChat.pharmacy?.user?.name || 'Pharmacy'
              senderRole = 'VENDOR'
              senderAvatar = pharmacyChat.pharmacy?.user?.avatar || null
            } else {
              const sender = await prisma.user.findUnique({
                where: { id: socket.data.userId },
                select: { name: true, avatar: true, role: true },
              })
              senderName = sender?.name || 'Customer'
              senderRole = 'CUSTOMER'
              senderAvatar = sender?.avatar || null
            }
          }
          
          if (!recipientId) {
            console.error('❌ No recipient found for chat:', chatIdToUse)
            return
          }
          
          // Send to recipient's sockets only
          const recipientSockets = this.getUserSockets(recipientId)
          
          recipientSockets.forEach(s => {
            s.emit("chat_message", {
              chatId: chatIdToUse,
              bookingId: chatType === 'ride' ? chatIdToUse : undefined, // Add bookingId for ride chats
              senderId: socket.data.userId,
              senderName: senderName,
              senderAvatar: senderAvatar,
              senderRole: senderRole,
              message,
              messageType: messageType || 'TEXT',
              tempImageUri,
              fileUrl, // Forward fileUrl (Cloudinary URL) for images/files
              duration,
              fileName,
              fileSize,
              timestamp: new Date().toISOString()
            })
          })
        } catch (error) {
          console.error('❌ Error handling chat_message:', error)
          // Do not echo chat_message to sender — clients use optimistic UI + message_confirmed from REST
        }
      })


  

      // Handle bid_received events from riders
      socket.on("bid_received", async (data) => {
        
        // Broadcast to all riders (except the sender) about the new bid
        const allRiders = Array.from(this.clients.values()).filter(s => 
          s.data?.role === 'RIDER' && s.id !== socket.id
        )
        
        allRiders.forEach(riderSocket => {
          riderSocket.emit('bid_received', {
            bookingId: data.bookingId,
            requestType: data.requestType,
            bidAmount: data.bidAmount,
            estimatedTime: data.estimatedTime,
            message: data.message,
            riderId: data.riderId,
            riderName: data.riderName
          })
        })
        
        // Also notify the customer
        if (data.bookingId) {
          // We need to get the customer ID from the booking
          try {
            const booking = await prisma.rideBooking.findUnique({
              where: { id: data.bookingId },
              select: { customerId: true }
            }) || await prisma.courierBooking.findUnique({
              where: { id: data.bookingId },
              select: { customerId: true }
            })
            
            if (booking?.customerId) {
              await this.sendNotificationToUser(booking.customerId, {
                type: 'bid_received',
                bookingId: data.bookingId,
                requestType: data.requestType,
                bidAmount: data.bidAmount,
                estimatedTime: data.estimatedTime,
                message: data.message,
                riderId: data.riderId,
                riderName: data.riderName,
                bid: data.bid,
              })
            }
          } catch (error) {
            console.error('Error notifying customer about bid:', error)
          }
        }
      })
      socket.on("bid_expired", async (data) => {
        
        // Broadcast to all riders (except the sender) about the new bid
        const allRiders = Array.from(this.clients.values()).filter(s => 
          s.data?.role === 'RIDER' && s.id !== socket.id
        )
        allRiders.forEach(riderSocket => {
          riderSocket.emit('bid_expired', {
            bookingId: data.bookingId,
            requestType: data.requestType,
            bidAmount: data.bidAmount,
            estimatedTime: data.estimatedTime,
            message: data.message,
          })
        })
      })

      socket.on("prescription_approved_by_pharmacy", async (data) => {
        try {
          let recipientUserId: string | null = null

          // Prefer queue lookup when available
          if (data.queueId) {
            const q = await prisma.prescriptionQueue.findUnique({
              where: { id: data.queueId },
              select: { customerId: true },
            })
            recipientUserId = q?.customerId || null
          }

          // Fallback to chat lookup
          if (!recipientUserId && data.chatId) {
            const chat = await prisma.pharmacyChat.findUnique({
              where: { id: data.chatId },
              select: { userId: true },
            })
            recipientUserId = chat?.userId || null
          }

          if (!recipientUserId) {
            console.warn("⚠️ prescription_approved_by_pharmacy: recipient customer not found", data)
            return
          }

          const recipientSockets = this.getUserSockets(recipientUserId)

          recipientSockets.forEach((s) => {
            s.emit("prescription_approved_by_pharmacy", {
              pharmacyName: data.pharmacyName,
              chatId: data.chatId,
              queueId: data.queueId,
              medicines: data.medicines,
              pharmacyNotes: data.pharmacyNotes,
              totalCost: data.totalCost,
              prescriptionData: data.prescriptionData,
            })
          })
        } catch (err) {
          console.error("❌ Error handling prescription_approved_by_pharmacy:", err)
        }
      })
      

      socket.on("bid_accepted", async (data) => {
        
        // Validate that we have the required data
        if (!data.bookingId) {
          console.warn("⚠️ bid_accepted event missing bookingId, skipping broadcast")
          return
        }
        

        // Fetch complete booking data from database
        try {
          const booking = await prisma.rideBooking.findUnique({
            where: { id: data.bookingId },
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                }
              }
            }
          }) || await prisma.courierBooking.findUnique({
            where: { id: data.bookingId },
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                }
              }
            }
          })
          
          if (!booking) {
            console.warn("⚠️ Booking not found for bid_accepted event:", data.bookingId)
            return
          }
          
          const bookingType = 'rideTypeId' in booking ? 'ride' : 'courier'
          
          // Broadcast to all riders (except the sender) about the bid acceptance
          // This is mainly for other riders to know the request is no longer available
          const allRiders = Array.from(this.clients.values()).filter(s => 
            s.data?.role === 'RIDER' && s.id !== socket.id
          )
          
          allRiders.forEach(riderSocket => {
            riderSocket.emit('bid_accepted', {
              bookingId: booking.id,
              bookingType: bookingType,
              bookingNumber: booking.bookingNumber,
              customerId: booking.customerId,
              pickupAddress: booking.pickupAddress,
              dropAddress: booking.dropAddress,
              pickupLatitude: booking.pickupLatitude,
              pickupLongitude: booking.pickupLongitude,
              dropLatitude: booking.dropLatitude,
              dropLongitude: booking.dropLongitude,
              finalFare: data.bidAmount || ('estimatedFare' in booking ? booking.estimatedFare : (booking as any).fare),
              estimatedTime: booking.estimatedTime,
              distance: booking.distance,
              message: data.message || 'Bid accepted',
              riderId: data.riderId,
              riderName: data.riderName,
              customer: {
                id: booking.customer.id,
                name: booking.customer.name,
                phone: booking.customer.phone || '',
                email: booking.customer.email || '',
              }
            })
          })
          
          // Also notify the customer if needed (backend API already does this)
          // This is kept as a fallback
        } catch (error) {
          console.error('❌ Error handling bid_accepted event:', error)
        }
      })

      socket.on("bid_rejected", async (data) => {
        
        // Broadcast to all riders (except the sender) about the rejected bid
        const allRiders = Array.from(this.clients.values()).filter(s => 
          s.data?.role === 'RIDER' && s.id !== socket.id
        )
        
        allRiders.forEach(riderSocket => {
          riderSocket.emit('bid_rejected', {
            bookingId: data.bookingId,
            requestType: data.requestType,
            bidAmount: data.bidAmount,
            estimatedTime: data.estimatedTime,
            message: data.message,
            riderId: data.riderId,
            riderName: data.riderName
          })
        })
        
        // Also notify the customer
        if (data.bookingId) {
          try {
            const booking = await prisma.rideBooking.findUnique({
              where: { id: data.bookingId },
              select: { customerId: true }
            }) || await prisma.courierBooking.findUnique({
              where: { id: data.bookingId },
              select: { customerId: true }
            })
            
            if (booking?.customerId) {
              await this.sendNotificationToUser(booking.customerId, {
                type: 'bid_rejected',
                bookingId: data.bookingId,
                requestType: data.requestType,
                bidAmount: data.bidAmount,
                estimatedTime: data.estimatedTime,
                message: data.message,
                riderId: data.riderId,
                riderName: data.riderName
              })
            }
          } catch (error) {
            console.error('Error notifying customer about rejected bid:', error)
          }
        }
      })

      socket.on("request_update", async (data) => {
        
        // Broadcast to all riders about the booking update
        const allRiders = Array.from(this.clients.values()).filter(s => 
          s.data?.role === 'RIDER'
        )
        

        allRiders.forEach(riderSocket => {
          riderSocket.emit('request_update', {
            bookingId: data.bookingId,
            status: data.status,
            requestType: data.requestType,
            bookingNumber: data.bookingNumber,
            message: data.message || 'Booking status updated',
          })
        })
        
        // Also notify the customer if bookingId matches
        if (data.bookingId && socket.data?.userId) {
          try {
            const booking = await prisma.rideBooking.findUnique({
              where: { id: data.bookingId },
              select: { customerId: true }
            }) || await prisma.courierBooking.findUnique({
              where: { id: data.bookingId },
              select: { customerId: true }
            })
            
            if (booking?.customerId) {
              await this.sendNotificationToUser(booking.customerId, {
                type: 'request_update',
                bookingId: data.bookingId,
                status: data.status,
                requestType: data.requestType,
                bookingNumber: data.bookingNumber,
                message: data.message || 'Booking status updated',
              })
            }
          } catch (error) {
            console.error('Error notifying about request update:', error)
          }
        }
      })

      socket.on("ping", () => socket.emit("pong"));
      socket.on("disconnect", (reason) => {
        const userId = socket.data?.userId;
        const role = socket.data?.role;
        this.clients.delete(socket.id);
        if (userId) {
          this.removeUserSocket(userId, socket);
          // Check if user still has other active connections
          const remainingSockets = this.getUserSockets(userId);
          // If no more active sockets, user is offline
          if (remainingSockets.length === 0) {
            if (role === "RIDER") {
              this.emitRiderStatusChange(userId, false);
            }
            this._notifyUserPresence(userId, false);
          }
        }
      });
      
    });

    this.startClientsMonitoring();

    // Listen to DB changes
    eventBus.on("db_change:user", ({ userId, payload }: any) => {
      this.sendNotificationToUser(userId, { type: "db_change", ...payload });
    });

  }

  /** Send first events after auth */
  private async _sendInitialEvents(socket: AuthenticatedSocket, userId: string) {
    try {
      const unreadCount = await this.getUnreadCount(userId);
      socket.emit("notification_count", { count: unreadCount });
    } catch {}
  }

  /** Join presence + per-user rooms; riders also join dispatch so requests can reach open apps. */
  private joinAuthenticatedUserRooms(socket: AuthenticatedSocket) {
    if (!socket.data?.userId) return;
    socket.join(`user:${socket.data.userId}`);
    socket.join("app:presence");
    if (socket.data.role === "RIDER") {
      socket.join("riders:online");
      socket.join(`rider_dispatch:${socket.data.userId}`);
    }
  }

  /** Recover io + user maps when App Router and Pages Router share different module instances. */
  ensureRuntimeAttached() {
    const g = globalThis as typeof globalThis & { __killoHttpServer?: any };
    if (!this.io && g.__killoHttpServer?.io) {
      this.io = g.__killoHttpServer.io as IOServer;
    }
    this.reconcileConnectionsFromIo();
  }

  private reconcileConnectionsFromIo() {
    if (!this.io) return;
    this.io.sockets.sockets.forEach((socket) => {
      const authSocket = socket as AuthenticatedSocket;
      if (!authSocket.connected) return;
      this.clients.set(authSocket.id, authSocket);
      const userId = authSocket.data?.userId;
      if (userId) {
        this.addUserSocket(userId, authSocket);
      }
    });
  }

  private getUserSockets(userId: string): AuthenticatedSocket[] {
    this.ensureRuntimeAttached();
    const sockets = this.userSockets.get(userId);
    if (!sockets) return [];

    const aliveSockets = Array.from(sockets).filter((s) => s.connected);
    this.userSockets.set(userId, new Set(aliveSockets));
    return aliveSockets;
  }

  // Helper function to calculate distance between two coordinates (Haversine formula)
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c // Distance in kilometers
  }

  /**
   * Same behavior as the `new_request` socket handler: notify nearby riders + global fallback.
   * Used when promoting FOOD courier bookings from AWAITING_PREP (worker / internal API).
   */
  async broadcastCourierNewRequestToRiders(data: Record<string, unknown>) {
    
    try {
      /** Clients sometimes wrap the payload in `data` (e.g. pharmacy quote accept) or nest `pickup: { lat, lng }`. */
      const nested =
        data.data != null &&
        typeof data.data === "object" &&
        !Array.isArray(data.data)
          ? (data.data as Record<string, unknown>)
          : null
      const merged: Record<string, unknown> = nested ? { ...nested, ...data } : { ...data }

      const pickObj =
        merged.pickup != null &&
        typeof merged.pickup === "object" &&
        !Array.isArray(merged.pickup)
          ? (merged.pickup as Record<string, unknown>)
          : null

      const rawLat =
        merged.pickupLatitude ??
        merged.pickupLat ??
        pickObj?.lat ??
        pickObj?.latitude
      const rawLng =
        merged.pickupLongitude ??
        merged.pickupLng ??
        pickObj?.lng ??
        pickObj?.longitude

      const pickupLat = typeof rawLat === "number" ? rawLat : Number(rawLat)
      const pickupLng = typeof rawLng === "number" ? rawLng : Number(rawLng)



      if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
        console.error("❌ Missing pickup coordinates in new_request")
        return
      }

      const rideTypeVehicle = extractRequestVehicleType(merged)
      if (!rideTypeVehicle) {
        console.warn("❌ Missing rideType vehicle in new_request")
        return
      }
      const requestType = extractRequestType(merged)
      const requestModuleRaw = (merged as any)?.module
      const requestModule =
        typeof requestModuleRaw === "string" ? requestModuleRaw.toUpperCase() : null
      const nearbyRiders = await this.findNearbyRiders(pickupLat, pickupLng, {
        type: requestType,
        module: requestModule,
        rideTypeVehicle,
        scheduledAt: (merged as any)?.scheduledAt ?? null,
        expiresAt: (merged as any)?.expiresAt ?? null,
        status: (merged as any)?.status ?? "REQUESTED",
      })

      

      for (const rider of nearbyRiders) {
        const riderSockets = this.getUserSockets(rider.userId)
        for (const riderSocket of riderSockets) {
          await NotificationBridge.sendNotification({
            userId: rider.userId,
            title: "New Ride Request",
            message: `New ride request from ${(merged.customerName as string) || (data.customerName as string) || "Customer"}`,
            type: "RIDE",
            module: "RIDING",
            data: {
              actionType: "navigate",
              screen: "AvailableRides",
              params: [{ name: "requestId", value: merged.requestId ?? data.requestId }],
            },
            actionUrl: `/rider/requests/${merged.requestId ?? data.requestId}`,
          })
          const payload = {
            ...merged,
            distance: rider.distance,
            riderId: rider.userId,
          }
          riderSocket.emit("new_request", payload)
          riderSocket.emit("new_requests", payload)
        }
      }
    } catch (error) {
      console.error("❌ Error processing new_request:", error)
    }
  }

  /** Same eligibility rules as GET /api/rider/available-requests */
  private async findNearbyRiders(
    latitude: number,
    longitude: number,
    requestContext: {
      type: "ride" | "courier"
      module?: string | null
      rideTypeVehicle: string
      scheduledAt?: Date | string | null
      expiresAt?: Date | string | null
      status?: string | null
    }
  ) {
    if (!requestContext.rideTypeVehicle) return []

    try {
      const riders = await prisma.riderProfile.findMany({
        where: {
          isAvailable: true,
          status: "APPROVED",
          currentLocation: {
            not: null as any,
          },
          lastLocationUpdate: {
            gte: new Date(Date.now() - 10 * 60 * 1000),
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
        take: 200,
      })

      const nearbyRiders: Array<{ userId: string; distance: number }> = []

      for (const rider of riders) {
        const location = rider.currentLocation as any
        if (!location?.latitude || !location?.longitude) continue

        const riderMaxKm = Number(rider.maxDeliveryDistance || 0)
        const effectiveRiderMaxKm = riderMaxKm > 0 ? riderMaxKm : 10
        const riderFilter = buildRiderServiceFilter(
          rider.serviceTypes,
          rider.modules,
          rider.vehicleType as any
        )

        const allowed = shouldBroadcastRequestToRider(
          riderFilter,
          location.latitude,
          location.longitude,
          effectiveRiderMaxKm,
          {
            pickupLatitude: latitude,
            pickupLongitude: longitude,
            type: requestContext.type,
            module: requestContext.module,
            rideTypeVehicle: requestContext.rideTypeVehicle,
            scheduledAt: requestContext.scheduledAt,
            expiresAt: requestContext.expiresAt,
            status: requestContext.status,
          }
        )
        if (!allowed) continue

        const distance = this.calculateDistance(
          latitude,
          longitude,
          location.latitude,
          location.longitude
        )
        nearbyRiders.push({ userId: rider.userId, distance })
      }

      return nearbyRiders.sort((a, b) => a.distance - b.distance)
    } catch (error) {
      console.error("Error finding nearby riders:", error)
      return []
    }
  }


  
  
  private addUserSocket(userId: string, socket: AuthenticatedSocket) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket);
  }
  
  private removeUserSocket(userId: string, socket: AuthenticatedSocket) {
    const sockets = this.userSockets.get(userId);
    
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.userSockets.delete(userId);
  }

  private emitRiderStatusChange(riderUserId: string, isOnline: boolean, sourceSocket?: AuthenticatedSocket) {
    const payload = {
      riderId: riderUserId,
      riderUserId,
      userId: riderUserId,
      isOnline,
      status: isOnline ? "online" : "offline",
      timestamp: new Date().toISOString(),
    };
    const customerSockets = Array.from(this.clients.values()).filter(
      (s) => s.data?.role === "CUSTOMER" && s.connected && s.id !== sourceSocket?.id
    );
    customerSockets.forEach((s) => s.emit("rider_status_change", payload));
  }

  /** Notify chat partners about user presence change */
  private async _notifyUserPresence(userId: string, isOnline: boolean) {
    try {
      // Find all auto-parts chats where this user is a participant
      const chats = await prisma.autoPartsChat.findMany({
        where: {
          OR: [
            { userId: userId },
            { vendorId: userId }
          ],
          isActive: true
        },
        select: {
          id: true,
          userId: true,
          vendorId: true
        }
      })

      // Notify the other user in each chat
      for (const chat of chats) {
        const otherUserId = chat.userId === userId ? chat.vendorId : chat.userId
        if (otherUserId) {
          this.sendNotificationToUser(otherUserId, {
            type: 'user_presence',
            userId: userId,
            chatId: chat.id,
            isOnline: isOnline,
            timestamp: new Date().toISOString()
          })
        }
      }
    } catch (error) {
      // Error notifying user presence
    }
  }
  
  async sendNewRideToUser(userId: string, ride: any) {
    try {
      const rider = await prisma.riderProfile.findUnique({
        where: { userId },
        select: {
          vehicleType: true,
          serviceTypes: true,
          modules: true,
          maxDeliveryDistance: true,
          currentLocation: true,
        },
      })
      if (!rider) return

      const rideTypeVehicle = extractRequestVehicleType(ride)
      if (!rideTypeVehicle) return

      const requestType = extractRequestType(ride)
      const requestModule =
        typeof ride?.module === "string" ? ride.module.toUpperCase() : null
      const riderMaxKm =
        Number(rider.maxDeliveryDistance || 0) > 0
          ? Number(rider.maxDeliveryDistance)
          : 10
      const rLoc = rider.currentLocation as any
      const filter = buildRiderServiceFilter(
        rider.serviceTypes,
        rider.modules,
        rider.vehicleType as any
      )

      const allowed = shouldBroadcastRequestToRider(
        filter,
        rLoc?.latitude,
        rLoc?.longitude,
        riderMaxKm,
        {
          pickupLatitude: Number(ride?.pickupLatitude),
          pickupLongitude: Number(ride?.pickupLongitude),
          type: requestType,
          module: requestModule,
          rideTypeVehicle,
          scheduledAt: ride?.scheduledAt,
          expiresAt: ride?.expiresAt,
          status: ride?.status,
        }
      )
      if (!allowed) return
    } catch {
      return
    }

    const sockets = this.getUserSockets(userId);
    if (!sockets.length) {
      const stats = this.getStats();
      
      return;
    }

    const payload = { ...ride };
    for (const riderSocket of sockets) {
      riderSocket.emit("new_request", payload);
      riderSocket.emit("new_requests", payload);
    }

    const dispatchRoom = `rider_dispatch:${userId}`;
    this.io?.to(dispatchRoom).emit("new_request", payload);
    this.io?.to(dispatchRoom).emit("new_requests", payload);
  }

  async sendNotificationToUser(userId: string, notification: any) {
    
    const sockets = this.getUserSockets(userId);
    if (!sockets.length) {

      
      // Fallback: try to find user by checking all sockets
      const fallbackSockets = Array.from(this.clients.values()).filter(s => 
        s.data?.userId === userId && s.connected
      );
      if (fallbackSockets.length > 0) {
        
        const eventType = notification.type || 'notification'
        fallbackSockets.forEach((s) => {
          

          s.emit(eventType, notification);
          
        });
        return;
      }
      return;
    }
    // Emit with the type from notification, or default to 'notification'
    const eventType = notification.type || 'notification'
    
    
    sockets.forEach((s) => {
      if (s.connected) {
        s.emit(eventType, notification);
      } else {
      }
    });
  }

  async sendNotificationToRole(role: string, notification: any) {
    const sockets = Array.from(this.clients.values()).filter((s) => s.data?.role === role);
    sockets.forEach((s) => s.emit(notification.type || "notification", notification));
  }

  async broadcastNotification(notification: any) {
    this.io?.emit("notification", notification);
  }

  async getUnreadCount(userId: string) {
    try {
      return await prisma.notification.count({
        where: { userId, isRead: false },
      });
    } catch {
      return 0;
    }
  }

  /** Emit any socket event to all connected sessions for a user (additive helper). */
  emitEventToUser(userId: string, event: string, payload: any) {
    let sockets = this.getUserSockets(userId)
    if (!sockets.length) {
      sockets = Array.from(this.clients.values()).filter(
        (s) => s.data?.userId === userId && s.connected
      )
    }
    sockets.forEach((s) => {
      if (s.connected) s.emit(event, payload)
    })
  }

  async emitNotificationCountToUser(userId: string) {
    try {
      const count = await this.getUnreadCount(userId)
      this.emitEventToUser(userId, "notification_count", { count })
    } catch {
      /* non-fatal */
    }
  }

  /** Broadcast to everyone subscribed to a property conversation room. */
  emitToPropertyChatRoom(conversationId: string, event: string, payload: any) {
    this.io?.to(`prop_chat:${conversationId}`).emit(event, payload)
  }

  private startClientsMonitoring() {
    if (this.clientsCheckInterval) return;
    this.clientsCheckInterval = setInterval(() => {
      const disconnected = Array.from(this.clients.entries())
        .filter(([_, c]) => !c.connected)
        .map(([id]) => id);
      disconnected.forEach((id) => this.clients.delete(id));

    }, 30000);
  }

  /** Real-time part-request room: clients send `auto_parts_subscribe` with { requestId }. */
  emitAutoPartsRequestRoom(requestId: string, payload: Record<string, unknown>) {
    if (!this.io || !requestId) return;
    this.io.to(`ap_req:${requestId}`).emit("auto_parts_update", { ...payload, requestId });
  }
  emitAutoPartsQuoteRoom(quoteId: string, payload: Record<string, unknown>) {
    if (!this.io || !quoteId) return;
    const base = { ...payload, quoteId };
    /** Room listeners use `auto_parts_update`; detail screens also subscribe to `auto_parts_quote_update` (parity with per-user push). */
    this.io.to(`ap_quote:${quoteId}`).emit("auto_parts_update", base);
    this.io.to(`ap_quote:${quoteId}`).emit("auto_parts_quote_update", base);
  }
  emitAutoPartsServiceRequestRoom(serviceRequestId: string, payload: Record<string, unknown>) {
    if (!this.io || !serviceRequestId) return;
    this.io.to(`ap_req:${serviceRequestId}`).emit("auto_parts_update", { ...payload, serviceRequestId });
  }

  getStats() {
    this.ensureRuntimeAttached();
    return {
      totalConnections: this.totalConnections,
      authenticatedConnections: this.clients.size,
      liveIoSockets: this.io?.sockets.sockets.size ?? 0,
      isRunning: this.io !== null,
      isInitialized: this.io !== null,
      userSocketsCount: this.userSockets.size,
    };
  }

  listConnectedUsers() {
    this.ensureRuntimeAttached();
    if (this.io) {
      return Array.from(this.io.sockets.sockets.values()).map((c) => ({
        socketId: c.id,
        userId: (c as AuthenticatedSocket).data?.userId,
        role: (c as AuthenticatedSocket).data?.role,
        connected: c.connected,
      }));
    }
    return Array.from(this.clients.values()).map((c) => ({
      socketId: c.id,
      userId: c.data?.userId,
      role: c.data?.role,
      connected: c.connected,
    }));
  }

  /** Real-time events for admin bookings monitor dashboard. */
  emitAdminBookingsMonitor(event: string, payload: Record<string, unknown>) {
    this.io?.to(ADMIN_BOOKINGS_MONITOR_ROOM).emit(event, payload);
  }
}

// Singleton — always use globalThis so App Router + Pages Router share one registry.
declare global {
  var __socketIOServer: SocketIOServer | undefined;
  var __killoSocketIOServer: SocketIOServer | undefined;
  var __killoHttpServer: any;
}

function createSocketServerInstance(): SocketIOServer {
  const server = new SocketIOServer();
  if (typeof globalThis !== "undefined") {
    globalThis.__killoSocketIOServer = server;
    globalThis.__socketIOServer = server;
  }
  
  return server;
}

export function getGlobalSocketServer(): SocketIOServer {
  if (typeof globalThis !== "undefined") {
    if (!globalThis.__killoSocketIOServer) {
      globalThis.__killoSocketIOServer = createSocketServerInstance();
    }
    globalThis.__killoSocketIOServer.ensureRuntimeAttached();
    return globalThis.__killoSocketIOServer;
  }
  return createSocketServerInstance();
}

/** @deprecated Use getGlobalSocketServer() */
export const socketIOServer = getGlobalSocketServer();
