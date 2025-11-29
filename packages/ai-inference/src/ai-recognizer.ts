import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE } from './prompts/validation.js';
import type { PatternInferenceResult } from './types.js';

const PatternSchema = z.object({
  pattern: z.string().nullable().describe('Regex pattern that matches the data'),
  format: z.enum(['email', 'uuid', 'cuid', 'url', 'ipv4', 'ipv6', 'date', 'datetime', 'phone', 'hex']).optional().describe('Standard data format if applicable'),
  description: z.string().describe('Description of the inferred pattern'),
});


export class AIPatternRecognizer {
  private openai: ReturnType<typeof createOpenAI>;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    this.openai = createOpenAI();
  }

  async inferPattern(model: string, field: string, values: any[]): Promise<PatternInferenceResult | null> {
    if (!values || values.length === 0) return null;

    // filter out nulls/undefined and take unique values to save tokens
    const uniqueValues = Array.from(new Set(values.filter(v => v !== null && v !== undefined)));
    
    // limit to 50 samples
    const samples = uniqueValues.slice(0, 50);

    if (samples.length === 0) return null;

    try {
      const result = await generateObject({
        model: this.openai('gpt-4.1-mini'),
        schema: PatternSchema,
        system: SYSTEM_PROMPT,
        prompt: USER_PROMPT_TEMPLATE(model, field, samples),
      });

      const object = result.object;

      return {
        pattern: object.pattern || undefined,
        format: object.format ?? undefined,
        description: object.description,
      };
    } catch (error) {
      console.warn(`AI inference failed for ${model}.${field}:`, error);
      return null;
    }
  }
}
