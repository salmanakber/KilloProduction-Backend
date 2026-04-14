import { prisma } from "@/lib/prisma"

interface FirebaseConfig {
  projectId: string
  projectName: string
  apiKey: string
  authDomain: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

interface PushNotificationPayload {
  title: string
  body: string
  data?: any
  imageUrl?: string
  actionUrl?: string
}

export class FirebaseService {
  private static admin: any = null
  private static config: FirebaseConfig | null = null

  /**
   * Initialize Firebase Admin SDK
   */
  static async initialize() {
    try {
      // Get active Firebase configuration
      const firebaseConfig = await prisma.firebaseConfig.findFirst({
        where: { isActive: true }
      })

      if (!firebaseConfig) {
        console.warn("No active Firebase configuration found")
        return false
      }

      this.config = {
        projectId: firebaseConfig.projectId,
        projectName: firebaseConfig.projectName,
        apiKey: firebaseConfig.apiKey,
        authDomain: firebaseConfig.authDomain,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId,
        measurementId: firebaseConfig.measurementId
      }

      // Initialize Firebase Admin SDK
      if (!this.admin) {
        const admin = require('firebase-admin')
        
        // Check if already initialized
        if (admin.apps.length === 0) {
          // Try to use service account credentials first
          if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
              const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
              this.admin = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: this.config.projectId
              })
            } catch (error) {
              console.warn("Failed to parse service account key, using default credentials")
              this.admin = admin.initializeApp({
                projectId: this.config.projectId
              })
            }
          } else {
            // Use default credentials (for development)
            this.admin = admin.initializeApp({
              projectId: this.config.projectId
            })
          }
        } else {
          this.admin = admin
        }
      }

    return true
  } catch (error) {
      console.error("Firebase initialization error:", error)
    return false
  }
}

  /**
   * Send push notification to a device token
   */
  static async sendToDevice(token: string, payload: PushNotificationPayload) {
    try {
      if (!this.admin) {
        const initialized = await this.initialize()
        if (!initialized) {
          throw new Error("Firebase not initialized")
        }
      }

      const message = {
        token: token,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl
        },
        data: payload.data || {},
        android: {
          notification: {
            clickAction: payload.actionUrl,
            icon: 'ic_notification',
            color: '#00C851',
            sound: 'default',
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body
              },
              'mutable-content': 1,
              'content-available': 1,
              sound: 'default',
              badge: 1
            }
          },
          fcmOptions: {
            imageUrl: payload.imageUrl
          }
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
            data: payload.data
          }
        }
      }

      const response = await this.admin.messaging().send(message)
      console.log('Successfully sent message:', response)
      return response
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }

  /**
   * Send push notification to multiple device tokens
   */
  static async sendToMultipleDevices(tokens: string[], payload: PushNotificationPayload) {
    try {
      if (!this.admin) {
        const initialized = await this.initialize()
        if (!initialized) {
          throw new Error("Firebase not initialized")
        }
      }

      const message = {
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl
        },
        data: payload.data || {},
        android: {
          notification: {
            clickAction: payload.actionUrl,
            icon: 'ic_notification',
            color: '#00C851',
            sound: 'default',
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body
              },
              'mutable-content': 1,
              'content-available': 1,
              sound: 'default',
              badge: 1
            }
          },
          fcmOptions: {
            imageUrl: payload.imageUrl
          }
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
            data: payload.data
          }
        }
      }

      const response = await this.admin.messaging().sendMulticast({
        tokens: tokens,
        ...message
      })

      console.log('Successfully sent messages:', response.successCount, 'of', tokens.length)
      return response
    } catch (error) {
      console.error('Error sending messages:', error)
      throw error
    }
  }

  /**
   * Send push notification to a topic
   */
  static async sendToTopic(topic: string, payload: PushNotificationPayload) {
    try {
      if (!this.admin) {
        const initialized = await this.initialize()
        if (!initialized) {
          throw new Error("Firebase not initialized")
        }
      }

      const message = {
        topic: topic,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl
        },
        data: payload.data || {},
        android: {
          notification: {
            clickAction: payload.actionUrl,
            icon: 'ic_notification',
            color: '#00C851',
            sound: 'default',
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body
              },
              'mutable-content': 1,
              'content-available': 1,
              sound: 'default',
              badge: 1
            }
          },
          fcmOptions: {
            imageUrl: payload.imageUrl
          }
        }
      }

      const response = await this.admin.messaging().send(message)
      console.log('Successfully sent message to topic:', response)
      return response
    } catch (error) {
      console.error('Error sending message to topic:', error)
      throw error
    }
  }

  /**
   * Subscribe device token to a topic
   */
  static async subscribeToTopic(tokens: string[], topic: string) {
    try {
      if (!this.admin) {
        const initialized = await this.initialize()
        if (!initialized) {
          throw new Error("Firebase not initialized")
        }
      }

      const response = await this.admin.messaging().subscribeToTopic(tokens, topic)
      console.log('Successfully subscribed to topic:', response.successCount, 'of', tokens.length)
      return response
    } catch (error) {
      console.error('Error subscribing to topic:', error)
      throw error
    }
  }

  /**
   * Unsubscribe device token from a topic
   */
  static async unsubscribeFromTopic(tokens: string[], topic: string) {
    try {
      if (!this.admin) {
        const initialized = await this.initialize()
        if (!initialized) {
          throw new Error("Firebase not initialized")
        }
      }

      const response = await this.admin.messaging().unsubscribeFromTopic(tokens, topic)
      console.log('Successfully unsubscribed from topic:', response.successCount, 'of', tokens.length)
      return response
  } catch (error) {
      console.error('Error unsubscribing from topic:', error)
      throw error
    }
  }

  /**
   * Get current Firebase configuration
   */
  static getConfig(): FirebaseConfig | null {
    return this.config
  }

  /**
   * Check if Firebase is initialized
   */
  static isInitialized(): boolean {
    return this.admin !== null && this.config !== null
  }
}
