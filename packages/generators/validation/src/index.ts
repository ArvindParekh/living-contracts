import path from 'path';
import { Project } from 'ts-morph';
import { DMMF } from '@prisma/client/runtime/library.js';

export interface ValidationRule {
  field: string;
  type: string;
  min?: number;
  max?: number;
  pattern?: string;
  nullable: boolean;
  unique: boolean;
  examples: any[];
}

export interface ParsedSchema {
  models: DMMF.Model[];
  enums: DMMF.DatamodelEnum[];
  datasources: any[];
}

export interface ValidationContext {
  tsProject: Project;
  parsedSchema: ParsedSchema;
  validationRules: Map<string, ValidationRule[]>;
  outputBaseDir: string;
}

export class ValidationGenerator {
  constructor(private ctx: ValidationContext) {}

  public generate(): string[] {
    const files: string[] = [];
    const { parsedSchema, validationRules, outputBaseDir } = this.ctx;

    const schemas = parsedSchema.models
      .map((model) => {
        const rules = validationRules.get(model.name) || [];
        const validationFields = model.fields
          .filter((field) => field.kind !== 'object')
          .map((field) => {
            const rule = rules.find((r) => r.field === field.name);
            return this.generateZodField(field, rule);
          });
        return `export const ${model.name}Schema = z.object({\n  ${validationFields.join(',\n  ')}\n});\n\nexport type ${model.name}Input = z.infer<typeof ${model.name}Schema>`;
      })
      .join('\n\n');

    const content = `// Generated Zod validation schemas\nimport { z } from 'zod';\n\n${schemas}\n\nexport const schemas = {\n${parsedSchema.models
      .map((m) => `  ${m.name}: ${m.name}Schema`)
      .join(',\n')}\n};\n`;

    this.ctx.tsProject.createSourceFile(path.join(outputBaseDir, 'schema.ts'), content, {
      overwrite: true,
    });
    files.push('validation/schema.ts');
    return files;
  }

  private generateZodField(field: DMMF.Field, rule?: ValidationRule): string {
    let zod = '';
    switch (field.type) {
      case 'String':
        zod = 'z.string()';
        if (rule) {
          if (rule.min) zod += `.min(${rule.min})`;
          if (rule.max) zod += `.max(${rule.max})`;
          if (rule.pattern) zod += `.regex(${rule.pattern})`;
        }
        break;
      case 'Int':
        zod = 'z.number().int()';
        if (rule) {
          if (rule.min !== undefined) zod += `.min(${rule.min})`;
          if (rule.max !== undefined) zod += `.max(${rule.max})`;
        }
        break;
      case 'Float':
        zod = 'z.number()';
        if (rule) {
          if (rule.min !== undefined) zod += `.min(${rule.min})`;
          if (rule.max !== undefined) zod += `.max(${rule.max})`;
        }
        break;
      case 'Boolean':
        zod = 'z.boolean()';
        break;
      case 'DateTime':
        zod = 'z.date()';
        break;
      case 'Json':
        zod = 'z.any()';
        break;
      case 'Decimal':
        zod = 'z.number()';
        break;
      case 'BigInt':
        zod = 'z.bigint()';
        break;
      default:
        if (field.type.startsWith('Enum_')) {
          const enumName = field.type.replace('Enum_', '');
          zod = `z.nativeEnum(${enumName})`;
        } else {
          zod = 'z.any()';
        }
        break;
    }

    if (!field.isRequired) zod += '.optional()';
    if (field.isList) zod = `z.array(${zod})`;
    return `${field.name}: ${zod}`;
  }
}
