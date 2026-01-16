/**
 * @fileoverview Email service for Relay Platform
 * Supports SendGrid, AWS SES, and SMTP transports.
 * @module @relay/email
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Email transport type.
 */
export type EmailTransport = 'sendgrid' | 'ses' | 'smtp' | 'console';

/**
 * Email message configuration.
 */
export interface EmailMessage {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain text body */
  text: string;
  /** HTML body (optional) */
  html?: string;
  /** Reply-to address (optional) */
  replyTo?: string;
}

/**
 * Email service configuration.
 */
export interface EmailConfig {
  /** Email transport to use */
  transport: EmailTransport;
  /** From address for all emails */
  fromAddress: string;
  /** From name for all emails */
  fromName: string;
  /** SendGrid API key (for sendgrid transport) */
  sendgridApiKey?: string;
  /** AWS region (for ses transport) */
  awsRegion?: string;
  /** AWS access key ID (for ses transport) */
  awsAccessKeyId?: string;
  /** AWS secret access key (for ses transport) */
  awsSecretAccessKey?: string;
  /** SMTP host (for smtp transport) */
  smtpHost?: string;
  /** SMTP port (for smtp transport) */
  smtpPort?: number;
  /** SMTP username (for smtp transport) */
  smtpUser?: string;
  /** SMTP password (for smtp transport) */
  smtpPass?: string;
  /** SMTP secure connection (for smtp transport) */
  smtpSecure?: boolean;
}

/**
 * Email sending result.
 */
export interface EmailResult {
  /** Whether the email was sent successfully */
  success: boolean;
  /** Message ID if successful */
  messageId?: string;
  /** Error message if failed */
  error?: string;
}

/** Cached SMTP transporter instance */
let smtpTransporter: Transporter | null = null;

/** Cached SES transporter instance */
let sesTransporter: Transporter | null = null;

/**
 * Get email configuration from environment variables.
 * @returns Email configuration
 */
export function getEmailConfig(): EmailConfig {
  // Determine transport based on available environment variables
  let transport: EmailTransport = 'console';

  if (process.env.SENDGRID_API_KEY) {
    transport = 'sendgrid';
  } else if (process.env.AWS_SES_REGION && process.env.AWS_ACCESS_KEY_ID) {
    transport = 'ses';
  } else if (process.env.SMTP_HOST) {
    transport = 'smtp';
  }

  return {
    transport,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Relay Platform',
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    awsRegion: process.env.AWS_SES_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpSecure: process.env.SMTP_SECURE === 'true',
  };
}

/**
 * Send email via SendGrid.
 * @param message - Email message
 * @param config - Email configuration
 * @returns Email result
 */
async function sendViaSendGrid(message: EmailMessage, config: EmailConfig): Promise<EmailResult> {
  if (!config.sendgridApiKey) {
    return { success: false, error: 'SendGrid API key not configured' };
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: config.fromAddress, name: config.fromName },
        reply_to: message.replyTo ? { email: message.replyTo } : undefined,
        subject: message.subject,
        content: [
          { type: 'text/plain', value: message.text },
          ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
        ],
      }),
    });

    if (response.ok) {
      const messageId = response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;
      return { success: true, messageId };
    }

    const errorText = await response.text();
    return { success: false, error: `SendGrid error: ${response.status} - ${errorText}` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `SendGrid error: ${errorMessage}` };
  }
}

/**
 * Get or create SES transporter using nodemailer's SES transport.
 * Uses SMTP interface to SES for simplicity without AWS SDK dependency.
 * @param config - Email configuration
 * @returns Nodemailer transporter
 */
function getSESTransporter(config: EmailConfig): Transporter {
  if (sesTransporter) {
    return sesTransporter;
  }

  // Use SES SMTP interface - requires IAM credentials with ses:SendRawEmail permission
  const smtpEndpoint = `email-smtp.${config.awsRegion}.amazonaws.com`;

  sesTransporter = nodemailer.createTransport({
    host: smtpEndpoint,
    port: 587,
    secure: false,
    auth: {
      user: config.awsAccessKeyId,
      pass: config.awsSecretAccessKey,
    },
  });

  return sesTransporter;
}

/**
 * Send email via AWS SES using SMTP interface.
 * @param message - Email message
 * @param config - Email configuration
 * @returns Email result
 */
async function sendViaSES(message: EmailMessage, config: EmailConfig): Promise<EmailResult> {
  if (!config.awsRegion || !config.awsAccessKeyId || !config.awsSecretAccessKey) {
    return { success: false, error: 'AWS SES credentials not configured' };
  }

  try {
    const transporter = getSESTransporter(config);

    const mailOptions = {
      from: `${config.fromName} <${config.fromAddress}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `SES error: ${errorMessage}` };
  }
}

/**
 * Get or create SMTP transporter.
 * @param config - Email configuration
 * @returns Nodemailer transporter
 */
function getSMTPTransporter(config: EmailConfig): Transporter {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  smtpTransporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: config.smtpSecure || false,
    auth:
      config.smtpUser && config.smtpPass
        ? {
            user: config.smtpUser,
            pass: config.smtpPass,
          }
        : undefined,
  });

  return smtpTransporter;
}

/**
 * Send email via SMTP.
 * @param message - Email message
 * @param config - Email configuration
 * @returns Email result
 */
async function sendViaSMTP(message: EmailMessage, config: EmailConfig): Promise<EmailResult> {
  if (!config.smtpHost) {
    return { success: false, error: 'SMTP host not configured' };
  }

  try {
    const transporter = getSMTPTransporter(config);

    const mailOptions = {
      from: `${config.fromName} <${config.fromAddress}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `SMTP error: ${errorMessage}` };
  }
}

/**
 * Log email to console (development mode).
 * @param message - Email message
 * @param config - Email configuration
 * @returns Email result
 */
function sendViaConsole(message: EmailMessage, config: EmailConfig): EmailResult {
  console.log('═'.repeat(60));
  console.log('[EMAIL] Development mode - logging to console');
  console.log('═'.repeat(60));
  console.log(`To: ${message.to}`);
  console.log(`From: ${config.fromName} <${config.fromAddress}>`);
  console.log(`Subject: ${message.subject}`);
  if (message.replyTo) {
    console.log(`Reply-To: ${message.replyTo}`);
  }
  console.log('─'.repeat(60));
  console.log(message.text);
  console.log('═'.repeat(60));

  return { success: true, messageId: `console-${Date.now()}` };
}

/**
 * Send an email using the configured transport.
 * @param message - Email message to send
 * @param config - Optional email configuration (defaults to environment-based config)
 * @returns Email result
 */
export async function sendEmail(message: EmailMessage, config?: EmailConfig): Promise<EmailResult> {
  const emailConfig = config || getEmailConfig();

  switch (emailConfig.transport) {
    case 'sendgrid':
      return sendViaSendGrid(message, emailConfig);
    case 'ses':
      return sendViaSES(message, emailConfig);
    case 'smtp':
      return sendViaSMTP(message, emailConfig);
    case 'console':
    default:
      return sendViaConsole(message, emailConfig);
  }
}

/**
 * Verify the email transport is working.
 * Useful for health checks.
 * @param config - Optional email configuration (defaults to environment-based config)
 * @returns Whether the transport is working
 */
export async function verifyEmailTransport(
  config?: EmailConfig
): Promise<{
  ok: boolean;
  transport: string;
  error?: string;
}> {
  const emailConfig = config || getEmailConfig();

  try {
    switch (emailConfig.transport) {
      case 'sendgrid':
        // SendGrid doesn't have a verify endpoint, just check API key is set
        return { ok: !!emailConfig.sendgridApiKey, transport: 'sendgrid' };

      case 'ses': {
        const transporter = getSESTransporter(emailConfig);
        await transporter.verify();
        return { ok: true, transport: 'ses' };
      }

      case 'smtp': {
        const transporter = getSMTPTransporter(emailConfig);
        await transporter.verify();
        return { ok: true, transport: 'smtp' };
      }

      case 'console':
      default:
        return { ok: true, transport: 'console' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, transport: emailConfig.transport, error: errorMessage };
  }
}

/**
 * Create an email message with text and optional HTML content.
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param text - Plain text content
 * @param html - Optional HTML content
 * @param replyTo - Optional reply-to address
 * @returns Email message object
 */
export function createEmailMessage(
  to: string,
  subject: string,
  text: string,
  html?: string,
  replyTo?: string
): EmailMessage {
  return {
    to,
    subject,
    text,
    html,
    replyTo,
  };
}
