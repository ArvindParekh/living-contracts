import { SchemaVisualizer } from "@/components/schema-visualizer";

export default function SchemaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Schema Visualization</h3>
        <p className="text-sm text-muted-foreground">
          View your current Prisma schema models and fields.
        </p>
      </div>
      <SchemaVisualizer />
    </div>
  );
}
