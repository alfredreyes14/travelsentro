"use client";

import { LogOutIcon } from "lucide-react";

import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useNavigationGuard } from "./navigation-guard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AdminUserFooter({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  const { state, isMobile } = useSidebar();
  const { runGuarded } = useNavigationGuard();
  const collapsed = state === "collapsed" && !isMobile;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => runGuarded(() => logout())}
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              />
            }
          >
            <LogOutIcon className="size-4" />
            <span className="sr-only">Log Out</span>
          </TooltipTrigger>
          <TooltipContent side="right">Log Out</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-2 py-1 text-sm">
      <div className="truncate">
        <p className="truncate font-medium text-sidebar-foreground">
          {name ?? email}
        </p>
        <p className="truncate text-xs text-sidebar-foreground/70">{email}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => runGuarded(() => logout())}
        className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOutIcon className="size-4" />
        Log Out
      </Button>
    </div>
  );
}
