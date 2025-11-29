import type { Model, ValidationRule } from "@living-contracts/types";
import { StatisticalAnalyzer } from "./statistical-analyzer.js";
import { AIPatternRecognizer } from "./ai-recognizer.js";
import type { InferenceConfig } from "./types.js";

export * from "./types.js";
export * from "./statistical-analyzer.js";
export * from "./ai-recognizer.js";

export class ValidationInferenceService {
  private statsAnalyzer: StatisticalAnalyzer;
  private aiRecognizer: AIPatternRecognizer;

  constructor(
    private prisma: any,
    private config: Partial<InferenceConfig> = {},
  ) {
    this.statsAnalyzer = new StatisticalAnalyzer(prisma);
    this.aiRecognizer = new AIPatternRecognizer();
  }

  async inferRules(models: Model[]): Promise<Map<string, ValidationRule[]>> {
    const rulesMap = new Map<string, ValidationRule[]>();

    for (const model of models) {
      const modelRules: ValidationRule[] = [];

      for (const field of model.fields) {
        // todo: skipping relation fields and unsupported types for now
        if (field.kind === "object") continue;

        const rule: ValidationRule = {
          field: field.name,
          type: field.type,
          nullable: !field.isRequired,
          unique: false, // todo: check from schema or DB
          examples: [],
        };

        // 1. do stats analysis (hard constraints)
        const stats = await this.statsAnalyzer.analyze(model, field);

        if (stats.min !== undefined) rule.min = stats.min;
        if (stats.max !== undefined) rule.max = stats.max;
        if (stats.minLength !== undefined) rule.min = stats.minLength;
        if (stats.maxLength !== undefined) rule.max = stats.maxLength;

        // 2. do AI pattern recognition (soft constraints / regex)
        // only for strings that are not enums and don't have a clear format yet
        if (field.type === "String" && !field.isList) {
          // fetch sample for AI
          const sample = await this.prisma[model.name].findMany({
            where: { [field.name]: { not: null } },
            select: { [field.name]: true },
            take: this.config.sampleSize || 50,
            distinct: [field.name],
          });

          const values = sample.map((s: any) => s[field.name]);

          if (values.length > 0) {
            const aiResult = await this.aiRecognizer.inferPattern(
              model.name,
              field.name,
              values,
            );

            if (aiResult) {
              if (aiResult.pattern) rule.pattern = aiResult.pattern;
              // we could store format and description in the rule if the type supported it
              // for now, pattern is the main one Zod uses
            }
          }
        }

        // only add rule if we found something useful
        if (
          rule.min !== undefined ||
          rule.max !== undefined ||
          rule.pattern !== undefined
        ) {
          modelRules.push(rule);
        }
      }

      if (modelRules.length > 0) {
        rulesMap.set(model.name, modelRules);
      }
    }

    return rulesMap;
  }
}
