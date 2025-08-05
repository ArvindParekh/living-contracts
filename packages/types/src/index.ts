import { DMMF } from '@prisma/client/runtime/library.js'
import type { Project } from 'ts-morph'

export interface GeneratorConfig {
  output: string
  generators: string[]
  inferValidation: boolean
  prismaSchema: string
}

export interface ParsedSchema {
  models: DMMF.Model[]
  enums: DMMF.DatamodelEnum[]
  datasources: any[]
}

export interface ValidationRule {
  field: string
  type: string
  min?: number
  max?: number
  pattern?: string
  nullable: boolean
  unique: boolean
  examples: any[]
}

export interface GeneratorContext {
    tsProject: Project
    parsedSchema: ParsedSchema
    validationRules: Map<string, ValidationRule[]>
    outputBaseDir: string
}

export type Model = DMMF.Model;

export type Field = DMMF.Field;

export type tsProject = Project;