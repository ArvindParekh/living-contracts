import {Command, Flags} from '@oclif/core'
import {getDMMF, getConfig} from "@prisma/internals"
import chalk from 'chalk'
import * as fs from "fs-extra"
import ora from 'ora'
import path from 'path'

interface GeneratorConfig {
  output: string
  generators: string[]
  inferValidation: boolean
  prismaSchema: string
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

  private config: GeneratorConfig;

  async run(): Promise<void> {

    const { flags } = await this.parse(Generate);

    this.log(chalk.bold.blue('Living Contracts Generator'));
    this.log();

    // load config
    const configSpinner = ora('Loading configuration...').start();
    try {
      this.config = await this.loadConfig();
      if (flags.infer) this.config.inferValidation = flags.infer;
      configSpinner.succeed('Configuration loaded');
    } catch(error) {
      configSpinner.fail(chalk.bold.red('Failed to load configuration.'));
      this.error('Run `npx living-contracts init` to first set up your project.');
    }


    // parse prisma schema


    // init a ts project for code generation


    // connect to db for validation inference


    // generate files in output dir


    // save files


    // done - disconnect from db - success message


  }

  private async loadConfig(): Promise<GeneratorConfig> {
    const configPath = path.join(process.cwd(), '.living-contracts.json');

    return await fs.readJson(configPath) as GeneratorConfig;

  }
}
