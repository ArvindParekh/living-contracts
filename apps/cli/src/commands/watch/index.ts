import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import chokidar, {FSWatcher} from 'chokidar'
import path from 'path'
import * as fs from 'fs-extra'
import {debounce} from 'lodash'
import ora from 'ora'
import {promisify} from 'util'
import {exec} from 'child_process'

const execAsync = promisify(exec)

interface WatchConfig {
  prismaSchema: string
  output: string
  generators: string[]
  inferValidation: Boolean
}

export default class Watch extends Command {
  static description =
    'Watch your Prisma schema for changes and automatically regenerate TypeScript SDK, validation, and more'

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --no-clear`,
    `<%= config.bin %> <%= command.id %> --debounce 1000`,
  ]

  static flags = {
    schema: Flags.string({
      description: 'Path to Prisma schema file to watch',
      char: 's',
    }),
    clear: Flags.boolean({
      description: 'Clear console on each change',
      default: true,
    }),
    debounce: Flags.integer({
      description: 'Debounce delay in milliseconds',
      default: 10000,
    }),
    'run-initial': Flags.boolean({
      description: 'Run generation immediately on start',
      default: true,
    }),
  }

  private configuration!: WatchConfig
  private generationCount = 0
  private lastGenerationTime?: Date
  private watcher?: FSWatcher

  async run(): Promise<void> {
    const {flags} = await this.parse(Watch)


    this.log(
      chalk.cyan(`
            ╦  ╦╦  ╦╦╔╗╔╔═╗  ╔═╗╔═╗╔╗╔╔╦╗╦═╗╔═╗╔═╗╔╦╗╔═╗
            ║  ║╚╗╔╝║║║║║ ╦  ║  ║ ║║║║ ║ ╠╦╝╠═╣║   ║ ╚═╗
            ╩═╝╩ ╚╝ ╩╝╚╝╚╝   ╚═╝╚═╝╝╚╝ ╩ ╩╚═╩ ╩╚═╝ ╩ ╚═╝
                `),
    )
    this.log(chalk.bold('👀 Schema Watcher Active\n'))

    try {
      this.configuration = await this.loadConfig()
      if (flags.schema) this.configuration.prismaSchema = flags.schema
    } catch (error) {
      this.error('No configuration found. Run "living-contracts init" first!')
    }

    const schemaPath = this.configuration.prismaSchema

    if (!fs.pathExists(schemaPath)) {
      this.error(`Prisma schema file not found at ${schemaPath}`)
    }

    if (flags['run-initial']) {
      await this.runGeneration('initial')
    }

    const debounceGenerate = debounce(async (changeType: string) => {
      await this.runGeneration(changeType)
    }, flags.debounce)

    // Set up file watcher
    this.log(chalk.gray(`Watching: ${schemaPath}`))
    this.log(chalk.gray(`Output: ${this.configuration.output}/`))
    this.log(chalk.gray(`Generators: ${this.configuration.generators.join(', ')}`))
    this.log()
    this.log(chalk.dim('Press Ctrl+C to stop watching\n'))

    // start watcher
    this.watcher = chokidar.watch(schemaPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    })

    // watching events
    this.watcher
      .on('change', async () => {
        if (flags.clear) console.clear()

        this.log(chalk.yellow('\n⚡ Schema change detected!'))
        await debounceGenerate('change')
      })
      .on('error', (error) => {
        this.error(`Watcher error: ${error}`)
      })

    // handle shutdown
    process.on('SIGINT', async () => {
      this.log(chalk.yellow('\n\n👋 Stopping watcher...'))
      this.watcher?.close()

      // show final stats
      if (this.generationCount > 0) {
        this.log(chalk.green(`✨ Generated ${this.generationCount} times this session`))
        if (this.lastGenerationTime) {
          const duration = Date.now() - this.lastGenerationTime.getTime()
          this.log(chalk.gray(`Last generation: ${this.formatDuration(duration)} ago`))
        }
      }

      process.exit(0)
    })

    process.stdin.resume() // keeps process alive and running
  }

  private async loadConfig(): Promise<WatchConfig> {
    const configPath = path.join(process.cwd(), '.living-contracts.json')

    return await fs.readJson(configPath)
  }

  private async runGeneration(changeType: string): Promise<void> {
    const startTime = Date.now()
    const spinner = ora({
      text: 'Generating contracts...',
      spinner: 'dots12',
    }).start()

    try {
      await execAsync('./bin/dev generate --no-infer', {
        cwd: process.cwd(),
      })

      const duration = Date.now() - startTime
      spinner.succeed(chalk.green(`✅ Generated in ${duration}ms`))

      this.generationCount++
      this.lastGenerationTime = new Date()

      // showing what files were generated
      const generatedFiles = await this.getGeneratedFiles()
      if (generatedFiles.length > 0) {
        this.log(chalk.dim(`   Updated ${generatedFiles.length} files:`))
        generatedFiles.slice(0, 5).forEach((file) => {
          this.log(chalk.dim(`   • ${file}`))
        })
        if (generatedFiles.length > 5) {
          this.log(chalk.dim(`   • ... and ${generatedFiles.length - 5} more`))
        }
      }

      // check for breaking changes (if this isn't the initial run)
      // TODO: this later
      //   if (changeType !== 'initial' && this.generationCount > 1) {
      //     const breakingChanges = await this.checkForBreakingChanges()
      //   }

      this.log()

      const messages = [
        '🚀 Hot reload magic!',
        '⚡ Faster than light!',
        '🎯 Perfect sync achieved!',
        '🔥 On fire today!',
        '💫 Cosmic alignment complete!',
        '🌟 Stellar performance!',
        '⚡ Lightning fast!',
        '🎨 Beautifully generated!',
        '🛸 Out of this world!',
        '🏎️  Formula 1 speed!',
      ]

      if (this.generationCount % 5 === 0) {
        this.log(chalk.cyan(messages[Math.floor(Math.random() * messages.length)]))
        this.log()
      }
    } catch (error) {
      spinner.fail(chalk.red('❌ Generation failed!'))

      const errMsg = (error as any).stderr || (error as any).message || error
      const lines = errMsg.toString().split('\n').filter(Boolean)

      this.log(chalk.red('\n❌ Error details:'))
      lines.forEach((line: string) => {
        if (line.includes('Error:')) {
          this.log(chalk.red(`   ${line}`))
        } else {
          this.log(chalk.gray(`   ${line}`))
        }
      })

      this.log()
      this.log(chalk.yellow('💡 Common fixes:'))

      if (errMsg.includes('P1001') || errMsg.includes('database')) {
        this.log(chalk.yellow('   • Check your database connection in .env'))
        this.log(chalk.yellow('   • Run "npx prisma db push" to sync schema'))
      } else if (errMsg.includes('schema.prisma')) {
        this.log(chalk.yellow('   • Fix syntax errors in your schema'))
        this.log(chalk.yellow('   • Run "npx prisma validate"'))
      } else if (errMsg.includes('permission')) {
        this.log(chalk.yellow('   • Check file permissions for output directory'))
      }

      this.log()
    }
  }

  private async getGeneratedFiles(): Promise<string[]> {
    const outputDir = this.configuration.output
    const files: string[] = []

    const readDir = async (outputDir: string) => {
      const entries = await fs.readdir(outputDir, {withFileTypes: true})

      entries.forEach(async (file) => {
        const fullPath = path.join(outputDir, file.name)
        if (file.isDirectory()) {
          await readDir(fullPath)
        } else if (file.isFile() && !file.name.startsWith('.')) {
          files.push(path.relative(outputDir, fullPath))
        }
      })
    }

    if (await fs.pathExists(outputDir)) {
      await readDir(outputDir)
    }

    return files.sort()
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`
    return `${Math.floor(ms / 3600000)}h`
  }
}
