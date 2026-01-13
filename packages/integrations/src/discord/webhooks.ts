/**
 * @fileoverview Discord webhook verification and parsing
 * @module @relay/integrations/discord/webhooks
 */

import crypto from 'crypto';
import type {
  DiscordInteraction,
  DiscordInteractionType,
  DiscordWebhookEvent,
} from './types';
import { WebhookVerificationError } from '../common/errors';
import type { IntegrationSource, WebhookVerificationResult } from '../common/types';

/**
 * Discord integration source identifier
 */
const SOURCE: IntegrationSource = 'discord';

/**
 * Discord webhook headers
 */
export const DISCORD_HEADERS = {
  /** Signature header */
  SIGNATURE: 'x-signature-ed25519',
  /** Timestamp header */
  TIMESTAMP: 'x-signature-timestamp',
} as const;

/**
 * Verifies a Discord interaction webhook signature using Ed25519
 * @param publicKey - Application public key (hex)
 * @param signature - Signature from X-Signature-Ed25519 header (hex)
 * @param timestamp - Timestamp from X-Signature-Timestamp header
 * @param body - Raw request body
 * @returns Verification result
 */
export function verifyWebhookSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string | Buffer
): WebhookVerificationResult {
  if (!publicKey) {
    return { valid: false, error: 'Public key not configured' };
  }

  if (!signature) {
    return { valid: false, error: 'Missing signature header' };
  }

  if (!timestamp) {
    return { valid: false, error: 'Missing timestamp header' };
  }

  try {
    const bodyString = typeof body === 'string' ? body : body.toString('utf8');
    const message = timestamp + bodyString;

    // Convert hex strings to buffers
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const messageBuffer = Buffer.from(message);

    // Verify Ed25519 signature
    const isValid = crypto.verify(
      null, // Ed25519 doesn't use a hash algorithm
      messageBuffer,
      {
        key: publicKeyBuffer,
        format: 'der',
        type: 'spki',
      },
      signatureBuffer
    );

    return { valid: isValid, error: isValid ? undefined : 'Signature mismatch' };
  } catch (error) {
    // Fallback for older Node.js versions that don't support Ed25519
    // Use tweetnacl or noble-ed25519 in production
    return {
      valid: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}. Consider using tweetnacl for Ed25519 verification.`,
    };
  }
}

/**
 * Parses a Discord webhook payload
 * @param payload - Raw webhook payload
 * @returns Parsed interaction
 */
export function parseWebhookPayload(payload: string | Buffer): DiscordInteraction {
  try {
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
    return JSON.parse(payloadString) as DiscordInteraction;
  } catch (error) {
    throw new WebhookVerificationError(
      SOURCE,
      `Failed to parse webhook payload: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets the interaction type
 * @param interaction - Parsed interaction
 * @returns Interaction type
 */
export function getInteractionType(interaction: DiscordInteraction): DiscordInteractionType {
  return interaction.type;
}

/**
 * Checks if the interaction is a ping
 * @param interaction - Parsed interaction
 * @returns Whether the interaction is a ping
 */
export function isPing(interaction: DiscordInteraction): boolean {
  return interaction.type === 1;
}

/**
 * Checks if the interaction is a command
 * @param interaction - Parsed interaction
 * @returns Whether the interaction is a command
 */
export function isCommand(interaction: DiscordInteraction): boolean {
  return interaction.type === 2;
}

/**
 * Checks if the interaction is a component interaction
 * @param interaction - Parsed interaction
 * @returns Whether the interaction is a component interaction
 */
export function isComponent(interaction: DiscordInteraction): boolean {
  return interaction.type === 3;
}

/**
 * Checks if the interaction is an autocomplete
 * @param interaction - Parsed interaction
 * @returns Whether the interaction is an autocomplete
 */
export function isAutocomplete(interaction: DiscordInteraction): boolean {
  return interaction.type === 4;
}

/**
 * Checks if the interaction is a modal submit
 * @param interaction - Parsed interaction
 * @returns Whether the interaction is a modal submit
 */
export function isModalSubmit(interaction: DiscordInteraction): boolean {
  return interaction.type === 5;
}

/**
 * Gets the command name from an interaction
 * @param interaction - Parsed interaction
 * @returns Command name or null
 */
export function getCommandName(interaction: DiscordInteraction): string | null {
  if (!isCommand(interaction) && !isAutocomplete(interaction)) {
    return null;
  }
  return interaction.data?.name || null;
}

/**
 * Gets the custom ID from a component or modal interaction
 * @param interaction - Parsed interaction
 * @returns Custom ID or null
 */
export function getCustomId(interaction: DiscordInteraction): string | null {
  if (!isComponent(interaction) && !isModalSubmit(interaction)) {
    return null;
  }
  return interaction.data?.custom_id || null;
}

/**
 * Gets command options from an interaction
 * @param interaction - Parsed interaction
 * @returns Command options or empty array
 */
export function getCommandOptions(
  interaction: DiscordInteraction
): Array<{ name: string; value: unknown }> {
  if (!interaction.data?.options) {
    return [];
  }

  return interaction.data.options.map((opt) => ({
    name: opt.name,
    value: opt.value,
  }));
}

/**
 * Gets a specific option value from an interaction
 * @param interaction - Parsed interaction
 * @param optionName - Option name
 * @returns Option value or undefined
 */
export function getOptionValue<T = unknown>(
  interaction: DiscordInteraction,
  optionName: string
): T | undefined {
  const option = interaction.data?.options?.find((opt) => opt.name === optionName);
  return option?.value as T | undefined;
}

/**
 * Gets selected values from a select menu interaction
 * @param interaction - Parsed interaction
 * @returns Selected values or empty array
 */
export function getSelectedValues(interaction: DiscordInteraction): string[] {
  if (!isComponent(interaction)) {
    return [];
  }
  return interaction.data?.values || [];
}

/**
 * Gets the user who triggered the interaction
 * @param interaction - Parsed interaction
 * @returns User or undefined
 */
export function getInteractionUser(interaction: DiscordInteraction) {
  return interaction.member?.user || interaction.user;
}

/**
 * Gets the guild ID from an interaction
 * @param interaction - Parsed interaction
 * @returns Guild ID or undefined
 */
export function getGuildId(interaction: DiscordInteraction): string | undefined {
  return interaction.guild_id;
}

/**
 * Gets the channel ID from an interaction
 * @param interaction - Parsed interaction
 * @returns Channel ID or undefined
 */
export function getChannelId(interaction: DiscordInteraction): string | undefined {
  return interaction.channel_id;
}

/**
 * Creates a PONG response for Discord ping interactions
 * @returns PONG response object
 */
export function createPongResponse(): { type: 1 } {
  return { type: 1 };
}

/**
 * Creates a channel message response
 * @param content - Message content
 * @param ephemeral - Whether the message is ephemeral
 * @returns Response object
 */
export function createMessageResponse(
  content: string,
  ephemeral = false
): {
  type: 4;
  data: { content: string; flags?: number };
} {
  return {
    type: 4,
    data: {
      content,
      flags: ephemeral ? 64 : undefined,
    },
  };
}

/**
 * Creates a deferred response (thinking state)
 * @param ephemeral - Whether the eventual response is ephemeral
 * @returns Response object
 */
export function createDeferredResponse(ephemeral = false): {
  type: 5;
  data?: { flags: number };
} {
  return {
    type: 5,
    data: ephemeral ? { flags: 64 } : undefined,
  };
}

/**
 * Creates a deferred update response for components
 * @returns Response object
 */
export function createDeferredUpdateResponse(): { type: 6 } {
  return { type: 6 };
}

/**
 * Creates an update message response for components
 * @param content - New message content
 * @returns Response object
 */
export function createUpdateResponse(content: string): {
  type: 7;
  data: { content: string };
} {
  return {
    type: 7,
    data: { content },
  };
}
