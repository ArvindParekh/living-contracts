import {Command, Flags} from '@oclif/core'
import {SchemaParser} from '@living-contracts/schema-parser'
import { PrismaClient } from '@prisma/client/extension'
import {getConfig} from '@prisma/internals'
import chalk from 'chalk'
import * as fs from 'fs-extra'
import ora from 'ora'
import path from 'path'
import { CodeGeneratorEngine } from '@living-contracts/code-generator'
import type { GeneratorConfig, ParsedSchema, ValidationRule, Model, tsProject} from '@living-contracts/types'

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

  private async inferValidationRules(models: Model[]): Promise<Map<string, ValidationRule[]>> {
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
}
