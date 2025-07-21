import {Command, Flags} from '@oclif/core'
import {getDMMF, getConfig} from "@prisma/internals"
import chalk from 'chalk'
import * as fs from "fs-extra"
import ora from 'ora'
import path from 'path'
import { Project, ScriptTarget } from 'ts-morph'

interface GeneratorConfig {
  output: string
  generators: string[]
  inferValidation: boolean
  prismaSchema: string
}

interface ParsedSchema {
  models: any[]
  enums: any[]
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

  private configuration!: GeneratorConfig;
  private tsProject!: Project;

  async run(): Promise<void> {

    const { flags } = await this.parse(Generate);

    this.log(chalk.bold.blue('Living Contracts Generator'));
    this.log();

    // load config
    const configSpinner = ora('Loading configuration...').start();
    try {
      this.configuration = await this.loadConfig();
      if (flags.infer) this.configuration.inferValidation = flags.infer;
      configSpinner.succeed('Configuration loaded');
    } catch(error) {
      configSpinner.fail(chalk.bold.red('Failed to load configuration.'));
      this.error('Run `npx living-contracts init` to first set up your project.');
    }


    // parse prisma schema
    const schemaSpinner = ora('Parsing Prisma schema...').start();

    let parsedSchema: ParsedSchema;
    try {
      parsedSchema = await this.parseSchema(this.configuration.prismaSchema);
      schemaSpinner.succeed(`Found ${parsedSchema.models.length} models`);
    } catch (error) {
      schemaSpinner.fail(chalk.bold.red('Failed to parse Prisma schema.'));
      this.error('Please check your Prisma schema file and try again.');
    }


    // init a ts project for code generation
    const projectSpinner = ora('Initializing TypeScript project...').start();
    try {
      this.tsProject = await this.initTsProject(this.configuration.output);
      projectSpinner.succeed('TypeScript project initialized');
    } catch (error) {
      projectSpinner.fail(chalk.bold.red('Failed to initialize TypeScript project.'));
      this.error('Failed to create a new TypeScript project. Please check your project directory and try again.');
    }


    // connect to db for validation inference


    // generate files in output dir


    // save files


    // done - disconnect from db - success message


  }

  private async loadConfig(): Promise<GeneratorConfig> {
    const configPath = path.join(process.cwd(), '.living-contracts.json');

    return await fs.readJson(configPath) as GeneratorConfig;

  }

  private async parseSchema(schemaPath: string): Promise<ParsedSchema> {
    const absolutePath = path.resolve(process.cwd(), schemaPath); // do we need entirely absolute path here?
    const schema = await getDMMF({
      datamodel: absolutePath
    })

    return {
      models: Array.from(schema.datamodel.models),
      enums: Array.from(schema.datamodel.enums),
      datasources: []
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
      }
    })

    return newProject;
  }
}
