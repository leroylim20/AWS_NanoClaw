/**
 * Authentication Validator
 *
 * SECURITY: This module enforces that ONLY AWS Bedrock authentication is allowed.
 * All other authentication methods are blocked at startup.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const BLOCKED_AUTH_METHODS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

/**
 * Validates that only Bedrock authentication is configured.
 * Exits the process if any blocked authentication methods are found.
 */
export function validateBedrockOnly(): void {
  const envFile = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envFile)) {
    logger.error('❌ .env file not found');
    logger.error(
      'Required: AWS_REGION and BEDROCK_MODEL_ID must be configured',
    );
    process.exit(1);
  }

  const content = fs.readFileSync(envFile, 'utf-8');

  // Check for blocked authentication methods
  for (const blockedKey of BLOCKED_AUTH_METHODS) {
    const regex = new RegExp(`^${blockedKey}=`, 'm');
    if (regex.test(content)) {
      logger.error(
        `❌ SECURITY: ${blockedKey} is not allowed. Only AWS Bedrock authentication is permitted.`,
      );
      logger.error('Remove the following line from .env:');
      logger.error(`  ${blockedKey}=...`);
      process.exit(1);
    }
  }

  // Check for required Bedrock configuration
  const hasRegion = /^AWS_REGION=/m.test(content);
  const hasModelId = /^BEDROCK_MODEL_ID=/m.test(content);

  if (!hasRegion || !hasModelId) {
    logger.error('❌ Bedrock configuration incomplete');
    logger.error('Required in .env:');
    logger.error('  AWS_REGION=us-east-1');
    logger.error(
      '  BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    );
    process.exit(1);
  }

  logger.info('✓ Bedrock authentication validated');
}
