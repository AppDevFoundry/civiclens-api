/**
 * Generate Test Token CLI
 *
 * Creates a test user and generates a JWT token for development/testing.
 * Usage: npm run dev:token
 */

import devAuth from '../app/utils/dev-auth';

async function generateToken() {
  console.log('🔐 Development Token Generator');
  console.log('================================\n');

  try {
    const user = await devAuth.getOrCreateTestUser();

    console.log('✅ Test User:');
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${devAuth.TEST_USER.password}`);
    console.log(`   User ID: ${user.id}\n`);

    console.log('🎫 JWT Token:');
    console.log(`   ${user.token}\n`);

    console.log('📋 Authorization Header:');
    console.log(`   Authorization: Token ${user.token}\n`);

    console.log('💡 Usage Examples:\n');
    console.log('   # Using curl:');
    console.log(`   curl -H "Authorization: Token ${user.token}" http://localhost:3000/api/watchlist\n`);

    console.log('   # Using HTTPie:');
    console.log(`   http GET localhost:3000/api/watchlist "Authorization: Token ${user.token}"\n`);

    console.log('   # Using axios:');
    console.log('   axios.get(\'/api/watchlist\', {');
    console.log(`     headers: { Authorization: \'Token ${user.token}\' }`);
    console.log('   })\n');

    console.log('✅ Token generated successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating token:', error);
    process.exit(1);
  }
}

generateToken();
