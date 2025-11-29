import type { Model, Field, ValidationRule } from '@living-contracts/types';

export interface InferenceConfig {
  sampleSize: number;
  aiProvider: 'gemini';
  aiModel: string;
  requestsPerMinute?: number;
}

export interface FieldStats {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  distinctCount?: number;
  distinctValues?: any[];
  isUnique?: boolean;
  hasNulls?: boolean;
}

export interface PatternInferenceResult {
  pattern?: string | undefined; // Regex
  format?: 'email' | 'uuid' | 'cuid' | 'url' | 'ipv4' | 'ipv6' | 'date' | 'datetime' | 'phone' | 'hex' | undefined;
  description?: string | undefined;
}
