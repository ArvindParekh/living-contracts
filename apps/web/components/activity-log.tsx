"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSocket } from "@/hooks/use-socket";

export function ActivityLog() {
  const { logs } = useSocket();

  return (
    <div className="rounded-md border bg-card text-card-foreground shadow-sm">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Activity Log</h3>
      </div>
      <ScrollArea className="h-[400px] p-4">
        <div className="space-y-4">
          {logs.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              No logs yet. Waiting for CLI activity...
            </div>
          )}
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 text-sm">
              <span className="text-xs text-muted-foreground w-[70px] shrink-0">
                {log.timestamp.toLocaleTimeString()}
              </span>
              <Badge 
                variant={
                  log.level === "error" ? "destructive" : 
                  log.level === "warn" ? "secondary" : 
                  log.level === "success" ? "default" : "outline"
                }
                className={cn(
                  "w-[60px] justify-center shrink-0",
                  log.level === "success" && "bg-green-600 hover:bg-green-700 border-transparent",
                  log.level === "info" && "bg-blue-600 hover:bg-blue-700 border-transparent text-white"
                )}
              >
                {log.level}
              </Badge>
              <span className="break-all">{log.message}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
