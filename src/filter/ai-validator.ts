/**
 * AI Validator
 *
 * Uses OpenAI to validate borderline article relevance
 */

import OpenAI from 'openai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import type { Article } from '../types/index.js';

/**
 * AI validation result
 */
export interface AiValidationResult {
  isRelevant: boolean;
  confidence: number;
  reason: string;
  tokensUsed: number;
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
 * System prompt for tech relevance validation
 */
const SYSTEM_PROMPT = `Tu es un expert en analyse financière et technologique.
Ta tâche est de déterminer si un article est pertinent pour un investisseur intéressé par le secteur technologique.

Un article est pertinent s'il traite de:
- Grandes entreprises tech (GAFAM, NVIDIA, Tesla, etc.)
- Semi-conducteurs, IA, cloud computing
- Startups tech, fintech, biotech
- Marchés financiers liés à la tech
- Régulation tech, antitrust tech

Un article n'est PAS pertinent s'il traite uniquement de:
- Économie générale sans lien tech
- Immobilier, énergie traditionnelle, banques classiques
- Politique sans impact tech
- Sport, divertissement

Réponds en JSON avec ce format:
{
  "isRelevant": true/false,
  "confidence": 0.0-1.0,
  "reason": "explication courte en français"
}`;

/**
 * Validate an article using AI
 */
export async function validateWithAi(article: Article): Promise<AiValidationResult> {
  const client = createClient();

  const userPrompt = `Analyse cet article:

Titre: ${article.title}

Contenu: ${article.content.slice(0, 1500)}

Est-il pertinent pour un investisseur tech?`;

  logger.debug({ articleId: article.id }, 'Validating article with AI');

  const response = await withRetry(
    async () => {
      return client.chat.completions.create({
        model: config.openai.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
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
    isRelevant: boolean;
    confidence: number;
    reason: string;
  };

  const result: AiValidationResult = {
    isRelevant: parsed.isRelevant,
    confidence: parsed.confidence,
    reason: parsed.reason,
    tokensUsed: response.usage?.total_tokens ?? 0,
  };

  logger.debug(
    {
      articleId: article.id,
      isRelevant: result.isRelevant,
      confidence: result.confidence,
      tokensUsed: result.tokensUsed,
    },
    'AI validation complete'
  );

  return result;
}

/**
 * Validate multiple articles with AI
 */
export async function validateArticlesWithAi(
  articles: Article[],
  options: { maxConcurrent?: number; delayMs?: number } = {}
): Promise<Map<string, AiValidationResult>> {
  const { maxConcurrent = 3, delayMs = 500 } = options;
  const results = new Map<string, AiValidationResult>();

  logger.info({ count: articles.length }, 'Starting AI validation batch');

  // Process in batches
  for (let i = 0; i < articles.length; i += maxConcurrent) {
    const batch = articles.slice(i, i + maxConcurrent);

    const batchResults = await Promise.all(
      batch.map(async (article) => {
        try {
          const result = await validateWithAi(article);
          return { articleId: article.id, result, error: null };
        } catch (error) {
          logger.error({ error, articleId: article.id }, 'AI validation failed');
          return { articleId: article.id, result: null, error };
        }
      })
    );

    for (const { articleId, result } of batchResults) {
      if (result) {
        results.set(articleId, result);
      }
    }

    // Delay between batches
    if (i + maxConcurrent < articles.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const stats = {
    total: articles.length,
    validated: results.size,
    relevant: Array.from(results.values()).filter((r) => r.isRelevant).length,
  };

  logger.info(stats, 'AI validation batch complete');

  return results;
}

/**
 * Check if AI validation is available
 */
export function isAiValidationAvailable(): boolean {
  return !!config.openai.apiKey;
}
