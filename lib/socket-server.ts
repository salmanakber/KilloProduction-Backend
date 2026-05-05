// lib/socket-server.ts
import { Server as IOServer, Socket } from "socket.io";
import { verifyToken } from "@/lib/auth";
import { prisma } from "./prisma";
import { eventBus } from "./event-bus";
import { fetchRider } from "./services/riderService";
import { NotificationBridge } from "./notification-bridge";
import {
  buildRiderServiceFilter,
  courierMatchesRider,
  rideBookingMatchesRider,
} from "@/lib/rider-request-eligibility";

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    role?: string;
    authToken?: string;
    [key: string]: any;
  };
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
    if (this.io) {
      return;
    }

    // Create or reuse Socket.IO instance
    if (server.io) {
      this.io = server.io as IOServer;
    } else {
      this.io = new IOServer(server, {
        path: "/api/socketio",
        cors: { origin: process.env.SOCKET_CORS_ORIGIN || "*" },
        pingInterval: 25000,
        pingTimeout: 120000,
        transports: ["websocket"],
      });
      server.io = this.io;
    }

    // Prevent multiple attaches
    if ((server as any).__socketIOServerInitialized) return;
    (server as any).__socketIOServerInitialized = true;

    // Handshake authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token =
          (socket.handshake.auth as any)?.token ||
          (socket.handshake.query as any)?.token;
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
        if (socket.data.role === "RIDER") {
          // Keep riders presence room, but do NOT auto-join dispatch room.
          // Dispatch room must be joined explicitly from frontend.
          socket.join("riders:online");
        }
        // Ensure user is in userSockets map (in case handshake auth already added them)
        if (!this.userSockets.has(socket.data.userId)) {
          this.addUserSocket(socket.data.userId, socket);
        }
        this._sendInitialEvents(socket, socket.data.userId);
        // Notify chat partners that user is online
        this._notifyUserPresence(socket.data.userId, true);
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
          this.addUserSocket(user.id, socket) // add user socket to the map

          ack?.({ ok: true });
          socket.emit("authenticated", { userId: user.id, role: user.role });
          this._sendInitialEvents(socket, user.id);
          
          // Notify chat partners that user is online
          this._notifyUserPresence(user.id, true);
        } catch (e: any) {
          ack?.({ ok: false, error: e.message });
          socket.emit("auth_error", { message: e.message });
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
        }
      });

      socket.on("leave_rider_dispatch", (payload: { riderUserId?: string }) => {
        const riderUserId = payload?.riderUserId || socket.data?.userId;
        if (riderUserId && riderUserId === socket.data?.userId) {
          socket.leave(`rider_dispatch:${socket.data.userId}`);
        }
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

      socket.on("rider_location_update", async ({ bookingId, riderId, lat, lng, heading, timestamp }) => {
        console.log("🔑 rider_location_update received:", { bookingId, riderId, lat, lng, heading, timestamp })
        if (!socket.data?.userId) return;
        
        // Emit to mechanics (for auto-parts service)
        const mechanicSockets = Array.from(this.clients.values()).filter(s => 
          s.data?.role === 'MECHANIC' && s.id !== socket.id && s.connected
        );
        if (mechanicSockets.length > 0) {
          console.log(`📍 Broadcasting rider location to ${mechanicSockets.length} connected mechanics`);
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
                console.log(`📍 Broadcasting rider location to customer ${booking.customerId} for booking ${bookingId}`);
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
          } catch (error) {
            console.error('Error finding customer for booking:', error);
          }
        }
      })



      socket.on("live_tracking", async ({ lat, lng, userId }) => {
        if (!socket.data?.userId) return;
        
        console.log(`📍 aaaa Live tracking update from rider ${socket.data.userId}:`, { lat, lng, userId });
        
        // Broadcast to all connected users (pharmacies tracking this rider)
        // This is a simple broadcast - in production you might want to be more specific
        const allSockets = Array.from(this.clients.values()).filter(s => s.id !== socket.id);
        
        if (allSockets.length > 0) {
          console.log(`📍 Broadcasting rider location to ${allSockets.length} connected users`);
          allSockets.forEach(s => {
            s.emit("live_tracking_response", { 
              lat, 
              lng, 
              userId: socket.data.userId,
              timestamp: new Date().toISOString()
            });
          });
        } else {
          console.log(`📍 No other users connected to receive location updates`);
        }
        
        if (userId) {
          this.addUserSocket(userId, socket);
        }
      });

      socket.on("booking_status_update", async ({ bookingId, bookingType, status, bookingNumber, isBookedByAnother, riderId, userId, latitude, longitude, timestamp }) => {
        console.log(`📍 [BACKEND] booking_status_update received from socket ${socket.id}`, { bookingId, bookingType, status, riderId, userId, latitude, longitude });
        console.log(`📍 [BACKEND] Socket authenticated?`, !!socket.data?.userId, `userId: ${socket.data?.userId}`);
        console.log(`📍 [BACKEND] Total clients connected:`, this.clients.size);
        console.log(`📍 [BACKEND] All client details:`, Array.from(this.clients.values()).map(s => ({ id: s.id, userId: s.data?.userId, connected: s.connected })));
        
        if (!socket.data?.userId) {
          console.log(`⚠️ [BACKEND] Socket not authenticated, returning`);
          return;
        }
        
        // Broadcast to all connected users (pharmacies tracking this rider)
        // This is a simple broadcast - in production you might want to be more specific
        const allSockets = Array.from(this.clients.values()).filter(s => s.id !== socket.id);
        
        console.log(`📍 [BACKEND] Sockets to broadcast to (excluding sender):`, allSockets.length);
        
        if (allSockets.length > 0) {
          console.log(`📍 [BACKEND] Broadcasting booking status to ${allSockets.length} connected users`);
          allSockets.forEach(s => {
            console.log(`📍 [BACKEND] Broadcasting to socket ${s.id}, userId: ${s.data?.userId}`);
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
          console.log(`✅ [BACKEND] Broadcast completed successfully`);
        } else {
          console.log(`⚠️ [BACKEND] No other users connected to receive booking status updates`);
          console.log(`⚠️ [BACKEND] This means only the sender (rider) is connected. Pharmacy might not be connected.`);
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

          console.log("📍 update_location received from rider:", socket.data.userId, { lat: data.lat, lng: data.lng });

          // Update rider location in database
          const result = await fetchRider(socket.data.userId, data.lat, data.lng);
          
          socket.emit("location_updated", { success: true });
          
          // Broadcast to all CUSTOMER sockets (for nearby rider tracking)
          // Frontend will filter by distance
          const customerSockets = Array.from(this.clients.values()).filter(s => 
            s.data?.role === 'CUSTOMER' && s.id !== socket.id && s.connected
          );
          
          if (customerSockets.length > 0) {
            console.log(`📍 Broadcasting rider location to ${customerSockets.length} customers`);
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
        console.log("🔑 handover_code_verified received:", { serviceRequestId, orderId, handoverCode, message })
        if (!socket.data?.userId) return
        
        // Emit to the mechanic
        socket.emit("handover_code_verified", { serviceRequestId, orderId, handoverCode, message })

      })

      // New ride request (from rider/client)
      socket.on("new_request", async (data) => { 
        console.log("🚗 new_request received:", data)
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
      socket.on("chat_message", async ({ chatId, bookingId, message, messageType, tempImageUri, fileUrl, duration, fileName, fileSize }) => {
        
        if (!socket.data?.userId) return
        console.log('🔍 chat_message received:', { chatId, bookingId, message, messageType, tempImageUri, fileUrl, duration, fileName, fileSize })
        
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
          let chatType: 'autoParts' | 'ride' = 'autoParts'

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
          
          console.log(`📤 Sending chat_message to recipient ${recipientId} (${recipientSockets.length} sockets)`)
          
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
                riderName: data.riderName
              })
            }
          } catch (error) {
            console.error('Error notifying customer about bid:', error)
          }
        }
      })
      socket.on("bid_expired", async (data) => {
        console.log("💰 bid_expired from rider:", data)
        
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
        console.log("💰 prescription_approved_by_pharmacy received from client:", data)
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
          console.log(`📤 Broadcasting prescription_approved_by_pharmacy to customer ${recipientUserId} (${recipientSockets.length} sockets)`)

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
        console.log("💰 bid_accepted received from client:", data)
        
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
        console.log("💰 bid_rejected from rider:", data)
        
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
        console.log("🔄 request_update received:", data)
        
        // Broadcast to all riders about the booking update
        const allRiders = Array.from(this.clients.values()).filter(s => 
          s.data?.role === 'RIDER'
        )
        
        console.log(`🔄 Broadcasting request_update to ${allRiders.length} riders`)
        
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
        this.clients.delete(socket.id);
        if (userId) {
          this.removeUserSocket(userId, socket);
          // Check if user still has other active connections
          const remainingSockets = this.getUserSockets(userId);
          // If no more active sockets, user is offline
          if (remainingSockets.length === 0) {
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
    socket.emit("authenticated", { success: true, userId });
    try {
      const unreadCount = await this.getUnreadCount(userId);
      socket.emit("notification_count", { count: unreadCount });
    } catch {}
  }

  private getUserSockets(userId: string): AuthenticatedSocket[] {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return [];
  
    // Filter out disconnected sockets
    const aliveSockets = Array.from(sockets).filter((s) => s.connected);
  
    // Replace the set with alive only (garbage collect dead ones)
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

      const radiusKm = 30
      const rideTypeVehicleRaw =
        (merged as any)?.rideType?.vehicleType ??
        (merged as any)?.vehicleType ??
        (merged as any)?.requestedVehicleType
      const rideTypeVehicle =
        typeof rideTypeVehicleRaw === "string" ? rideTypeVehicleRaw.toUpperCase() : null
      const requestModuleRaw = (merged as any)?.module
      const requestModule = typeof requestModuleRaw === "string" ? requestModuleRaw.toUpperCase() : null
      const requestTypeRaw = (merged as any)?.type ?? (merged as any)?.requestType
      const requestType = typeof requestTypeRaw === "string" ? requestTypeRaw.toLowerCase() : "courier"
      const nearbyRiders = await this.findNearbyRiders(
        pickupLat,
        pickupLng,
        radiusKm,
        {
          type: requestType,
          module: requestModule,
          rideTypeVehicle,
        }
      )

      

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

  // Find nearby riders within radius
  private async findNearbyRiders(
    latitude: number,
    longitude: number,
    radiusKm: number,
    requestContext?: { type?: string | null; module?: string | null; rideTypeVehicle?: string | null }
  ) {
    try {
      // Find all available riders with their profiles
      const riders = await prisma.riderProfile.findMany({
        where: {
          isAvailable: true,
          status: 'APPROVED',
          currentLocation: {
            not: null as any,
          },
          lastLocationUpdate: {
            gte: new Date(Date.now() - 10 * 60 * 1000) // Location updated within last 10 minutes
          }
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
            }
          }
        },
        take: 200
      })

      const nearbyRiders: Array<{ userId: string; distance: number }> = []

      for (const rider of riders) {
        const location = rider.currentLocation as any
        
        if (!location || !location.latitude || !location.longitude) {
          continue
        }

        const distance = this.calculateDistance(
          latitude,
          longitude,
          location.latitude,
          location.longitude
        )

        const riderMaxKm = Number(rider.maxDeliveryDistance || 0)
        const effectiveRiderMaxKm = riderMaxKm > 0 ? riderMaxKm : 10
        if (distance > radiusKm || distance > effectiveRiderMaxKm) {
          continue
        }

        if (requestContext?.rideTypeVehicle) {
          const riderFilter = buildRiderServiceFilter(
            rider.serviceTypes,
            rider.modules,
            rider.vehicleType as any
          )
          const matches =
            requestContext.type === "ride"
              ? rideBookingMatchesRider(riderFilter, requestContext.rideTypeVehicle as any)
              : courierMatchesRider(
                  riderFilter,
                  requestContext.module ?? null,
                  requestContext.rideTypeVehicle as any
                )
          if (!matches) {
            continue
          }
        }

        if (distance <= radiusKm) {
          nearbyRiders.push({
            userId: rider.userId,
            distance
          })
        }
      }

      // Sort by distance (closest first)
      return nearbyRiders.sort((a, b) => a.distance - b.distance)
    } catch (error) {
      console.error('Error finding nearby riders:', error)
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
    console.log("🚗 sendNewRideToUser called for userId:", userId);
    console.log("🚗 Total clients:", this.clients.size);
    console.log("🚗 User sockets map:", this.userSockets.size);
    console.log("🚗 Sockets for user:", this.getUserSockets(userId)); 
    
    // Safety gate: do not emit mismatched rideType/module requests to this rider.
    try {
      const rider = await prisma.riderProfile.findUnique({
        where: { userId },
        select: { vehicleType: true, serviceTypes: true, modules: true, maxDeliveryDistance: true, currentLocation: true },
      })
      const rideTypeVehicleRaw = ride?.rideType?.vehicleType ?? ride?.vehicleType ?? ride?.requestedVehicleType
      const rideTypeVehicle = typeof rideTypeVehicleRaw === "string" ? rideTypeVehicleRaw.toUpperCase() : null
      const requestType = String(ride?.type || ride?.requestType || "courier").toLowerCase()
      const requestModule = typeof ride?.module === "string" ? ride.module.toUpperCase() : null

      if (!rider) {
        return
      }
      if (rideTypeVehicle) {
        const filter = buildRiderServiceFilter(rider.serviceTypes, rider.modules, rider.vehicleType as any)
        const allowed =
          requestType === "ride"
            ? rideBookingMatchesRider(filter, rideTypeVehicle as any)
            : courierMatchesRider(filter, requestModule, rideTypeVehicle as any)
        if (!allowed) {
          return
        }
      }

      const rLoc = rider.currentLocation as any
      const pLat = Number(ride?.pickupLatitude)
      const pLng = Number(ride?.pickupLongitude)
      if (
        rLoc &&
        Number.isFinite(pLat) &&
        Number.isFinite(pLng) &&
        Number.isFinite(Number(rLoc.latitude)) &&
        Number.isFinite(Number(rLoc.longitude))
      ) {
        const d = this.calculateDistance(Number(rLoc.latitude), Number(rLoc.longitude), pLat, pLng)
        const riderMaxKm = Number(rider.maxDeliveryDistance || 0) > 0 ? Number(rider.maxDeliveryDistance) : 10
        if (d > riderMaxKm) {
          return
        }
      }
    } catch {
      return
    }

    const sockets = this.getUserSockets(userId);
    if (!sockets.length) {
      console.warn(`⚠️ No active sockets for user eeeee ${userId}`);
      console.log("🚗 All connected users:", this.listConnectedUsers());
      return;
    }

    const dispatchRoom = `rider_dispatch:${userId}`
    const roomMembers = this.io?.sockets.adapter.rooms.get(dispatchRoom)
    if (!roomMembers || roomMembers.size === 0) {
      console.warn(`⚠️ Rider ${userId} not in dispatch room; skipping new request emit`);
      return;
    }

    this.io?.to(dispatchRoom).emit("new_request", ride)
    this.io?.to(dispatchRoom).emit("new_requests", ride)
  }

  async sendNotificationToUser(userId: string, notification: any) {
    console.log('🔔 sendNotificationToUser called for userId:', userId)
    console.log('🔔 notification:', notification)
    const sockets = this.getUserSockets(userId);
    if (!sockets.length) {

      
      // Fallback: try to find user by checking all sockets
      const fallbackSockets = Array.from(this.clients.values()).filter(s => 
        s.data?.userId === userId && s.connected
      );
      if (fallbackSockets.length > 0) {
        console.log(`🔄 Found ${fallbackSockets.length} fallback socket(s) for user ${userId}`);
        const eventType = notification.type || 'notification'
        fallbackSockets.forEach((s) => {
          console.log('🔔 Emitting event to fallback socket:', eventType, notification)
          s.emit(eventType, notification);
          
        });
        return;
      }
      return;
    }
    // Emit with the type from notification, or default to 'notification'
    const eventType = notification.type || 'notification'
    console.log(`📤 Emitting ${eventType} to ${sockets.length} socket(s) for user ${userId}`)
    console.log(`📦 Payload structure:`, {
      type: notification.type,
      hasChatId: !!notification.chatId,
      hasFileUrl: !!notification.fileUrl,
      hasMessage: !!notification.message,
      messageType: notification.messageType || notification.message?.messageType,
      fullPayload: JSON.stringify(notification, null, 2)
    })
    
    sockets.forEach((s) => {
      if (s.connected) {
        s.emit(eventType, notification);
        console.log(`✅ Emitted ${eventType} to socket ${s.id} for user ${userId}`)
      } else {
        console.warn(`⚠️ Socket ${s.id} is not connected, skipping emission`)
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

  private startClientsMonitoring() {
    if (this.clientsCheckInterval) return;
    this.clientsCheckInterval = setInterval(() => {
      const disconnected = Array.from(this.clients.entries())
        .filter(([_, c]) => !c.connected)
        .map(([id]) => id);
      disconnected.forEach((id) => this.clients.delete(id));
      if (disconnected.length)
        console.log("🧹 Cleaned disconnected sockets:", disconnected);
    }, 30000);
  }

  /** Real-time part-request room: clients send `auto_parts_subscribe` with { requestId }. */
  emitAutoPartsRequestRoom(requestId: string, payload: Record<string, unknown>) {
    if (!this.io || !requestId) return;
    console.log("emitAutoPartsRequestRoom", requestId, payload)
    this.io.to(`ap_req:${requestId}`).emit("auto_parts_update", { ...payload, requestId });
  }
  emitAutoPartsQuoteRoom(quoteId: string, payload: Record<string, unknown>) {
    if (!this.io || !quoteId) return;
    console.log("emitAutoPartsQuoteRoom", quoteId, payload);
    const base = { ...payload, quoteId };
    /** Room listeners use `auto_parts_update`; detail screens also subscribe to `auto_parts_quote_update` (parity with per-user push). */
    this.io.to(`ap_quote:${quoteId}`).emit("auto_parts_update", base);
    this.io.to(`ap_quote:${quoteId}`).emit("auto_parts_quote_update", base);
  }
  emitAutoPartsServiceRequestRoom(serviceRequestId: string, payload: Record<string, unknown>) {
    if (!this.io || !serviceRequestId) return;
    console.log("emitAutoPartsServiceRequestRoom", serviceRequestId, payload)
    this.io.to(`ap_req:${serviceRequestId}`).emit("auto_parts_update", { ...payload, serviceRequestId });
  }

  getStats() {
    return {
      totalConnections: this.totalConnections,
      authenticatedConnections: this.clients.size,
      isRunning: this.io !== null,
      isInitialized: this.io !== null,
      userSocketsCount: this.userSockets.size,
    };
  }

  listConnectedUsers() {
    return Array.from(this.clients.values()).map((c) => ({
      socketId: c.id,
      userId: c.data?.userId,
      role: c.data?.role,
      connected: c.connected,
    }));
  }
}

// Singleton
let instance: SocketIOServer | null = null;
export const socketIOServer = (() => {
  if (!instance) {
    instance = new SocketIOServer();

    console.log('🔌 Created new SocketIOServer instance');
  }
  return instance;
})();

// Global socket server instance for API routes
declare global {
  var __socketIOServer: SocketIOServer | undefined;
}

// Ensure we have a global instance for API routes
if (typeof global !== 'undefined' && !global.__socketIOServer) {
  global.__socketIOServer = socketIOServer;
}

// Export a function to get the global instance
export function getGlobalSocketServer(): SocketIOServer {
  if (typeof global !== 'undefined' && global.__socketIOServer) {
    return global.__socketIOServer;
  }
  return socketIOServer;
}
