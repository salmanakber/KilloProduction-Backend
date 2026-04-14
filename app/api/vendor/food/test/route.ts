import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Return API documentation and sample data
    return NextResponse.json({
      baseUrl: process.env.NEXT_PUBLIC_API_URL || "https://your-api-domain.com/api",
      authentication: {
        method: "Bearer Token",
        header: "Authorization: Bearer <your-token>",
        description: "Include your authentication token in the Authorization header for all API requests",
      },
      endpoints: [
        {
          method: "GET",
          path: "/vendor/food/dashboard",
          description: "Get dashboard statistics and metrics",
          sampleResponse: {
            todayOrders: 12,
            todayRevenue: 45000,
            pendingOrders: 3,
            totalMenuItems: 24,
            averageRating: 4.8,
            isRestaurantOpen: true,
            monthlyRevenue: 1250000,
          },
        },
        {
          method: "GET",
          path: "/vendor/food/orders",
          description: "Get list of orders",
          queryParams: {
            page: "number (optional, default: 1)",
            limit: "number (optional, default: 20)",
            status: "string (optional, e.g., 'PENDING', 'CONFIRMED', 'DELIVERED')",
            search: "string (optional, search by order number, customer name or phone)",
          },
          sampleResponse: {
            orders: [
              {
                id: "order-id",
                orderNumber: "ORD-001",
                customer: {
                  id: "customer-id",
                  name: "John Doe",
                  phone: "+1234567890",
                  email: "customer@example.com",
                },
                items: [
                  {
                    id: "item-id",
                    productName: "Pizza Margherita",
                    quantity: 2,
                    unitPrice: 15.99,
                    totalPrice: 31.98,
                  },
                ],
                total: 45.98,
                status: "PENDING",
                paymentStatus: "PAID",
                address: {
                  street: "123 Main St",
                  city: "New York",
                  state: "NY",
                  postalCode: "10001",
                },
                createdAt: "2024-01-15T10:30:00Z",
              },
            ],
            pagination: {
              page: 1,
              limit: 20,
              total: 50,
              totalPages: 3,
            },
          },
        },
        {
          method: "PATCH",
          path: "/vendor/food/orders",
          description: "Update order status",
          body: {
            orderId: "string (required)",
            status: "string (required, e.g., 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED')",
          },
          sampleResponse: {
            order: {
              id: "order-id",
              status: "CONFIRMED",
              confirmedAt: "2024-01-15T10:35:00Z",
            },
          },
        },
        {
          method: "GET",
          path: "/vendor/food/restaurant/status",
          description: "Get restaurant status and information",
          sampleResponse: {
            hasRestaurant: true,
            isVerified: true,
            restaurant: {
              id: "restaurant-id",
              name: "My Restaurant",
              isOpen: true,
              isActive: true,
              isVerified: true,
            },
          },
        },
        {
          method: "PUT",
          path: "/vendor/food/restaurant/status",
          description: "Update restaurant open/close status",
          body: {
            isOpen: "boolean (required)",
          },
          sampleResponse: {
            restaurant: {
              id: "restaurant-id",
              name: "My Restaurant",
              isOpen: true,
            },
          },
        },
        {
          method: "GET",
          path: "/vendor/food/offers",
          description: "Get all restaurant offers/promotions",
          queryParams: {
            isActive: "string (optional, 'true' or 'false')",
          },
          sampleResponse: {
            offers: [
              {
                id: "offer-id",
                title: "20% Off All Pizzas",
                description: "Get 20% off on all pizza orders",
                discountType: "PERCENTAGE",
                discountValue: 20,
                minOrderAmount: 25,
                maxDiscount: 10,
                isActive: true,
                startsAt: "2024-01-01T00:00:00Z",
                expiresAt: "2024-12-31T23:59:59Z",
              },
            ],
          },
        },
      ],
      integrationInstructions: {
        title: "POS Integration Guide",
        steps: [
          {
            step: 1,
            title: "Authentication",
            description: "Obtain your API token from the app settings. Include it in all requests as: Authorization: Bearer <your-token>",
          },
          {
            step: 2,
            title: "Polling Orders",
            description: "Set up a polling mechanism to check for new orders every 30-60 seconds using GET /vendor/food/orders?status=PENDING",
          },
          {
            step: 3,
            title: "Update Order Status",
            description: "When you accept an order, update its status to 'CONFIRMED' using PATCH /vendor/food/orders",
          },
          {
            step: 4,
            title: "Track Order Progress",
            description: "Update order status as it progresses: PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED",
          },
          {
            step: 5,
            title: "Handle Restaurant Status",
            description: "Use PUT /vendor/food/restaurant/status to update your restaurant's open/close status when starting/ending your business day",
          },
        ],
      },
      sampleCode: {
        curl: {
          getOrders: `curl -X GET "https://your-api-domain.com/api/vendor/food/orders?status=PENDING" \\
  -H "Authorization: Bearer YOUR_TOKEN_HERE"`,
          updateOrderStatus: `curl -X PATCH "https://your-api-domain.com/api/vendor/food/orders" \\
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"orderId": "order-id", "status": "CONFIRMED"}'`,
        },
        javascript: {
          getOrders: `fetch('https://your-api-domain.com/api/vendor/food/orders?status=PENDING', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN_HERE',
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data));`,
          updateOrderStatus: `fetch('https://your-api-domain.com/api/vendor/food/orders', {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN_HERE',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: 'order-id',
    status: 'CONFIRMED'
  })
})
.then(response => response.json())
.then(data => console.log(data));`,
        },
      },
    })
  } catch (error: any) {
    console.error("Food vendor API documentation error:", error)
    return NextResponse.json(
      {
        error: error.message || "Failed to get API documentation",
      },
      { status: 500 }
    )
  }
}
