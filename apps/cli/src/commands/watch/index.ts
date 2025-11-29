import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import chokidar, {FSWatcher} from 'chokidar'
import path from 'path'
import fs from 'fs-extra'
import pkg from 'lodash'
const {debounce} = pkg
import ora from 'ora'
import {promisify} from 'util'
import {exec} from 'child_process'
import {Server} from 'socket.io'
import {createServer} from 'http'
import {ValidationInferenceService} from '@living-contracts/ai-inference'
import {SchemaParser} from '@living-contracts/schema-parser'
import {PrismaClient} from '@prisma/client/extension'
import PrismaInternals from '@prisma/internals'
const {getConfig} = PrismaInternals
import {ValidationRule} from '@living-contracts/types'

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
    port: Flags.integer({
      description: 'Port for the dashboard socket server',
      default: 3001,
    }),
  }

  private configuration!: WatchConfig
  private generationCount = 0
  private lastGenerationTime?: Date
  private watcher?: FSWatcher
  private io?: Server
  private prisma?: PrismaClient

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

    // start socket server
    const httpServer = createServer()
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    })

    httpServer.listen(flags.port, () => {
      this.log(chalk.blue(`📡 Dashboard Socket Server running on port ${flags.port}`))
    })

    this.io.on('connection', (socket) => {
      this.log(chalk.dim('🔌 Dashboard connected'))
      
      // sending initial state
      socket.emit('log', {
        id: Date.now().toString(),
        timestamp: new Date(),
        level: 'info',
        message: 'Connected to Living Contracts CLI',
      })

      if (this.configuration) {
        this.emitConfig()
      }
    })

    try {
      this.configuration = await this.loadConfig()
      if (flags.schema) this.configuration.prismaSchema = flags.schema
      this.emitConfig()
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
        this.emitLog('info', 'Schema change detected')
        await debounceGenerate('change')
      })
      .on('error', (error) => {
        this.emitLog('error', `Watcher error: ${error}`)
        this.error(`Watcher error: ${error}`)
      })

    // handle shutdown
    process.on('SIGINT', async () => {
      this.log(chalk.yellow('\n\n👋 Stopping watcher...'))
      this.watcher?.close()
      this.io?.close()
      if (this.prisma) {
        await this.prisma.$disconnect()
      }

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

  private emitConfig() {
    this.io?.emit('config', this.configuration)
    // also try to read schema content and emit it
    try {
      const schemaContent = fs.readFileSync(this.configuration.prismaSchema, 'utf-8')
      this.io?.emit('schema', schemaContent)
    } catch (e) {
      // ignore for now
    }
  }

  private emitLog(level: 'info' | 'warn' | 'error' | 'success', message: string) {
    this.io?.emit('log', {
      id: Date.now().toString(),
      timestamp: new Date(),
      level,
      message,
    })
  }

  private async runGeneration(changeType: string): Promise<void> {
    const startTime = Date.now()
    this.io?.emit('status', 'generating')
    
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
      this.emitLog('success', `Generated in ${duration}ms`)

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

      this.log()
      this.io?.emit('status', 'idle')
      this.emitConfig() // Re-emit schema as it might have changed

      if (this.configuration.inferValidation) {
        await this.runInference()
      }

    } catch (error) {
      spinner.fail(chalk.red('❌ Generation failed!'))
      this.io?.emit('status', 'error')

      const errMsg = (error as any).stderr || (error as any).message || error
      const lines = errMsg.toString().split('\n').filter(Boolean)

      this.log(chalk.red('\n❌ Error details:'))
      lines.forEach((line: string) => {
        if (line.includes('Error:')) {
          this.log(chalk.red(`   ${line}`))
          this.emitLog('error', line)
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

  private async runInference() {
    this.io?.emit('status', 'generating')
    const spinner = ora('Inferring validation rules...').start()
    
    try {
      // connect to DB if not connected
      if (!this.prisma) {
        const prismaConfig = await getConfig({
          datamodel: this.configuration.prismaSchema,
        })
        const datasourceUrl = prismaConfig.datasources[0]?.url.value

        if (datasourceUrl) {
          this.prisma = new PrismaClient({
            datasourceUrl: datasourceUrl,
          })
        }
      }

      if (!this.prisma) {
        spinner.info('No database connection found, skipping inference')
        return
      }

      // parse schema
      const parser = new SchemaParser()
      const parsedSchema = await parser.parseSchema(this.configuration.prismaSchema)

      // run inference
      const service = new ValidationInferenceService(this.prisma, {
        sampleSize: 50,
        aiProvider: 'openai',
      })

      const rules = await service.inferRules(parsedSchema.models)
      
      // convert map to object for socket transmission
      const rulesObj: Record<string, ValidationRule[]> = {}
      rules.forEach((value, key) => {
        rulesObj[key] = value
      })

      this.io?.emit('validation-rules', rulesObj)
      spinner.succeed(`Inferred validation rules for ${rules.size} models`)
      this.emitLog('success', `Inferred validation rules for ${rules.size} models`)

    } catch (error) {
      spinner.fail('Failed to infer validation rules')
      this.emitLog('error', `Inference failed: ${error}`)
    } finally {
      this.io?.emit('status', 'idle')
    }
  }
}
