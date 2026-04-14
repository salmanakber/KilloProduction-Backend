import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';
import { NotificationBridge } from '@/lib/notification-bridge';

// POST /api/pharmacy/prescription-queue/initiate
// Called by customer to start the AI prescription review flow with a chosen pharmacy
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      pharmacyId,
      medicines,       // Array of { medicineId?, medicineName, quantity, price } from pharmacy availability
      aiResponse,      // AI analysis response (stringified or object)
      userPrompt,      // User's original symptom/text prompt (string or array)
      matchScore,      // Pharmacy match score from AI (0-100)
      prescriptionData // AI prescription object { title, prioritizedMedicines, ... }
    } = body;
    
    // Normalize userPrompt to string if it's an array
    const normalizedUserPrompt = Array.isArray(userPrompt) 
      ? userPrompt.join(', ') 
      : (typeof userPrompt === 'string' ? userPrompt : null);

    if (!pharmacyId || !medicines) {
      return NextResponse.json({ error: 'pharmacyId and medicines are required' }, { status: 400 });
    }

    // Get pharmacy + pharmacy user details
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, pharmacyName: true, userId: true }
    });

    if (!pharmacy) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 });
    }

    // Get customer name
    const customer = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true }
    });

    // Find or create a PharmacyChat for this customer+pharmacy pair
    let chat = await prisma.pharmacyChat.findFirst({
      where: { userId: user.id, pharmacyId }
    });

    if (!chat) {
      chat = await prisma.pharmacyChat.create({
        data: { userId: user.id, pharmacyId, isActive: true }
      });
    }

    // Create PrescriptionQueue entry (linked to chat)
    const queueEntry = await prisma.prescriptionQueue.create({
      data: {
        customerId: user.id,
        pharmacyId,
        chatId: chat.id,
        medicines: Array.isArray(medicines) ? medicines : [],
        prescriptionData: prescriptionData ?? null,
        aiResponse: aiResponse ?? null,
        userPrompt: normalizedUserPrompt,
        matchScore: typeof matchScore === 'number' ? matchScore : null,
        status: 'PENDING_PHARMACY_REVIEW',
        totalCost: null
      }
    });

    // Notification data structure (reused for DB + socket)
    const notificationData = {
      actionType: 'navigate',
      screen: 'Chat',
      params: [
        { name: 'chatId',          value: chat.id },
        { name: 'queueId',         value: queueEntry.id },
        { name: 'customerName',    value: customer?.name ?? 'Customer' },
        { name: 'pharmacyId',      value: pharmacyId },
        { name: 'matchScore',      value: matchScore ?? 0 },
        { name: 'prescriptionData', value: prescriptionData ?? null },
        { name: 'aiResponse',      value: aiResponse ?? null },
        { name: 'userPrompt',      value: normalizedUserPrompt ?? '' },
        { name: 'isVendorReview',  value: true },
      ],
      // Also keep flat keys for direct access
      queueId:       queueEntry.id,
      chatId:        chat.id,
      matchScore:    matchScore ?? 0,
      customerName:  customer?.name ?? 'Customer',
      customerId:    user.id,
      prescriptionData,
      aiResponse,
      userPrompt,
    };

    const notificationTitle = '🤖 SuperKillo AI Match!';
    const notificationMessage = `A customer was matched to your pharmacy by AI${matchScore ? ` (${matchScore}% match)` : ''}. Tap to review the prescription.`;

    // Use NotificationBridge helper to handle DB + WebSocket notification
    await NotificationBridge.notifyPharmacyAIMatch({
      pharmacyUserId: pharmacy.userId,
      pharmacyId,
      chatId: chat.id,
      queueId: queueEntry.id,
      customerName: customer?.name ?? 'Customer',
      matchScore: matchScore ?? 0,
      prescriptionData: prescriptionData ?? notificationData.prescriptionData,
      aiResponse,
      userPrompt: normalizedUserPrompt ?? undefined,
    });

    return NextResponse.json({
      queueId: queueEntry.id,
      chatId:  chat.id,
      message: 'Prescription queue initiated – pharmacy notified.',
    });
  } catch (error) {
    console.error('Error initiating prescription queue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
