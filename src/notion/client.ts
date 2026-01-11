/**
 * Notion API Client
 *
 * Pushes article summaries to Notion database
 * Auto-detects database schema and ensures required properties exist
 */

import { Client } from '@notionhq/client';
import type { CreatePageParameters } from '@notionhq/client/build/src/api-endpoints.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { recordNotionSync, logProcessing, getSummary, isArticleSynced } from '../db/queries.js';
import type { Article, ArticleSummary } from '../types/index.js';

/**
 * Notion push result
 */
export interface NotionPushResult {
  success: boolean;
  skipped?: boolean;
  pageId?: string;
  error?: string;
}

/**
 * Batch push result
 */
export interface BatchPushResult {
  processed: number;
  successful: number;
  skipped: number;
  failed: number;
  pageIds: string[];
}

/**
 * Database schema info (cached)
 */
interface DatabaseSchema {
  titleProperty: string;
  hasSource: boolean;
  hasPublishedDate: boolean;
  hasProcessedDate: boolean;
  hasUrl: boolean;
  initialized: boolean;
}

let cachedSchema: DatabaseSchema | null = null;

/**
 * Required property names for the database
 */
const REQUIRED_PROPERTY_NAMES = ['Source', 'Published Date', 'Processed Date', 'URL'] as const;

/**
 * Create Notion client
 */
function createClient(): Client {
  if (!config.notion.apiKey) {
    throw new Error('NOTION_API_KEY is not configured');
  }
  return new Client({ auth: config.notion.apiKey });
}

/**
 * Ensure database has all required properties
 * Creates missing properties if needed
 */
async function ensureDatabaseProperties(
  client: Client,
  databaseId: string
): Promise<DatabaseSchema> {
  // Return cached schema if already initialized
  if (cachedSchema?.initialized) {
    return cachedSchema;
  }

  logger.debug('Checking Notion database schema...');

  try {
    // Retrieve current database schema
    const database = await client.databases.retrieve({ database_id: databaseId });

    // Find title property and check existing properties
    let titleProperty = 'Name';
    const existingProps = new Set<string>();

    for (const [name, prop] of Object.entries(database.properties)) {
      if (prop.type === 'title') {
        titleProperty = name;
      }
      existingProps.add(name);
    }

    // Determine which properties are missing
    const missingPropNames: string[] = [];
    for (const propName of REQUIRED_PROPERTY_NAMES) {
      if (!existingProps.has(propName)) {
        missingPropNames.push(propName);
        logger.debug({ property: propName }, 'Property missing, will create');
      }
    }

    // Add missing properties to database
    if (missingPropNames.length > 0) {
      logger.info(
        { properties: missingPropNames },
        'Adding missing properties to Notion database'
      );

      // Build properties object with correct types
      const updateProps: Parameters<typeof client.databases.update>[0]['properties'] = {};
      for (const propName of missingPropNames) {
        if (propName === 'Source') {
          updateProps[propName] = { select: { options: [] } };
        } else if (propName === 'Published Date' || propName === 'Processed Date') {
          updateProps[propName] = { date: {} };
        } else if (propName === 'URL') {
          updateProps[propName] = { url: {} };
        }
      }

      await client.databases.update({
        database_id: databaseId,
        properties: updateProps,
      });

      logger.info('Database properties updated successfully');
    }

    // Cache and return schema
    cachedSchema = {
      titleProperty,
      hasSource: true,
      hasPublishedDate: true,
      hasProcessedDate: true,
      hasUrl: true,
      initialized: true,
    };

    logger.debug({ titleProperty }, 'Database schema ready');
    return cachedSchema;
  } catch (error) {
    // If we can't update schema, try with minimal properties
    logger.warn({ error }, 'Could not ensure database properties, using minimal schema');

    cachedSchema = {
      titleProperty: 'Name',
      hasSource: false,
      hasPublishedDate: false,
      hasProcessedDate: false,
      hasUrl: false,
      initialized: true,
    };

    return cachedSchema;
  }
}

/**
 * Create Notion page properties from article
 * Includes: title, source, dates, URL (based on schema availability)
 */
function createPageProperties(
  article: Article,
  schema: DatabaseSchema
): CreatePageParameters['properties'] {
  const properties: CreatePageParameters['properties'] = {
    // Title property (always required)
    [schema.titleProperty]: {
      title: [
        {
          text: {
            content: article.title.slice(0, 2000), // Notion limit
          },
        },
      ],
    },
  };

  // Add Source property
  if (schema.hasSource) {
    properties['Source'] = {
      select: {
        name: article.source,
      },
    };
  }

  // Add Published Date property
  if (schema.hasPublishedDate) {
    properties['Published Date'] = {
      date: {
        start: article.publishedAt.toISOString().split('T')[0]!,
      },
    };
  }

  // Add Processed Date property
  if (schema.hasProcessedDate) {
    properties['Processed Date'] = {
      date: {
        start: new Date().toISOString().split('T')[0]!,
      },
    };
  }

  // Add URL property
  if (schema.hasUrl) {
    properties['URL'] = {
      url: article.url,
    };
  }

  return properties;
}

/**
 * Create page content with detailed summary
 */
function createPageContent(
  article: Article,
  summary: ArticleSummary
): CreatePageParameters['children'] {
  const blocks: CreatePageParameters['children'] = [];

  // Short summary as callout
  blocks.push({
    object: 'block',
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '📝' },
      rich_text: [
        {
          type: 'text',
          text: {
            content: summary.shortSummary.slice(0, 2000),
          },
        },
      ],
    },
  });

  // Divider
  blocks.push({
    object: 'block',
    type: 'divider',
    divider: {},
  });

  // Detailed summary heading
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ type: 'text', text: { content: 'Résumé détaillé' } }],
    },
  });

  // Add detailed summary as paragraphs
  if (summary.detailedSummary) {
    const paragraphs = summary.detailedSummary.split('\n\n');
    for (const paragraph of paragraphs) {
      if (paragraph.trim()) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: paragraph.trim().slice(0, 2000),
                },
              },
            ],
          },
        });
      }
    }
  }

  // Divider
  blocks.push({
    object: 'block',
    type: 'divider',
    divider: {},
  });

  // Link to original article
  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: '📎 ' },
        },
        {
          type: 'text',
          text: {
            content: 'Lire l\'article original',
            link: { url: article.url },
          },
        },
      ],
    },
  });

  return blocks;
}

/**
 * Push article summary to Notion
 */
export async function pushToNotion(
  article: Article,
  summary: ArticleSummary
): Promise<NotionPushResult> {
  const client = createClient();

  const databaseId = config.notion.databaseId;
  if (!databaseId) {
    throw new Error('NOTION_DATABASE_ID is not configured');
  }

  logger.debug({ articleId: article.id }, 'Pushing to Notion');

  try {
    // Ensure database has required properties (cached after first call)
    const schema = await ensureDatabaseProperties(client, databaseId);

    // Create content blocks
    const contentBlocks = createPageContent(article, summary);

    const response = await withRetry(
      async () => {
        return client.pages.create({
          parent: {
            database_id: databaseId,
          },
          properties: createPageProperties(article, schema),
          children: contentBlocks,
        });
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        factor: 2,
      }
    );

    const pageId = response.id;

    // Record sync in database
    await recordNotionSync(article.id, pageId);
    await logProcessing(article.id, 'pushed', 'success');

    logger.info({ articleId: article.id, pageId }, 'Pushed to Notion');

    return { success: true, pageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error, articleId: article.id }, 'Failed to push to Notion');
    await logProcessing(article.id, 'pushed', 'failed', errorMessage);

    return { success: false, error: errorMessage };
  }
}

/**
 * Push article to Notion (fetches summary from database)
 * Includes deduplication check to prevent double pushes
 */
export async function pushArticleToNotion(article: Article): Promise<NotionPushResult> {
  // Deduplication check - prevent concurrent pushes
  if (await isArticleSynced(article.id)) {
    logger.debug({ articleId: article.id }, 'Article already synced to Notion, skipping');
    return { success: true, skipped: true }; // Already synced
  }

  const summary = await getSummary(article.id);

  if (!summary) {
    logger.warn({ articleId: article.id }, 'No summary found for article');
    return { success: false, error: 'No summary found' };
  }

  return pushToNotion(article, summary);
}

/**
 * Push multiple articles to Notion
 */
export async function pushArticlesToNotion(
  articles: Article[],
  options: { delayMs?: number } = {}
): Promise<BatchPushResult> {
  const { delayMs = 350 } = options; // Notion rate limit: 3 req/s

  const result: BatchPushResult = {
    processed: 0,
    successful: 0,
    skipped: 0,
    failed: 0,
    pageIds: [],
  };

  logger.info({ count: articles.length }, 'Starting batch push to Notion');

  for (const article of articles) {
    result.processed++;

    const pushResult = await pushArticleToNotion(article);

    if (pushResult.skipped) {
      result.skipped++;
    } else if (pushResult.success && pushResult.pageId) {
      result.successful++;
      result.pageIds.push(pushResult.pageId);
    } else {
      result.failed++;
    }

    // Rate limit
    if (result.processed < articles.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.info(
    {
      processed: result.processed,
      successful: result.successful,
      skipped: result.skipped,
      failed: result.failed,
    },
    'Batch push to Notion complete'
  );

  return result;
}

/**
 * Check if Notion integration is available
 */
export function isNotionAvailable(): boolean {
  return !!config.notion.apiKey && !!config.notion.databaseId;
}

/**
 * Reset cached schema (useful for testing)
 */
export function resetSchemaCache(): void {
  cachedSchema = null;
}
