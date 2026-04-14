const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getUserIds() {
  try {
    console.log('🔍 Getting user IDs...');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      take: 3
    });
    
    console.log('📊 User IDs:');
    users.forEach(user => {
      console.log(`  - ${user.name} (${user.role}): ${user.id}`);
    });
    
    return users[0]?.id; // Return first user ID
    
  } catch (error) {
    console.error('❌ Error getting user IDs:', error);
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

getUserIds().then(userId => {
  if (userId) {
    console.log(`\n✅ Use this user ID for testing: ${userId}`);
  }
  process.exit(0);
});


