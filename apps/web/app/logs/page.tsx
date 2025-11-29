import { ActivityLog } from "@/components/activity-log";

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">System Logs</h3>
        <p className="text-sm text-muted-foreground">
          Real-time activity from the Living Contracts CLI.
        </p>
      </div>
      <ActivityLog />
    </div>
  );
}
