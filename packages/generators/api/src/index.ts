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

export interface APIContext {
  tsProject: Project;
  parsedSchema: ParsedSchema;
  validationRules: Map<string, ValidationRule[]>;
  outputBaseDir: string;
}

export class ApiGenerator {
  constructor(private ctx: APIContext) {}

  public generate(): string[] {
    const files: string[] = [];
    const { parsedSchema, outputBaseDir } = this.ctx;

    parsedSchema.models.forEach((model) => {
      const content = this.generateAPIEndpoint(model);
      const fileName = `${model.name.toLowerCase()}s.ts`;

      this.ctx.tsProject.createSourceFile(path.join(outputBaseDir, fileName), content, {
        overwrite: true,
      });
      files.push(`api/${fileName}`);
    });

    // index file aggregating exports
    const indexContent = `// Generated API routes\n${parsedSchema.models
      .map((m) => `export * as ${m.name.toLowerCase()} from './${m.name.toLowerCase()}s'`)
      .join('\n')}\n`;

    this.ctx.tsProject.createSourceFile(path.join(outputBaseDir, 'index.ts'), indexContent, {
      overwrite: true,
    });
    files.push('api/index.ts');

    return files;
  }

  private pluralize(str: string): string {
    if (str.endsWith('y')) return str.slice(0, -1) + 'ies';
    if (str.endsWith('s')) return str + 'es';
    return str + 's';
  }

  private generateAPIEndpoint(model: DMMF.Model): string {
    const modelLowerCase = model.name.toLowerCase();
    const modelPlural = this.pluralize(modelLowerCase);

    return `// Generated API endpoints for ${model.name}
import { PrismaClient } from '@prisma/client'
import { ${model.name}Schema } from '../validation/schemas'
import type { ${model.name} } from '../sdk/types'

const prisma = new PrismaClient()

// GET /${modelPlural}
export async function findMany(params?: { skip?: number; take?: number; where?: any }): Promise<${model.name}[]> {
  return prisma.${modelLowerCase}.findMany({
    skip: params?.skip,
    take: params?.take,
    where: params?.where,
  })
}

// GET /${modelPlural}/:id
export async function findById(id: string | number): Promise<${model.name} | null> {
  return prisma.${modelLowerCase}.findUnique({ where: { id } })
}

// POST /${modelPlural}
export async function create(data: any): Promise<${model.name}> {
  const validated = ${model.name}Schema.parse(data)
  return prisma.${modelLowerCase}.create({ data: validated })
}

// PATCH /${modelPlural}/:id
export async function update(id: string | number, data: any): Promise<${model.name}> {
  const validated = ${model.name}Schema.partial().parse(data)
  return prisma.${modelLowerCase}.update({ where: { id }, data: validated })
}

// DELETE /${modelPlural}/:id
export async function remove(id: string | number): Promise<void> {
  await prisma.${modelLowerCase}.delete({ where: { id } })
}
`;
  }
}
