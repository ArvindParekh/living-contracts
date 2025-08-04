import {Command, Flags} from '@oclif/core'
import {PrismaClient} from '@prisma/client'
import { DMMF } from '@prisma/client/runtime/library.js'
import {getDMMF, getConfig} from '@prisma/internals'
import chalk from 'chalk'
import * as fs from 'fs-extra'
import ora from 'ora'
import path from 'path'
import {Project, ScriptTarget} from 'ts-morph'

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
      parsedSchema = await this.parseSchema(this.configuration.prismaSchema)
      schemaSpinner.succeed(`Found ${parsedSchema.models.length} models`)
    } catch (error) {
      schemaSpinner.fail(chalk.bold.red('Failed to parse Prisma schema.'))
      this.error('Please check your Prisma schema file and try again.')
    }

    // init a ts project for code generation
    const projectSpinner = ora('Initializing TypeScript project...').start()
    try {
      this.tsProject = await this.initTsProject(this.configuration.output)
      projectSpinner.succeed('TypeScript project initialized')
    } catch (error) {
      projectSpinner.fail(chalk.bold.red('Failed to initialize TypeScript project.'))
      this.error('Failed to create a new TypeScript project. Please check your project directory and try again.')
    }

    // connect to db for validation inference
    let validationRules: Record<string, any[]> = {}
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
        await this.tsProject.save()
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

  private async initTsProject(outputDir: string): Promise<Project> {
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

  private async inferValidationRules(models: any[]): Promise<Record<string, any[]>> {
    // TODO: implement AI validation inference logic - use structured outputs
    const rules: Record<string, any[]> = {}

    return rules
  }

  private async runGenerator(
    generator: string,
    parsedSchema: ParsedSchema,
    validationRules: Record<string, any[]>,
    dryRun: boolean,
  ): Promise<string[]> {
    const outputBaseDir = path.join(this.configuration.output, generator)
    const files: string[] = []
    switch (generator) {
      case 'sdk':
        files.push(await this.generateSDK(parsedSchema, validationRules, outputBaseDir))
        break
      case 'api':
        files.push(await this.generateAPI(parsedSchema, validationRules, outputBaseDir))
        break
      case 'validation':
        files.push(await this.generateValidation(parsedSchema, validationRules, outputBaseDir))
        break
      case 'docs':
        files.push(await this.generateDocs(parsedSchema, validationRules, outputBaseDir))
        break
      default:
        throw new Error(`Unsupported generator: ${generator}`)
    }

    return files
  }

  private async generateSDK(
    parsedSchema: ParsedSchema,
    validationRules: Record<string, any[]>,
    outputBaseDir: string,
  ): Promise<string> {}

  private async generateAPI(
    parsedSchema: ParsedSchema,
    validationRules: Record<string, any[]>,
    outputBaseDir: string,
  ): Promise<string> {}

  private async generateValidation(
    parsedSchema: ParsedSchema,
    validationRules: Record<string, any[]>,
    outputBaseDir: string,
  ): Promise<string> {}

  private async generateDocs(
    parsedSchema: ParsedSchema,
    validationRules: Record<string, any[]>,
    outputBaseDir: string,
  ): Promise<string> {}

  private generateTypes(schema: ParsedSchema): string {
    const types = schema.models.map((model) => {
      const fields = model.fields
        .filter((field) => field.type === 'object')
        .map((field) => {
          const type = this.getPrismaType(field)
          const optional = field.isRequired ? '' : '?'
          return `${field.name}: ${type}${optional}`
        })
        .join('\n')

      return `export interface ${model.name} {\n${fields}\n}`
    }).join('\n\n');

    const enumTypes = schema.enums.map((enumDef) => {
      const values = enumDef.values.map((value) => {
        return `  ${value.name} = '${value.name}'`
      }).join(',\n')

      return `export enum ${enumDef.name} {\n${values}\n}`
    }).join('\n\n');


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
}
