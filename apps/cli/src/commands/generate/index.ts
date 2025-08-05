import {Command, Flags} from '@oclif/core'
import {PrismaClient} from '@prisma/client'
import {DMMF} from '@prisma/client/runtime/library.js'
import {getDMMF, getConfig} from '@prisma/internals'
import chalk from 'chalk'
import * as fs from 'fs-extra'
import ora from 'ora'
import path from 'path'
import { CodeGeneratorEngine } from '@living-contracts/code-generator'
import {Project, ScriptTarget} from 'ts-morph'
import {SchemaParser} from '@living-contracts/schema-parser'

interface GeneratorConfig {
  output: string
  generators: string[]
  inferValidation: boolean
  prismaSchema: string
}

interface ParsedSchema {
  models: DMMF.Model[]
  enums: DMMF.DatamodelEnum[]
  datasources: any[]
}

interface ValidationRule {
  field: string
  type: string
  min?: number
  max?: number
  pattern?: string
  nullable: boolean
  unique: boolean
  examples: any[]
}

export default class Generate extends Command {
  static description =
    'Generate TypeScript SDK, API endpoints, validation schemas, and documentation from your Prisma schema'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --schema ./prisma/schema.prisma',
    '<%= config.bin %> <%= command.id %> --no-infer',
  ]

  static flags = {
    infer: Flags.boolean({
      description: 'Infer validation rules from database data',
      default: true,
    }),
    'dry-run': Flags.boolean({
      description: 'Show what would be generated without writing files',
      default: false,
    }),
  }

  private configuration!: GeneratorConfig
  private tsProject!: Project
  private engine!: CodeGeneratorEngine
  private prisma!: PrismaClient

  async run(): Promise<void> {
    const {flags} = await this.parse(Generate)

    this.log(chalk.bold.blue('Living Contracts Generator'))
    this.log()

    // load config
    const configSpinner = ora('Loading configuration...').start()
    try {
      this.configuration = await this.loadConfig()
      if (flags.infer) this.configuration.inferValidation = flags.infer
      configSpinner.succeed('Configuration loaded')
    } catch (error) {
      configSpinner.fail(chalk.bold.red('Failed to load configuration.'))
      this.error('Run `npx living-contracts init` to first set up your project.')
    }

    // parse prisma schema
    const schemaSpinner = ora('Parsing Prisma schema...').start()

    let parsedSchema: ParsedSchema
    try {
      // parsedSchema = await this.parseSchema(this.configuration.prismaSchema)
      const parser = new SchemaParser();
      parsedSchema = await parser.parseSchema(this.configuration.prismaSchema);
      schemaSpinner.succeed(`Found ${parsedSchema.models.length} models`)
    } catch (error) {
      schemaSpinner.fail(chalk.bold.red('Failed to parse Prisma schema.'))
      this.error('Please check your Prisma schema file and try again.')
    }

    // init a ts project for code generation
    const projectSpinner = ora('Initializing TypeScript project...').start()
    try {
      this.engine = new CodeGeneratorEngine()
      this.tsProject = this.engine.project
      projectSpinner.succeed('TypeScript project initialized')
    } catch (error) {
      projectSpinner.fail(chalk.bold.red('Failed to initialize TypeScript project.'))
      this.error('Failed to create a new TypeScript project. Please check your project directory and try again.')
    }

    // connect to db for validation inference
    let validationRules: Map<string, ValidationRule[]> = new Map()
    if (this.configuration.inferValidation) {
      const dbSpinner = ora('Connecting to database...').start()
      try {
        const prismaConfig = await getConfig({
          datamodel: this.configuration.prismaSchema,
        })
        const datasourceUrl = prismaConfig.datasources[0].url.value

        if (datasourceUrl) {
          const {PrismaClient} = await import('@prisma/client')

          dbSpinner.text = 'Inferring validation rules from database...'
          this.prisma = new PrismaClient({
            datasourceUrl: datasourceUrl,
          })

          // infer validation rules
          validationRules = await this.inferValidationRules(parsedSchema.models)
          dbSpinner.succeed('Validation rules inferred')
        } else {
          dbSpinner.succeed('No database connection found, skipping validation inference.')
        }
      } catch (error) {
        dbSpinner.fail(chalk.bold.red('Failed to connect to database.'))
        this.error('Please check your database connection and try again.')
      }
    }

    // generate files in output dir
    this.log()
    this.log(chalk.bold('Generating files...'))

    const generators = this.configuration.generators
    const generatedFiles: string[] = []

    for (const generator of generators) {
      const generatorSpinner = ora(`Generating ${generator}...`).start()

      try {
        const files = await this.runGenerator(generator, parsedSchema, validationRules, flags['dry-run'])
        generatorSpinner.succeed(`Generated ${generator}`)
        generatedFiles.push(...files)
      } catch (error) {
        generatorSpinner.fail(chalk.bold.red(`Failed to generate ${generator}.`))
        this.warn(error as Error)
      }
    }
    // save files
    if (!flags['dry-run']) {
      const saveSpinner = ora('Saving files...').start()
      try {
        await this.engine.save()
        saveSpinner.succeed('Files saved')
      } catch (error) {
        saveSpinner.fail(chalk.bold.red('Failed to save files'))
        this.error(error as Error)
      }
    }

    // done - disconnect from db - success message
    if (this.prisma) {
      await this.prisma.$disconnect()
    }

    this.log()
    this.log(chalk.bold.green('Generation complete!'))
    this.log()
    this.log('Generated files:')
    generatedFiles.forEach((file) => {
      this.log(chalk.cyan(`  ✓ ${file}`))
    })
    this.log()
    this.log(chalk.gray('Import your generated SDK with:'))
    this.log(chalk.white(`  import { api } from './${this.configuration.output}/sdk'`))
  }

  private async loadConfig(): Promise<GeneratorConfig> {
    const configPath = path.join(process.cwd(), '.living-contracts.json')

    return (await fs.readJson(configPath)) as GeneratorConfig
  }

  private async parseSchema(schemaPath: string): Promise<ParsedSchema> {
    const absolutePath = path.resolve(process.cwd(), schemaPath) // do we need entirely absolute path here?
    const schema = await getDMMF({
      datamodel: absolutePath,
    })

    return {
      models: Array.from(schema.datamodel.models),
      enums: Array.from(schema.datamodel.enums),
      datasources: [],
    }
  }

  private async initTsProject(): Promise<Project> {
    const newProject = new Project({
      compilerOptions: {
        target: ScriptTarget.ES2022,
        module: 1,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
    })

    return newProject
  }

  private async inferValidationRules(models: DMMF.Model[]): Promise<Map<string, ValidationRule[]>> {
    // TODO: implement AI validation inference logic - use structured outputs
    const rules: Map<string, ValidationRule[]> = new Map()

    return rules
  }

  private async runGenerator(
    generator: string,
    parsedSchema: ParsedSchema,
    validationRules: Map<string, ValidationRule[]>,
    dryRun: boolean,
  ): Promise<string[]> {
    const outputBaseDir = path.join(this.configuration.output, generator)
    const files: string[] = []
    switch (generator) {
      case 'sdk': {
        const { SdkGenerator } = await import('@living-contracts/generator-sdk');
        const gen = new SdkGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        });
        files.push(...gen.generate());
        break;
      }
      case 'api': {
        const { ApiGenerator } = await import('@living-contracts/generator-api');
        const gen = new ApiGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        });
        files.push(...gen.generate());
        break;
      }
      case 'validation': {
        const { ValidationGenerator } = await import('@living-contracts/generator-validation');
        const gen = new ValidationGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        });
        files.push(...gen.generate());
        break;
      }
      case 'docs': {
        const { DocsGenerator } = await import('@living-contracts/generator-docs');
        const gen = new DocsGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        });
        files.push(...gen.generate());
        break;
      }
      default:
        this.warn(`Unsupported generator type: ${generator}`)
    }

    return files
  }

  private async generateSDK(
    parsedSchema: ParsedSchema,
    validationRules: Map<string, ValidationRule[]>,
    outputBaseDir: string,
  ): Promise<string[]> {
    const files: string[] = []

    const typesContent = this.generateTypes(parsedSchema);
    const typesFiles = this.tsProject.createSourceFile(
      path.join(outputBaseDir, 'types.ts'),
      typesContent,
      { overwrite: true }
    )
    files.push('sdk/types.ts')

    const clientContent = this.generateClient(parsedSchema);
    const clientFiles = this.tsProject.createSourceFile(
      path.join(outputBaseDir, 'client.ts'),
      clientContent,
      { overwrite: true }
    )
    files.push('sdk/client.ts')

    const indexContent = `// Generated by Living Contracts
export * from './types'
export * from './client'
export { api } from './client';`

    const indexFile = this.tsProject.createSourceFile(
      path.join(outputBaseDir, 'index.ts'),
      indexContent,
      { overwrite: true }
    )
    files.push('sdk/index.ts')

    return files;

  }

  private async generateAPI(
    parsedSchema: ParsedSchema,
    validationRules: Map<string, ValidationRule[]>,
    outputBaseDir: string,
  ): Promise<string[]> {
    const files: string[] = []

    const schema = parsedSchema.models.map((model) => {
      const content = this.generateAPIEndpoint(model)
      const fileName = `${model.name.toLowerCase()}s.ts`

      this.tsProject.createSourceFile(path.join(outputBaseDir, fileName), content, {overwrite: true})
      files.push(`/api/${fileName}`)
    })

    // generate index file
    const indexContent = `// Generated API routes
${parsedSchema.models.map((m) => `export * as ${m.name.toLowerCase()} from './${m.name.toLowerCase()}s'`).join('\n')}
`
    this.tsProject.createSourceFile(path.join(outputBaseDir, 'index.ts'), indexContent, {overwrite: true})
    files.push('api/index.ts')

    return files
  }

  private generateAPIEndpoint(model: DMMF.Model): string {
    const modelLowerCase = model.name.toLowerCase()
    const modelPlural = this.pluralize(modelLowerCase)

    return `// Generated API endpoints for ${model.name}
import { PrismaClient } from '@prisma/client'
import { ${model.name}Schema } from '../validation/schemas'
import type { ${model.name} } from '../sdk/types'

const prisma = new PrismaClient()

// GET /${modelPlural}
export async function findMany(params?: {
  skip?: number
  take?: number
  where?: any
}): Promise<${model.name}[]> {
  return prisma.${modelLowerCase}.findMany({
    skip: params?.skip,
    take: params?.take,
    where: params?.where,
  })
}

// GET /${modelPlural}/:id
export async function findById(id: string | number): Promise<${model.name} | null> {
  return prisma.${modelLowerCase}.findUnique({
    where: { id },
  })
}

// POST /${modelPlural}
export async function create(data: any): Promise<${model.name}> {
  const validated = ${model.name}Schema.parse(data)
  return prisma.${modelLowerCase}.create({
    data: validated,
  })
}

// PATCH /${modelPlural}/:id
export async function update(id: string | number, data: any): Promise<${model.name}> {
  const validated = ${model.name}Schema.partial().parse(data)
  return prisma.${modelLowerCase}.update({
    where: { id },
    data: validated,
  })
}

// DELETE /${modelPlural}/:id
export async function remove(id: string | number): Promise<void> {
  await prisma.${modelLowerCase}.delete({
    where: { id },
  })
}
`
  }

  private async generateValidation(
    parsedSchema: ParsedSchema,
    validationRules: Map<string, ValidationRule[]>,
    outputBaseDir: string,
  ): Promise<string[]> {
    const files: string[] = []

    const schemas = parsedSchema.models
      .map((model) => {
        const rules = validationRules.get(model.name) || []
        const validationFields = model.fields
          .filter((field) => field.kind !== 'object')
          .map((field) => {
            const rule = rules.find((r) => r.field === field.name)
            return this.generateZodField(field, rule)
          })
        return `export const ${model.name}Schema = z.object({\n ${validationFields}\n}\n\nexport type ${model.name}Input = z.infer<typeof ${model.name}Schema>)`
      })
      .join('\n\n')

    const content = `// Generated Zod validation schemas
import { z } from 'zod'

${schemas}

// Export all schemas
export const schemas = {
${parsedSchema.models.map((m) => `  ${m.name}: ${m.name}Schema`).join(',\n')}
}
`

    this.tsProject.createSourceFile(path.join(outputBaseDir, 'schema.ts'), content, {overwrite: true})
    files.push('validation/schema.ts')

    return files
  }

  private generateZodField(field: DMMF.Field, rule: any): string {
    let zod = ''

    switch (field.type) {
      case 'String':
        zod = 'z.string()'
        if (rule) {
          if (rule.min) zod += `.min(${rule.min}, 'Must be at least ${rule.min} characters')`
          if (rule.max) zod += `.max(${rule.max}, 'Must be at most ${rule.max} characters')`
          if (rule.pattern) zod += `.regex(${rule.pattern}, 'Must match pattern ${rule.pattern}')`
        }
        break
      case 'Int':
        zod = 'z.number().int()'
        if (rule) {
          if (rule.min !== undefined) zod += `.min(${rule.min}, 'Must be at least ${rule.min}')`
          if (rule.max !== undefined) zod += `.max(${rule.max}, 'Must be at most ${rule.max}')`
        }
        break
      case 'Float':
        zod = 'z.number().float()'
        if (rule) {
          if (rule.min !== undefined) zod += `.min(${rule.min}, 'Must be at least ${rule.min}')`
          if (rule.max !== undefined) zod += `.max(${rule.max}, 'Must be at most ${rule.max}')`
        }
        break
      case 'Boolean':
        zod = 'z.boolean()'
        break
      case 'DateTime':
        zod = 'z.date()'
        break
      case 'Json':
        zod = 'z.any()'
        break
      case 'Decimal':
        zod = 'z.number().decimal()'
        if (rule) {
          if (rule.min !== undefined) zod += `.min(${rule.min}, 'Must be at least ${rule.min}')`
          if (rule.max !== undefined) zod += `.max(${rule.max}, 'Must be at most ${rule.max}')`
        }
        break
      case 'BigInt':
        zod = 'z.bigint()'
        if (rule) {
          if (rule.min !== undefined) zod += `.min(${rule.min}, 'Must be at least ${rule.min}')`
        }
        break
      default:
        if (field.type.startsWith('Enum_')) {
          const enumName = field.type.replace('Enum_', '')
          zod = `z.nativeEnum(${enumName})`
        } else {
          zod = 'z.any()'
        }
        break
    }

    if (!field.isRequired) zod += '.optional()'

    if (field.isList) zod += `z.array(${zod})`
    return `${field.name}: ${zod}`
  }

  private async generateDocs(
    parsedSchema: ParsedSchema,
    validationRules: Map<string, ValidationRule[]>,
    outputBaseDir: string,
  ): Promise<string[]> {
    const files: string[] = []


    const modelDocs = parsedSchema.models.map(model => {
      const rules = validationRules.get(model.name) || []
      const fields = model.fields.map((field: any) => {
        const rule = rules.find(r => r.field === field.name)
        let constraints = ''
        
        if (rule) {
          if (rule.min !== undefined || rule.max !== undefined) {
            constraints += ` (${rule.min || 0}-${rule.max || '∞'})`
          }
          if (rule.pattern) {
            constraints += ` Pattern: \`${rule.pattern}\``
          }
          if (rule.examples.length > 0) {
            constraints += `\n    Examples: ${rule.examples.slice(0, 3).map(e => `\`${e}\``).join(', ')}`
          }
        }
        
        return `- **${field.name}** (\`${field.type}${!field.isRequired ? '?' : ''}\`)${constraints}`
      }).join('\n')

      return `## ${model.name}

### Fields
${fields}

### Endpoints
- \`GET /${this.pluralize(model.name.toLowerCase())}\` - List all ${model.name} records
- \`GET /${this.pluralize(model.name.toLowerCase())}/:id\` - Get a single ${model.name}
- \`POST /${this.pluralize(model.name.toLowerCase())}\` - Create a new ${model.name}
- \`PATCH /${this.pluralize(model.name.toLowerCase())}/:id\` - Update a ${model.name}
- \`DELETE /${this.pluralize(model.name.toLowerCase())}/:id\` - Delete a ${model.name}
`
    }).join('\n---\n\n')

    const content = `# API Documentation

Generated by Living Contracts on ${new Date().toLocaleDateString()}

## Overview

This document describes the auto-generated API based on your Prisma schema.

${modelDocs}

## Usage

### TypeScript SDK

\`\`\`typescript
import { api } from './generated/sdk'

// Create a new record
const user = await api.user.create({
  name: 'Alice',
  email: 'alice@example.com'
})

// Find records
const users = await api.user.findMany({
  where: { name: 'Alice' }
})

// Update a record
await api.user.update(user.id, {
  name: 'Alice Smith'
})

// Delete a record
await api.user.delete(user.id)
\`\`\`

### Validation

All inputs are validated using Zod schemas generated from your Prisma schema and database analysis.

\`\`\`typescript
import { schemas } from './generated/validation/schemas'

// Validate input before sending to API
const validatedData = schemas.User.parse({
  name: 'Bob',
  email: 'bob@example.com'
})
\`\`\`
`

    this.tsProject.createSourceFile(
      path.join(outputBaseDir, 'README.md'),
      content,
      { overwrite: true }
    )
    files.push('docs/README.md')

    return files;
  }

  private generateClient(schema: ParsedSchema): string {
    const modelClients = schema.models
      .map((model) => {
        const modelLowerCase = model.name.toLowerCase()
        const modelPlural = this.pluralize(modelLowerCase)

        return `
      ${modelPlural} : {
       create: (data: Omit<${model.name}, 'id' | 'createdAt' | 'updatedAt'>) : Promise<${model.name}> => {
          const response = await fetch(\`\${this.baseURL}/${modelPlural}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error(\`Failed to create ${model.name}\`)
      return response.json()
    },

    findMany: async (params?: { skip?: number; take?: number; where?: Partial<${model.name}> }): Promise<${model.name}[]> => {
      const query = new URLSearchParams()
      if (params?.skip) query.set('skip', params.skip.toString())
      if (params?.take) query.set('take', params.take.toString())
      if (params?.where) query.set('where', JSON.stringify(params.where))
      
      const response = await fetch(\`\${this.baseURL}/${modelPlural}?\${query}\`)
      if (!response.ok) throw new Error(\`Failed to fetch ${modelPlural}\`)
      return response.json()
    },

    findById: async (id: string | number): Promise<${model.name} | null> => {
      const response = await fetch(\`\${this.baseURL}/${modelPlural}/\${id}\`)
      if (response.status === 404) return null
      if (!response.ok) throw new Error(\`Failed to fetch ${model.name}\`)
      return response.json()
    },

    update: async (id: string | number, data: Partial<Omit<${model.name}, 'id' | 'createdAt' | 'updatedAt'>>): Promise<${model.name}> => {
      const response = await fetch(\`\${this.baseURL}/${modelPlural}/\${id}\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw new Error(\`Failed to update ${model.name}\`)
      return response.json()
    },

    delete: async (id: string | number): Promise<void> => {
      const response = await fetch(\`\${this.baseURL}/${modelPlural}/\${id}\`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(\`Failed to delete ${model.name}\`)
    },
  }`
      })
      .join(',\n\n')

    return `// Generated API client
import type { ${schema.models.map((m) => m.name).join(', ')} } from './types'

export class APIClient {
  constructor(private baseURL: string) {}

${modelClients}
}

// Default client instance
export const api = new APIClient(process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '/api')
`
  }

  private generateTypes(schema: ParsedSchema): string {
    const types = schema.models
      .map((model) => {
        const fields = model.fields
          .filter((field) => field.kind !== 'object')
          .map((field) => {
            const type = this.getPrismaType(field)
            const optional = field.isRequired ? '' : '?'
            return `${field.name}: ${type}${optional}`
          })
          .join('\n')

        return `export interface ${model.name} {\n${fields}\n}`
      })
      .join('\n\n')

    const enumTypes = schema.enums
      .map((enumDef) => {
        const values = enumDef.values
          .map((value) => {
            return `  ${value.name} = '${value.name}'`
          })
          .join(',\n')

        return `export enum ${enumDef.name} {\n${values}\n}`
      })
      .join('\n\n')

    return `// Generated types from Prisma schema
    // Do not edit manually!
    
    ${types}
    
    ${enumTypes}
    `
  }

  private getPrismaType(field: DMMF.Field): string {
    const typeMap: Record<string, string> = {
      String: 'string',
      Int: 'number',
      Float: 'number',
      Boolean: 'boolean',
      DateTime: 'Date',
      Json: 'any',
      Decimal: 'number',
      BigInt: 'bigint',
    }
    return typeMap[field.type] || 'any'
  }

  private pluralize(str: string): string {
    if (str.endsWith('y')) {
      return str.slice(0, -1) + 'ies'
    }
    if (str.endsWith('s')) {
      return str + 'es'
    }
    return str + 's'
  }
}
