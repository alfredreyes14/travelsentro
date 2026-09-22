"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BlockerPrompt = {
  title: string;
  description: string;
  confirmLabel: string;
};

type NavigationGuardContextValue = {
  /** True while at least one blocker is registered. */
  isBlocked: boolean;
  /**
   * Runs `action` immediately when nothing is blocking, otherwise holds it
   * behind the confirmation dialog and only runs it if the admin confirms.
   */
  runGuarded: (action: () => void) => void;
  registerBlocker: (id: string, prompt: BlockerPrompt) => () => void;
};

const NavigationGuardContext =
  createContext<NavigationGuardContextValue | null>(null);

/**
 * Guards leaving the admin shell while work that only lives in the browser
 * is still running (currently: poster extraction). Two separate exits have
 * to be covered, and only the browser can handle the first one:
 *
 * - Closing the tab/window, reloading, or typing a new URL -> `beforeunload`,
 *   which shows the browser's own non-customisable prompt.
 * - Clicking admin nav (a client-side <Link>, or Log Out) -> never reaches
 *   `beforeunload` at all, so those call `runGuarded()` and get the
 *   in-app AlertDialog below instead.
 *
 * Mounted once in the (dashboard) layout so the sidebar/topbar nav, which
 * renders above the page, can consume it alongside the page itself.
 */
export function NavigationGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [blockers, setBlockers] = useState<Map<string, BlockerPrompt>>(
    () => new Map()
  );
  // Wrapped in an object rather than stored bare: useState treats a bare
  // function argument as an updater callback.
  const [pending, setPending] = useState<{
    run: () => void;
    prompt: BlockerPrompt;
  } | null>(null);

  const registerBlocker = useCallback(
    (id: string, prompt: BlockerPrompt) => {
      setBlockers((previous) => new Map(previous).set(id, prompt));
      return () =>
        setBlockers((previous) => {
          const next = new Map(previous);
          next.delete(id);
          return next;
        });
    },
    []
  );

  // Most recently registered blocker wins, so its wording is what the admin
  // sees when several are somehow active at once.
  const activePrompt = useMemo(
    () => [...blockers.values()].at(-1) ?? null,
    [blockers]
  );

  useEffect(() => {
    if (activePrompt === null) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      // Browsers show their own generic wording here — the message can't be
      // customised, so the copy in activePrompt is only used by the dialog.
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activePrompt]);

  const runGuarded = useCallback(
    (action: () => void) => {
      if (activePrompt === null) {
        action();
        return;
      }
      setPending({ run: action, prompt: activePrompt });
    },
    [activePrompt]
  );

  const value = useMemo<NavigationGuardContextValue>(
    () => ({
      isBlocked: activePrompt !== null,
      runGuarded,
      registerBlocker,
    }),
    [activePrompt, runGuarded, registerBlocker]
  );

  return (
    <NavigationGuardContext value={value}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.prompt.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.prompt.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on this page</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = pending?.run;
                setPending(null);
                action?.();
              }}
            >
              {pending?.prompt.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigationGuardContext>
  );
}

export function useNavigationGuard(): NavigationGuardContextValue {
  const context = useContext(NavigationGuardContext);
  if (context === null) {
    throw new Error(
      "useNavigationGuard must be used within a NavigationGuardProvider"
    );
  }
  return context;
}

/**
 * Blocks leaving the admin shell for as long as `when` is true, using the
 * given copy in the in-app confirmation dialog.
 */
export function useNavigationBlocker({
  when,
  title,
  description,
  confirmLabel,
}: { when: boolean } & BlockerPrompt) {
  const id = useId();
  const { registerBlocker } = useNavigationGuard();

  useEffect(() => {
    if (!when) return;
    return registerBlocker(id, { title, description, confirmLabel });
  }, [when, id, registerBlocker, title, description, confirmLabel]);
}
