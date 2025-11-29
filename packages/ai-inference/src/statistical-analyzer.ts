import type { Model, Field } from '@living-contracts/types';
import type { FieldStats } from './types.js';

export class StatisticalAnalyzer {
  constructor(private prisma: any) {}

  async analyze(model: Model, field: Field): Promise<FieldStats> {
    const stats: FieldStats = {};
    const modelName = model.name;
    const fieldName = field.name;

    try {
      if (!field.isRequired) {
        const nullCount = await this.prisma[modelName].count({
          where: { [fieldName]: null },
        });
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
    const data = await this.prisma[model].findMany({
      where: { [field]: { not: null } },
      select: { [field]: true },
      take: sampleSize,
    });

    if (data.length === 0) return;

    const lengths = data.map((row: any) => row[field].length);
    stats.minLength = Math.min(...lengths);
    stats.maxLength = Math.max(...lengths);
  }

  private async analyzeNumber(model: string, field: string, stats: FieldStats) {
    const aggregate = await this.prisma[model].aggregate({
      _min: { [field]: true },
      _max: { [field]: true },
    });

    stats.min = aggregate._min[field];
    stats.max = aggregate._max[field];
  }

  private async analyzeEnum(model: string, field: string, stats: FieldStats) {
    // get distinct values
    const distinct = await this.prisma[model].findMany({ // trade off: loads all data in memory, could be slow for huge dbs. better approach would be to execute native sql commands using prisma
      where: { [field]: { not: null } },
      distinct: [field],
      select: { [field]: true },
    });

    stats.distinctValues = distinct.map((d: any) => d[field]);
    stats.distinctCount = distinct.length;
  }
}
