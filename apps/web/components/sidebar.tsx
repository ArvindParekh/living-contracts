"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, Activity, Settings, FileCode, LayoutDashboard } from "lucide-react";

const sidebarNavItems = [
  {
    title: "Overview",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Schema",
    href: "/schema",
    icon: Database,
  },
  {
    title: "Activity Logs",
    href: "/logs",
    icon: Activity,
  },
  {
    title: "Generated Code",
    href: "/generated",
    icon: FileCode,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden border-r bg-muted/40 md:block w-64 h-screen fixed left-0 top-0">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="text-xl">Living Contracts</span>
          </Link>
        </div>
        <ScrollArea className="flex-1 px-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-1 mt-4">
            {sidebarNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
              >
                <Button
                  variant={pathname === item.href ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3",
                    pathname === item.href && "bg-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Button>
              </Link>
            ))}
          </nav>
        </ScrollArea>
      </div>
    </div>
  );
}
