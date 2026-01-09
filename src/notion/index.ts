/**
 * Notion Module
 *
 * Push article summaries to Notion database
 */

export {
  pushToNotion,
  pushArticleToNotion,
  pushArticlesToNotion,
  isNotionAvailable,
  type NotionPushResult,
  type BatchPushResult,
} from './client.js';
