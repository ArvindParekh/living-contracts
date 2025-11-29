"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, FileCode, GitBranch } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { isConnected, status, schema, config } = useSocket();

  // Simple regex to count models
  const modelCount = schema ? (schema.match(/model\s+\w+/g) || []).length : 0;
  const generatorCount = config ? config.generators.length : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Total Models
          </CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{modelCount}</div>
          <p className="text-xs text-muted-foreground">
            From current schema
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Active Generators
          </CardTitle>
          <FileCode className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{generatorCount}</div>
          <p className="text-xs text-muted-foreground">
            Configured in .living-contracts.json
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Breaking Changes
          </CardTitle>
          <GitBranch className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">0</div>
          <p className="text-xs text-muted-foreground">
            Safe to deploy
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Active Status
          </CardTitle>
          <Activity className={cn("h-4 w-4", isConnected ? "text-green-500" : "text-red-500")} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", 
            !isConnected ? "text-red-500" :
            status === "generating" ? "text-blue-500" : 
            status === "error" ? "text-red-500" : "text-green-500"
          )}>
            {!isConnected ? "Disconnected" : 
             status === "generating" ? "Generating..." : 
             status === "error" ? "Error" : "Watching"}
          </div>
          <p className="text-xs text-muted-foreground">
            {isConnected ? "Connected to CLI" : "Waiting for CLI..."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
