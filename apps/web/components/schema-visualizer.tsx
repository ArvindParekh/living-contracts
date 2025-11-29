"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSocket } from "@/hooks/use-socket";
import { parseSchema } from "@/lib/schema-parser";
import { useMemo } from "react";

export function SchemaVisualizer() {
  const { schema } = useSocket();

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
                {model.fields.map((field) => (
                  <TableRow key={field.name}>
                    <TableCell className="font-medium">{field.name}</TableCell>
                    <TableCell className="text-muted-foreground">{field.type}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {field.isId && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5">ID</Badge>}
                        {field.isUnique && <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">Unique</Badge>}
                        {!field.isRequired && <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">Optional</Badge>}
                        {field.isList && <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">List</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
