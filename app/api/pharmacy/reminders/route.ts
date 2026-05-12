import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authenticateRequest } from "@/lib/auth"
import { NotificationBridge } from '@/lib/notification-bridge';


// GET /api/pharmacy/reminders - Get user's medicine reminders
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reminders = await prisma.medicineReminder.findMany({
      where: {
        userId: user.id,
        isActive: true
      },
      include: {
        medicine: {
          include: {
            centralMedicine: true
          } as any
        }
      },
      orderBy: {
        startDate: 'asc'
      }
    });

    return NextResponse.json({ reminders });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/pharmacy/reminders - Create a new medicine reminder
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      medicineName,
      dosage,
      frequency,
      times,
      duration,
      startDate,
      endDate,
      notes,
      medicineId
    } = body;

    // Validate required fields
    if (!medicineName || !dosage || !frequency || !startDate) {
      return NextResponse.json({ 
        error: 'Missing required fields: medicineName, dosage, frequency, startDate' 
      }, { status: 400 });
    }

    const reminder = await prisma.medicineReminder.create({
      data: {
        userId: user.id,
        medicineName,
        dosage,
        frequency,
        times: times || null,
        duration: duration || null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        notes: notes || null,
        medicineId: medicineId || null
      },
      include: {
        medicine: {
          include: {
            centralMedicine: true
          } as any
        }
      }
    });

    // Create notification for reminder creation
    await NotificationBridge.sendNotification({
        userId: user.id,
        title: 'Medicine Reminder Created',
        message: `Reminder for ${medicineName} has been created successfully`,
        type: 'MEDICINE_REMINDER' as any,
        module: 'PHARMACY',
        data: {
          actionType: 'navigate',
          screen: 'PharmacyReminderDetails',
          params: [
            { name: 'reminderId', value: reminder.id },
          ],
          reminderId: reminder.id
        }
      });

    return NextResponse.json({
      message: 'Reminder created successfully',
      reminder,
    });
  } catch (error) {
    console.error('Error creating reminder:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/pharmacy/reminders/[id] - Update a medicine reminder
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reminderId = searchParams.get('id');

    if (!reminderId) {
      return NextResponse.json({ error: 'Reminder ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const {
      medicineName,
      dosage,
      frequency,
      times,
      duration,
      startDate,
      endDate,
      notes,
      isActive
    } = body;

    // Check if reminder belongs to user
    const existingReminder = await prisma.medicineReminder.findFirst({
      where: {
        id: reminderId,
        userId: user.id
      }
    });

    if (!existingReminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    const updatedReminder = await prisma.medicineReminder.update({
      where: { id: reminderId },
      data: {
        medicineName: medicineName || existingReminder.medicineName,
        dosage: dosage || existingReminder.dosage,
        frequency: frequency || existingReminder.frequency,
        times: times !== undefined ? times : existingReminder.times,
        duration: duration !== undefined ? duration : existingReminder.duration,
        startDate: startDate ? new Date(startDate) : existingReminder.startDate,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : existingReminder.endDate,
        notes: notes !== undefined ? notes : existingReminder.notes,
        isActive: isActive !== undefined ? isActive : existingReminder.isActive
      },
      include: {
        medicine: {
          include: {
            centralMedicine: true
          } as any
        }
      }
    });

    // Create notification for reminder update
    await NotificationBridge.sendNotification({
        userId: user.id,
        title: 'Medicine Reminder Updated',
        message: `Reminder for ${updatedReminder.medicineName} has been updated`,
        type: 'MEDICINE_REMINDER' as any,
        module: 'PHARMACY',
        data: {
          actionType: 'navigate',
          screen: 'PharmacyReminderDetails',
          params: [
            { name: 'reminderId', value: updatedReminder.id },
          ],
          reminderId: updatedReminder.id,
          medicineName: updatedReminder.medicineName
        }
      });

    return NextResponse.json({ message: 'Reminder updated successfully' });
  } catch (error) {
    console.error('Error updating reminder:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/pharmacy/reminders/[id] - Delete a medicine reminder
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reminderId = searchParams.get('id');

    if (!reminderId) {
      return NextResponse.json({ error: 'Reminder ID is required' }, { status: 400 });
    }

    // Check if reminder belongs to user
    const existingReminder = await prisma.medicineReminder.findFirst({
      where: {
        id: reminderId,
        userId: user.id
      }
    });

    if (!existingReminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    await prisma.medicineReminder.delete({
      where: { id: reminderId }
    });

    // Create notification for reminder deletion
    await NotificationBridge.sendNotification({
      userId: user.id,
      title: 'Medicine Reminder Deleted',
      message: `Reminder for ${existingReminder.medicineName} has been deleted`,
      type: 'MEDICINE_REMINDER' as any,
      module: 'PHARMACY',
      data: {
        actionType: 'navigate',
        screen: 'PharmacyReminderDetails',
        params: [
          { name: 'reminderId', value: reminderId },
        ],
        reminderId: reminderId
      }
    });

    return NextResponse.json({ message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
