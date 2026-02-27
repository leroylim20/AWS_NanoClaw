import bcrypt from 'bcrypt';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const SECRET_NAME = 'nanoclaw/skills-password';

export async function verifyPassword(password: string): Promise<boolean> {
  try {
    // Initialize AWS Secrets Manager client
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

    // Retrieve the secret
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: SECRET_NAME }),
    );

    if (!response.SecretString) {
      throw new Error('Secret not found or empty');
    }

    const secret = JSON.parse(response.SecretString);
    const hash = secret.passwordHash;

    // Verify the password against the hash
    return await bcrypt.compare(password, hash);
  } catch (error: any) {
    console.error('Error verifying password:', error.message);
    return false;
  }
}

export async function requirePassword(): Promise<void> {
  const password = process.env.NANOCLAW_PASSWORD;

  if (!password) {
    console.error('\n❌ Password required to execute this command.');
    console.error('Set NANOCLAW_PASSWORD environment variable:\n');
    console.error('  export NANOCLAW_PASSWORD="your-password"');
    console.error('  npx tsx scripts/apply-skill.ts <skill-dir>\n');
    process.exit(1);
  }

  const isValid = await verifyPassword(password);

  if (!isValid) {
    console.error('\n❌ Invalid password.\n');
    process.exit(1);
  }
}
