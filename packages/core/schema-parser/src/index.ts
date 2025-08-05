import {getDMMF} from '@prisma/internals'
import path from 'path'
import type { ParsedSchema } from '@living-contracts/types';

export class SchemaParser {
    async parseSchema(schemaPath: string): Promise<ParsedSchema> {
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
}