import PrismaInternals from '@prisma/internals'
const {getDMMF} = PrismaInternals
import path from 'path'
import { readFile } from 'fs/promises'
import type { ParsedSchema } from '@living-contracts/types';

export class SchemaParser {
    async parseSchema(schemaPath: string): Promise<ParsedSchema> {
        const absolutePath = path.resolve(process.cwd(), schemaPath)
        const datamodel = await readFile(absolutePath, 'utf-8')
        const schema = await getDMMF({
          datamodel,
        })
    
        return {
          models: Array.from(schema.datamodel.models),
          enums: Array.from(schema.datamodel.enums),
          datasources: [],
        }
      }
}