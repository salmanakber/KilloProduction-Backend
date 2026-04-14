const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function showWholesalerTestData() {
  try {
    console.log('📊 Wholesaler Test Data Summary')
    console.log('================================\n')

    // Get all wholesalers with their details
    const wholesalers = await prisma.wholesaler.findMany({
      include: {
        user: {
          select: {
            email: true,
            isActive: true,
          },
        },
        wholesalerProducts: {
          where: { isActive: true },
          select: {
            name: true,
            unitPrice: true,
            stock: true,
            category: true,
          },
        },
        _count: {
          select: {
            wholesalerProducts: true,
            supplierOrders: true,
          },
        },
      },
      orderBy: { companyName: 'asc' },
    })

    console.log(`🎯 Total Wholesalers: ${wholesalers.length}`)
    console.log(`📦 Total Products: ${wholesalers.reduce((sum, w) => sum + w._count.wholesalerProducts, 0)}`)
    console.log(`📋 Total Orders: ${wholesalers.reduce((sum, w) => sum + w._count.supplierOrders, 0)}`)

    console.log('\n🏢 Wholesaler Details:')
    console.log('=====================')

    wholesalers.forEach((wholesaler, index) => {
      console.log(`\n${index + 1}. ${wholesaler.companyName}`)
      console.log(`   📧 Email: ${wholesaler.email}`)
      console.log(`   📞 Phone: ${wholesaler.phone}`)
      console.log(`   🏷️  License: ${wholesaler.licenseNumber}`)
      console.log(`   ⭐ Rating: ${wholesaler.rating}/5`)
      console.log(`   📦 Products: ${wholesaler._count.wholesalerProducts}`)
      console.log(`   📋 Orders: ${wholesaler._count.supplierOrders}`)
      console.log(`   ✅ Verified: ${wholesaler.isVerified ? 'Yes' : 'No'}`)
      console.log(`   🔗 Status: ${wholesaler.user.isActive ? 'Active' : 'Inactive'}`)
      console.log(`   💰 Payment Terms: ${wholesaler.paymentTerms}`)
      console.log(`   🎯 Specialties: ${wholesaler.specialties?.join(', ') || 'None'}`)
      console.log(`   🚚 Delivery Zones: ${wholesaler.deliveryZones?.join(', ') || 'None'}`)
      
      if (wholesaler.wholesalerProducts.length > 0) {
        console.log(`   📦 Sample Products:`)
        wholesaler.wholesalerProducts.slice(0, 3).forEach(product => {
          console.log(`      • ${product.name} - ₦${product.unitPrice} (${product.stock} in stock)`)
        })
        if (wholesaler.wholesalerProducts.length > 3) {
          console.log(`      ... and ${wholesaler.wholesalerProducts.length - 3} more`)
        }
      }
    })

    // Get verification statistics
    const verifiedCount = wholesalers.filter(w => w.isVerified).length
    const pendingCount = wholesalers.length - verifiedCount
    const activeCount = wholesalers.filter(w => w.user.isActive).length

    console.log('\n📈 Statistics:')
    console.log('==============')
    console.log(`✅ Verified: ${verifiedCount} (${((verifiedCount / wholesalers.length) * 100).toFixed(1)}%)`)
    console.log(`⏳ Pending: ${pendingCount} (${((pendingCount / wholesalers.length) * 100).toFixed(1)}%)`)
    console.log(`🟢 Active: ${activeCount} (${((activeCount / wholesalers.length) * 100).toFixed(1)}%)`)

    // Get product categories
    const allProducts = await prisma.wholesalerProduct.findMany({
      where: { isActive: true },
      select: { category: true },
    })

    const categories = [...new Set(allProducts.map(p => p.category))]
    console.log(`📦 Product Categories: ${categories.join(', ')}`)

    // Get top performing wholesalers
    const topWholesalers = wholesalers
      .sort((a, b) => b.totalOrders - a.totalOrders)
      .slice(0, 3)

    console.log('\n🏆 Top Performing Wholesalers:')
    console.log('=============================')
    topWholesalers.forEach((wholesaler, index) => {
      console.log(`${index + 1}. ${wholesaler.companyName} - ${wholesaler.totalOrders} orders`)
    })

    console.log('\n🔑 Test Login Credentials:')
    console.log('==========================')
    console.log('Password for all accounts: Password123!')
    console.log('\n📧 Test Emails:')
    wholesalers.forEach(wholesaler => {
      console.log(`   • ${wholesaler.email} - ${wholesaler.companyName}`)
    })

    console.log('\n🎯 Testing Scenarios:')
    console.log('=====================')
    console.log('1. ✅ View all wholesalers in admin dashboard')
    console.log('2. ✅ Search and filter wholesalers')
    console.log('3. ✅ View wholesaler details')
    console.log('4. ✅ Edit wholesaler information')
    console.log('5. ✅ Verify/unverify wholesalers')
    console.log('6. ✅ View wholesaler products')
    console.log('7. ✅ Export wholesaler data')
    console.log('8. ✅ View analytics and statistics')
    console.log('9. ✅ Test email notifications')
    console.log('10. ✅ Test wholesaler login (if wholesaler interface exists)')

    console.log('\n🚀 Ready for Testing!')
    console.log('====================')
    console.log('All wholesaler management features are ready for testing with realistic data.')

  } catch (error) {
    console.error('❌ Error fetching wholesaler data:', error)
  } finally {
    await prisma.$disconnect()
  }
}

showWholesalerTestData()
