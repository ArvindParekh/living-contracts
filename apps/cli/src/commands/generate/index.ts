import type {GeneratorConfig, Model, ParsedSchema, tsProject, ValidationRule} from '@living-contracts/types'

import {ValidationInferenceService} from '@living-contracts/ai-inference'
import {CodeGeneratorEngine} from '@living-contracts/code-generator'
import {SchemaParser} from '@living-contracts/schema-parser'
import {Command, Flags} from '@oclif/core'
import {PrismaClient} from '@prisma/client/extension'
import PrismaInternals from '@prisma/internals'
import dotenv from 'dotenv'
const {getConfig} = PrismaInternals
import chalk from 'chalk'
import fs from 'fs-extra'
import path from 'node:path'
import ora from 'ora'
import pg from 'pg'

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
  private tsProject!: tsProject
  private engine!: CodeGeneratorEngine
  private dbPool: pg.Pool | null = null

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
      const parser = new SchemaParser()
      parsedSchema = await parser.parseSchema(this.configuration.prismaSchema)
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
      console.log(`this.configuration: ${JSON.stringify(this.configuration)}`)
      try {
        const envPath = path.join(process.cwd(), '.env')
        if (fs.existsSync(envPath)) {
          dotenv.config({ path: envPath })
        }
        const schema = fs.readFileSync(this.configuration.prismaSchema, 'utf-8')
        const prismaConfig = await getConfig({
          datamodel: schema,
          ignoreEnvVarErrors: false,
        })
        console.log(`prismaConfig: ${JSON.stringify(prismaConfig)}`)
        const datasource = prismaConfig.datasources[0];
        const datasourceUrl = datasource.url.value;

        if (datasourceUrl) {
          dbSpinner.text = 'Inferring validation rules from database...'
          this.dbPool = await this.createDbConnection(datasource.activeProvider, datasourceUrl);

          // infer validation rules
          validationRules = await this.inferValidationRules(parsedSchema.models)
          dbSpinner.succeed('Validation rules inferred')
        } else {
          dbSpinner.succeed('No database connection found, skipping validation inference.')
        }
      } catch (error) {
        console.log(error)
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

    // done - cleanup
    if (this.dbPool) {
      await this.dbPool.end()
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
    const configPath = path.join(process.cwd(), 'living-contracts.json')
    try {
      return (await fs.readJson(configPath)) as GeneratorConfig
    } catch (error) {
      throw error
    }
  }

  private async inferValidationRules(models: Model[]): Promise<Map<string, ValidationRule[]>> {
    if (!this.dbPool) {
      return new Map()
    }

    const service = new ValidationInferenceService(this.dbPool, {
      sampleSize: 50,
      aiProvider: 'gemini'
    })

    const spinner = ora('Inferring validation rules (this may take a moment)...').start()
    try {
      const rules = await service.inferRules(models)
      spinner.succeed(`Inferred validation rules for ${rules.size} models`)
      return rules
    } catch (error) {
      spinner.fail('Failed to infer validation rules')
      this.warn(error as Error)
      return new Map()
    }
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
        const {SdkGenerator} = await import('@living-contracts/generator-sdk')
        const gen = new SdkGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        })
        files.push(...gen.generate())
        break
      }
      case 'api': {
        const {ApiGenerator} = await import('@living-contracts/generator-api')
        const gen = new ApiGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        })
        files.push(...gen.generate())
        break
      }
      case 'validation': {
        const {ValidationGenerator} = await import('@living-contracts/generator-validation')
        const gen = new ValidationGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        })
        files.push(...gen.generate())
        break
      }
      case 'docs': {
        const {DocsGenerator} = await import('@living-contracts/generator-docs')
        const gen = new DocsGenerator({
          tsProject: this.tsProject,
          parsedSchema,
          validationRules,
          outputBaseDir,
        })
        files.push(...gen.generate())
        break
      }
      default:
        this.warn(`Unsupported generator type: ${generator}`)
    }

    return files
  }

  private async createDbConnection(provider: string, url: string): Promise<pg.Pool> {
    switch (provider) {
      case 'postgresql':
      case 'cockroachdb':
        return new pg.Pool({
          connectionString: url,
        })
      case 'mysql':
        // TODO: Add mysql2 support
        throw new Error('MySQL support coming soon. Currently only PostgreSQL is supported.')

      case 'sqlite':
        // TODO: Add better-sqlite3 support
        throw new Error('SQLite support coming soon. Currently only PostgreSQL is supported.')

      default:
        throw new Error(`Unsupported database provider: ${provider}`)
    }
  }
}
