import { verifyPassword } from './verify-password.js';

const password = process.argv[2];

if (!password) {
  console.error('Usage: npx tsx scripts/verify-password-cli.ts <password>');
  process.exit(1);
}

verifyPassword(password)
  .then((isValid) => {
    if (isValid) {
      console.log('✓ Password verified');
      process.exit(0);
    } else {
      console.error('✗ Invalid password');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
