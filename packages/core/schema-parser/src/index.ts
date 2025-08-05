import {DMMF} from '@prisma/client/runtime/library.js'
import {getDMMF} from '@prisma/internals'
import path from 'path'

interface ParsedSchema {
    models: DMMF.Model[]
    enums: DMMF.DatamodelEnum[]
    datasources: any[]
  }

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