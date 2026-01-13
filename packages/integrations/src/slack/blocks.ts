/**
 * @fileoverview Slack Block Kit builder utilities
 * Helper functions for creating Block Kit structures
 * @module @relay/integrations/slack/blocks
 */

import type { SlackBlock, BlockKit } from './types';

/**
 * Creates a section block with text
 * @param text - Text content (markdown supported)
 * @param blockId - Optional block ID
 * @returns Section block
 */
export function section(
  text: string,
  blockId?: string
): BlockKit.SectionBlock {
  return {
    type: 'section',
    text: mrkdwn(text),
    ...(blockId && { blockId }),
  };
}

/**
 * Creates a section block with fields
 * @param fields - Array of field texts
 * @param blockId - Optional block ID
 * @returns Section block with fields
 */
export function sectionWithFields(
  fields: string[],
  blockId?: string
): BlockKit.SectionBlock {
  return {
    type: 'section',
    text: mrkdwn(' '), // Required but can be minimal
    fields: fields.map(mrkdwn),
    ...(blockId && { blockId }),
  };
}

/**
 * Creates a section block with an accessory
 * @param text - Text content
 * @param accessory - Accessory element
 * @param blockId - Optional block ID
 * @returns Section block with accessory
 */
export function sectionWithAccessory(
  text: string,
  accessory: BlockKit.Element,
  blockId?: string
): BlockKit.SectionBlock {
  return {
    type: 'section',
    text: mrkdwn(text),
    accessory,
    ...(blockId && { blockId }),
  };
}

/**
 * Creates a divider block
 * @returns Divider block
 */
export function divider(): BlockKit.DividerBlock {
  return { type: 'divider' };
}

/**
 * Creates a header block
 * @param text - Header text (plain text only)
 * @returns Header block
 */
export function header(text: string): BlockKit.HeaderBlock {
  return {
    type: 'header',
    text: plainText(text),
  };
}

/**
 * Creates a context block
 * @param elements - Array of text or image elements
 * @returns Context block
 */
export function context(
  elements: (string | BlockKit.ImageElement)[]
): BlockKit.ContextBlock {
  return {
    type: 'context',
    elements: elements.map((el) =>
      typeof el === 'string' ? mrkdwn(el) : el
    ),
  };
}

/**
 * Creates an actions block
 * @param elements - Array of interactive elements
 * @param blockId - Optional block ID
 * @returns Actions block
 */
export function actions(
  elements: BlockKit.Element[],
  blockId?: string
): BlockKit.ActionsBlock {
  return {
    type: 'actions',
    elements,
    ...(blockId && { blockId }),
  };
}

/**
 * Creates an image block
 * @param imageUrl - Image URL
 * @param altText - Alt text
 * @param title - Optional title
 * @returns Image block
 */
export function image(
  imageUrl: string,
  altText: string,
  title?: string
): BlockKit.ImageBlock {
  return {
    type: 'image',
    imageUrl,
    altText,
    ...(title && { title: plainText(title) }),
  };
}

/**
 * Creates a plain text object
 * @param text - Text content
 * @param emoji - Enable emoji (default: true)
 * @returns Plain text object
 */
export function plainText(
  text: string,
  emoji: boolean = true
): BlockKit.PlainTextObject {
  return {
    type: 'plain_text',
    text,
    emoji,
  };
}

/**
 * Creates a mrkdwn text object
 * @param text - Markdown text content
 * @param verbatim - Disable link parsing (default: false)
 * @returns Mrkdwn text object
 */
export function mrkdwn(
  text: string,
  verbatim: boolean = false
): BlockKit.MrkdwnObject {
  return {
    type: 'mrkdwn',
    text,
    verbatim,
  };
}

/**
 * Creates a button element
 * @param text - Button text
 * @param actionId - Action ID for handling clicks
 * @param options - Button options
 * @returns Button element
 */
export function button(
  text: string,
  actionId: string,
  options?: {
    value?: string;
    url?: string;
    style?: 'primary' | 'danger';
    confirm?: BlockKit.ConfirmDialog;
  }
): BlockKit.ButtonElement {
  return {
    type: 'button',
    text: plainText(text),
    actionId,
    ...(options?.value && { value: options.value }),
    ...(options?.url && { url: options.url }),
    ...(options?.style && { style: options.style }),
    ...(options?.confirm && { confirm: options.confirm }),
  };
}

/**
 * Creates an image element (for use in context/section)
 * @param imageUrl - Image URL
 * @param altText - Alt text
 * @returns Image element
 */
export function imageElement(
  imageUrl: string,
  altText: string
): BlockKit.ImageElement {
  return {
    type: 'image',
    imageUrl,
    altText,
  };
}

/**
 * Creates a static select element
 * @param actionId - Action ID
 * @param options - Select options
 * @param placeholder - Placeholder text
 * @param initialOption - Initially selected option
 * @returns Static select element
 */
export function staticSelect(
  actionId: string,
  options: Array<{ text: string; value: string; description?: string }>,
  placeholder?: string,
  initialOption?: { text: string; value: string }
): BlockKit.SelectElement {
  return {
    type: 'static_select',
    actionId,
    options: options.map((opt) => ({
      text: plainText(opt.text),
      value: opt.value,
      ...(opt.description && { description: plainText(opt.description) }),
    })),
    ...(placeholder && { placeholder: plainText(placeholder) }),
    ...(initialOption && {
      initialOption: {
        text: plainText(initialOption.text),
        value: initialOption.value,
      },
    }),
  };
}

/**
 * Creates a users select element
 * @param actionId - Action ID
 * @param placeholder - Placeholder text
 * @returns Users select element
 */
export function usersSelect(
  actionId: string,
  placeholder?: string
): BlockKit.SelectElement {
  return {
    type: 'users_select',
    actionId,
    ...(placeholder && { placeholder: plainText(placeholder) }),
  };
}

/**
 * Creates a channels select element
 * @param actionId - Action ID
 * @param placeholder - Placeholder text
 * @returns Channels select element
 */
export function channelsSelect(
  actionId: string,
  placeholder?: string
): BlockKit.SelectElement {
  return {
    type: 'channels_select',
    actionId,
    ...(placeholder && { placeholder: plainText(placeholder) }),
  };
}

/**
 * Creates an overflow menu element
 * @param actionId - Action ID
 * @param options - Menu options
 * @param confirm - Optional confirm dialog
 * @returns Overflow element
 */
export function overflow(
  actionId: string,
  options: Array<{ text: string; value: string }>,
  confirm?: BlockKit.ConfirmDialog
): BlockKit.OverflowElement {
  return {
    type: 'overflow',
    actionId,
    options: options.map((opt) => ({
      text: plainText(opt.text),
      value: opt.value,
    })),
    ...(confirm && { confirm }),
  };
}

/**
 * Creates a datepicker element
 * @param actionId - Action ID
 * @param placeholder - Placeholder text
 * @param initialDate - Initial date (YYYY-MM-DD format)
 * @returns Datepicker element
 */
export function datepicker(
  actionId: string,
  placeholder?: string,
  initialDate?: string
): BlockKit.DatePickerElement {
  return {
    type: 'datepicker',
    actionId,
    ...(placeholder && { placeholder: plainText(placeholder) }),
    ...(initialDate && { initialDate }),
  };
}

/**
 * Creates a confirm dialog
 * @param title - Dialog title
 * @param text - Dialog text
 * @param confirm - Confirm button text
 * @param deny - Deny button text
 * @param style - Button style
 * @returns Confirm dialog
 */
export function confirmDialog(
  title: string,
  text: string,
  confirm: string = 'Confirm',
  deny: string = 'Cancel',
  style?: 'primary' | 'danger'
): BlockKit.ConfirmDialog {
  return {
    title: plainText(title),
    text: mrkdwn(text),
    confirm: plainText(confirm),
    deny: plainText(deny),
    ...(style && { style }),
  };
}

/**
 * Builds blocks from an array of block-creating functions or blocks
 * @param blocks - Array of blocks or functions returning blocks
 * @returns Array of blocks
 */
export function buildBlocks(
  blocks: Array<SlackBlock | (() => SlackBlock) | null | undefined | false>
): SlackBlock[] {
  return blocks
    .filter((b): b is SlackBlock | (() => SlackBlock) => Boolean(b))
    .map((b) => (typeof b === 'function' ? b() : b));
}

/**
 * Creates a rich message with common patterns
 */
export const RichMessage = {
  /**
   * Creates a success message
   * @param title - Message title
   * @param details - Optional details
   * @returns Blocks for success message
   */
  success(title: string, details?: string): SlackBlock[] {
    return buildBlocks([
      section(`:white_check_mark: *${title}*`),
      details && context([details]),
    ]);
  },

  /**
   * Creates an error message
   * @param title - Message title
   * @param details - Optional details
   * @returns Blocks for error message
   */
  error(title: string, details?: string): SlackBlock[] {
    return buildBlocks([
      section(`:x: *${title}*`),
      details && context([details]),
    ]);
  },

  /**
   * Creates a warning message
   * @param title - Message title
   * @param details - Optional details
   * @returns Blocks for warning message
   */
  warning(title: string, details?: string): SlackBlock[] {
    return buildBlocks([
      section(`:warning: *${title}*`),
      details && context([details]),
    ]);
  },

  /**
   * Creates an info message
   * @param title - Message title
   * @param details - Optional details
   * @returns Blocks for info message
   */
  info(title: string, details?: string): SlackBlock[] {
    return buildBlocks([
      section(`:information_source: *${title}*`),
      details && context([details]),
    ]);
  },
};
