import type { Model, Field } from '@living-contracts/types';
import type { Pool } from 'pg';
import type { FieldStats } from './types.js';

export class StatisticalAnalyzer {
  constructor(private db: Pool) {}

  async analyze(model: Model, field: Field): Promise<FieldStats> {
    const stats: FieldStats = {};
    const modelName = model.dbName || model.name;
    const fieldName = field.dbName || field.name;

    try {
      if (!field.isRequired) {
        const result = await this.db.query(
          `SELECT COUNT(*) as count FROM "${modelName}" WHERE "${fieldName}" IS NULL`
        );
        const nullCount = parseInt(result.rows[0].count);
        stats.hasNulls = nullCount > 0;
      }

      if (field.type === 'String') {
        await this.analyzeString(modelName, fieldName, stats);
      } else if (['Int', 'Float', 'Decimal', 'BigInt'].includes(field.type)) {
        await this.analyzeNumber(modelName, fieldName, stats);
      } else if (field.type.startsWith('Enum_')) {
        await this.analyzeEnum(modelName, fieldName, stats);
      }

      return stats;
    } catch (error) {
      console.warn(`Failed to analyze field ${modelName}.${fieldName}:`, error);
      return stats;
    }
  }

  private async analyzeString(model: string, field: string, stats: FieldStats) {
    // we need raw query to get length stats efficiently
    // prisma doesn't support aggregate on length directly without raw query
    // for now, let's fetch a sample of non-null values to calculate stats in memory
    // this is safer than raw SQL injection and works for all DBs, but slower for huge DBs.
    // we can limit the sample size.

    const sampleSize = 1000;
    const result = await this.db.query(
      `SELECT "${field}" FROM "${model}" WHERE "${field}" IS NOT NULL LIMIT $1`,
      [sampleSize]
    );
    const data = result.rows;

    if (data.length === 0) return;

    const lengths = data.map((row: any) => row[field].length);
    stats.minLength = Math.min(...lengths);
    stats.maxLength = Math.max(...lengths);
  }

  private async analyzeNumber(model: string, field: string, stats: FieldStats) {
    const result = await this.db.query(
      `SELECT MIN("${field}") as min, MAX("${field}") as max FROM "${model}"`
    );

    stats.min = result.rows[0].min;
    stats.max = result.rows[0].max;
  }

  private async analyzeEnum(model: string, field: string, stats: FieldStats) {
    // get distinct values
    const result = await this.db.query(
      `SELECT DISTINCT "${field}" FROM "${model}" WHERE "${field}" IS NOT NULL`
    );

    stats.distinctValues = result.rows.map((d: any) => d[field]);
    stats.distinctCount = result.rows.length;
  }
}
