/**
 * Article Summarizer
 *
 * Generates short and detailed summaries using OpenAI GPT
 */

import OpenAI from 'openai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { upsertSummary, logProcessing } from '../db/queries.js';
import type { Article, ArticleSummary } from '../types/index.js';

/**
 * Summary generation result
 */
export interface SummaryResult {
  shortSummary: string;
  detailedSummary: string;
  tokensUsed: number;
}

/**
 * Batch summarization result
 */
export interface BatchSummaryResult {
  processed: number;
  successful: number;
  failed: number;
  totalTokens: number;
}

/**
 * Create OpenAI client
 */
function createClient(): OpenAI {
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey: config.openai.apiKey });
}

/**
 * System prompt for article summarization
 */
const SYSTEM_PROMPT = `Tu es un analyste financier expert spécialisé dans le secteur technologique.
Ta tâche est de résumer des articles de presse financière de manière claire et concise.

Pour chaque article, génère:
1. Un résumé court (2-3 phrases, max 150 caractères) pour une lecture rapide
2. Un résumé détaillé (1-2 paragraphes) avec les points clés et implications pour les investisseurs

Réponds en JSON avec ce format exact:
{
  "shortSummary": "Résumé court en 2-3 phrases",
  "detailedSummary": "Résumé détaillé avec analyse et implications"
}

Consignes:
- Utilise un ton professionnel et factuel
- Mentionne les entreprises et chiffres clés
- Indique les implications potentielles pour les investisseurs
- Écris en français`;

/**
 * Generate summary for a single article
 */
export async function summarizeArticle(article: Article): Promise<SummaryResult> {
  const client = createClient();

  const userPrompt = `Résume cet article:

Titre: ${article.title}

Contenu:
${article.content.slice(0, 3000)}

Source: ${article.source}
Date: ${article.publishedAt.toLocaleDateString('fr-FR')}`;

  logger.debug({ articleId: article.id, title: article.title.slice(0, 50) }, 'Generating summary');

  const response = await withRetry(
    async () => {
      return client.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });
    },
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      factor: 2,
    }
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  const parsed = JSON.parse(content) as {
    shortSummary: string;
    detailedSummary: string;
  };

  const result: SummaryResult = {
    shortSummary: parsed.shortSummary,
    detailedSummary: parsed.detailedSummary,
    tokensUsed: response.usage?.total_tokens ?? 0,
  };

  logger.debug(
    {
      articleId: article.id,
      shortLength: result.shortSummary.length,
      detailedLength: result.detailedSummary.length,
      tokensUsed: result.tokensUsed,
    },
    'Summary generated'
  );

  return result;
}

/**
 * Summarize article and save to database
 */
export async function summarizeAndSave(article: Article): Promise<SummaryResult | null> {
  try {
    const result = await summarizeArticle(article);

    // Save to database
    upsertSummary(
      article.id,
      result.shortSummary,
      result.detailedSummary,
      result.tokensUsed
    );

    // Log successful processing
    logProcessing(article.id, 'summarized', 'success');

    logger.info(
      { articleId: article.id, tokensUsed: result.tokensUsed },
      'Article summarized and saved'
    );

    return result;
  } catch (error) {
    logger.error({ error, articleId: article.id }, 'Failed to summarize article');
    logProcessing(article.id, 'summarized', 'failed', String(error));
    return null;
  }
}

/**
 * Summarize multiple articles
 */
export async function summarizeArticles(
  articles: Article[],
  options: { maxConcurrent?: number; delayMs?: number } = {}
): Promise<BatchSummaryResult> {
  const { maxConcurrent = 2, delayMs = 1000 } = options;

  const result: BatchSummaryResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    totalTokens: 0,
  };

  logger.info({ count: articles.length }, 'Starting batch summarization');

  // Process in batches
  for (let i = 0; i < articles.length; i += maxConcurrent) {
    const batch = articles.slice(i, i + maxConcurrent);

    const batchResults = await Promise.all(
      batch.map(async (article) => {
        const summaryResult = await summarizeAndSave(article);
        return { success: !!summaryResult, tokens: summaryResult?.tokensUsed ?? 0 };
      })
    );

    for (const { success, tokens } of batchResults) {
      result.processed++;
      if (success) {
        result.successful++;
        result.totalTokens += tokens;
      } else {
        result.failed++;
      }
    }

    // Delay between batches to respect rate limits
    if (i + maxConcurrent < articles.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.info(
    {
      processed: result.processed,
      successful: result.successful,
      failed: result.failed,
      totalTokens: result.totalTokens,
    },
    'Batch summarization complete'
  );

  return result;
}

/**
 * Check if summarization is available
 */
export function isSummarizationAvailable(): boolean {
  return !!config.openai.apiKey;
}
