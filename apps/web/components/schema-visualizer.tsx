"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSocket } from "@/hooks/use-socket";
import { parseSchema } from "@/lib/schema-parser";
import { useMemo } from "react";

export function SchemaVisualizer() {
  const { schema, validationRules } = useSocket();

  const models = useMemo(() => {
    if (!schema) return [];
    return parseSchema(schema);
  }, [schema]);

  if (!schema) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Waiting for schema...
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {models.map((model) => (
        <Card key={model.name} className="overflow-hidden">
          <CardHeader className="bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{model.name}</CardTitle>
              <Badge variant="outline">{model.fields.length} fields</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Field</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Attributes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.fields.map((field) => {
                  const rules = validationRules?.[model.name]?.filter(r => r.field === field.name) || [];
                  const rule = rules[0]; // Assuming one rule object per field for now, or we can iterate

                  return (
                    <TableRow key={field.name}>
                      <TableCell className="font-medium">
                        <div>{field.name}</div>
                        {rule?.description && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{rule.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {field.type}
                        {rule?.pattern && (
                          <div className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded mt-1 inline-block" title="Inferred Regex Pattern">
                            /{rule.pattern}/
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {field.isId && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5">ID</Badge>}
                          {field.isUnique && <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">Unique</Badge>}
                          {!field.isRequired && <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">Optional</Badge>}
                          {field.isList && <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">List</Badge>}
                          
                          {/* Inferred Rules */}
                          {rule?.min !== undefined && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5 bg-blue-100 text-blue-800 hover:bg-blue-100">
                              Min: {rule.min}
                            </Badge>
                          )}
                          {rule?.max !== undefined && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5 bg-blue-100 text-blue-800 hover:bg-blue-100">
                              Max: {rule.max}
                            </Badge>
                          )}
                          {rule?.type === 'email' && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5 bg-green-100 text-green-800 hover:bg-green-100">
                              Email
                            </Badge>
                          )}
                          {rule?.type === 'url' && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5 bg-green-100 text-green-800 hover:bg-green-100">
                              URL
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
