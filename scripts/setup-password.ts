import bcrypt from 'bcrypt';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  UpdateSecretCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';

const SALT_ROUNDS = 12;
const SECRET_NAME = 'nanoclaw/skills-password';

async function setupPassword(password: string) {
  // Hash the password
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Initialize AWS Secrets Manager client
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

  try {
    // Try to describe the secret to see if it exists
    await client.send(new DescribeSecretCommand({ SecretId: SECRET_NAME }));

    // Secret exists, update it
    await client.send(
      new UpdateSecretCommand({
        SecretId: SECRET_NAME,
        SecretString: JSON.stringify({ passwordHash: hash }),
      })
    );
    console.log('Password hash updated in AWS Secrets Manager');
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      // Secret doesn't exist, create it
      await client.send(
        new CreateSecretCommand({
          Name: SECRET_NAME,
          Description: 'Password hash for NanoClaw skills system protection',
          SecretString: JSON.stringify({ passwordHash: hash }),
        })
      );
      console.log('Password hash created in AWS Secrets Manager');
    } else {
      throw error;
    }
  }

  console.log(`Secret name: ${SECRET_NAME}`);
  console.log('Password protection enabled successfully!');
}

const password = process.argv[2];
if (!password) {
  console.error('Usage: npx tsx scripts/setup-password.ts <password>');
  process.exit(1);
}

setupPassword(password).catch((err) => {
  console.error('Error setting up password:', err.message);
  process.exit(1);
});
