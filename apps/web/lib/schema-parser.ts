// a lightweight regex based parser for prisma schema to extract dashboard related data instead of importing the heaving @prisma/internals library
export interface Field {
  name: string;
  type: string;
  isId?: boolean;
  isRequired: boolean;
  isUnique?: boolean;
  isList?: boolean;
  default?: string;
}

export interface Model {
  name: string;
  fields: Field[];
}

export function parseSchema(schema: string): Model[] {
  const models: Model[] = [];
  const lines = schema.split('\n');
  let currentModel: Model | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Start of model
    const modelMatch = trimmed.match(/^model\s+(\w+)\s+{/);
    if (modelMatch) {
      currentModel = {
        name: modelMatch[1] || '',
        fields: [],
      };
      continue;
    }

    // End of model
    if (trimmed === '}' && currentModel) {
      models.push(currentModel);
      currentModel = null;
      continue;
    }

    // Field definition
    if (currentModel && trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('@@')) {
      // Simple regex for field: name type attributes
      // e.g. id String @id @default(uuid())
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[0] || '';
        const typeRaw = parts[1] || '';
        const attributes = parts.slice(2).join(' ');

        if (!name || !typeRaw) continue;

        const isList = typeRaw.endsWith('[]');
        const isRequired = !typeRaw.endsWith('?') && !isList; // Lists are technically optional in Prisma client but let's mark them as list
        const type = typeRaw.replace('[]', '').replace('?', '');

        const field: Field = {
          name,
          type,
          isRequired,
          isList,
          isId: attributes.includes('@id'),
          isUnique: attributes.includes('@unique'),
        };

        currentModel.fields.push(field);
      }
    }
  }

  return models;
}
