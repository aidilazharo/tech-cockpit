import { Drawer } from "@base-ui/react/drawer";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useMatches } from "react-router";
import { PageMessage } from "../components/qi";
import { CloseIcon, MenuIcon } from "../components/qi/icons";
import { useAuthStore, type Me } from "../auth/auth-store";
import { NotificationBell } from "../features/notifications/NotificationBell";
import { cn } from "../lib/cn";
import { Brand } from "./Brand";
import { SideNav } from "./SideNav";
import { UserMenu } from "./UserMenu";

const ICON_BUTTON =
  "inline-flex size-10 items-center justify-center rounded-button text-icon-default hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus";

/**
 * Signed-in layout. Desktop: full side navigation. Tablet: icon-only side navigation.
 * Phone: navigation in a drawer opened from the header.
 */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useTranslation();
  const signOutFailed = useAuthStore((state) => state.signOutFailed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const wide = useMatches().some(
    (match) => (match.handle as { wide?: boolean } | undefined)?.wide,
  );

  return (
    <div className="flex min-h-dvh flex-col bg-surface-default text-text-default">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-divider-default bg-surface-default px-2 md:px-4">
        <div className="flex items-center gap-1">
          <Drawer.Root
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            swipeDirection="left"
          >
            <Drawer.Trigger
              className={`${ICON_BUTTON} md:hidden`}
              aria-label={t("nav.open")}
            >
              <MenuIcon className="size-5" />
            </Drawer.Trigger>
            <Drawer.Portal>
              <Drawer.Backdrop className="fixed inset-0 z-40 bg-surface-overlay opacity-60" />
              <Drawer.Viewport className="fixed inset-0 z-50 flex">
                <Drawer.Popup className="flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-divider-default bg-surface-default shadow-lg outline-none">
                  <div className="flex h-14 items-center justify-between border-b border-divider-default px-4">
                    <Drawer.Title className="font-semibold">
                      {t("nav.title")}
                    </Drawer.Title>
                    <Drawer.Close
                      className={ICON_BUTTON}
                      aria-label={t("nav.close")}
                    >
                      <CloseIcon className="size-5" />
                    </Drawer.Close>
                  </div>
                  <nav aria-label={t("nav.label")}>
                    <SideNav onNavigate={() => setDrawerOpen(false)} />
                  </nav>
                </Drawer.Popup>
              </Drawer.Viewport>
            </Drawer.Portal>
          </Drawer.Root>
          <Link
            to="/"
            aria-label={t("shell.home")}
            className="rounded-button px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <Brand />
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <UserMenu me={me} />
        </div>
      </header>
      <div className="flex flex-1">
        <nav
          aria-label={t("nav.label")}
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-16 shrink-0 overflow-y-auto border-r border-divider-default md:block lg:w-60"
        >
          <SideNav compact />
        </nav>
        <main
          className={cn(
            "mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-8 md:px-8",
            wide ? "max-w-480" : "max-w-6xl",
          )}
        >
          {signOutFailed && (
            <PageMessage variant="error" title={t("auth.signOutFailed.title")}>
              {t("auth.signOutFailed.body")}
            </PageMessage>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
