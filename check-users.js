const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    console.log('🔍 Checking existing users...');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isVerified: true
      },
      take: 5
    });
    
    console.log('📊 Found users:', users.length);
    users.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - ${user.role} - Active: ${user.isActive} - Verified: ${user.isVerified}`);
    });
    
    if (users.length === 0) {
      console.log('❌ No users found in database');
    } else {
      console.log('✅ Users found, you can use one of these for testing');
    }
    
  } catch (error) {
    console.error('❌ Error checking users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();


