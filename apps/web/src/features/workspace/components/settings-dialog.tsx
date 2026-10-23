import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { type SettingsCategory, SettingsPanel } from "./settings-panel";

export function SettingsDialog({
  open,
  initialCategory,
  onClose,
  onRestoreFocus,
}: {
  open: boolean;
  initialCategory: SettingsCategory;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    // Keep the mounted form while an unsaved draft is being edited.
    const update = () => {
      if (!dirty) setMobile(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [dirty]);
  const discardApproved = useRef(false);
  useEffect(() => {
    if (open) discardApproved.current = false;
  }, [open]);
  const blocker = useBlocker({
    shouldBlockFn: () => open && dirty && !discardApproved.current,
    enableBeforeUnload: open && dirty,
    withResolver: true,
  });
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  function leave(action: () => void) {
    if (dirty) {
      pendingFocus.current = document.activeElement as HTMLElement;
      setPendingLeave(() => action);
    } else action();
  }
  const Root = mobile ? Drawer : Dialog;
  const Content = mobile ? DrawerContent : DialogContent;
  const Header = mobile ? DrawerHeader : DialogHeader;
  const Title = mobile ? DrawerTitle : DialogTitle;
  const Description = mobile ? DrawerDescription : DialogDescription;
  if (mobile === null) return null;
  return (
    <Root
      open={open}
      onOpenChange={(value) => {
        if (!value) leave(onClose);
      }}
      {...(mobile ? { dismissible: !dirty, autoFocus: true } : {})}
    >
      <Content
        className={
          mobile
            ? "h-[90dvh] overflow-hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[90dvh]"
            : "flex h-[min(640px,90dvh)] max-w-[calc(100%-3rem)] gap-0 overflow-hidden p-0 sm:max-w-4xl"
        }
        {...(!mobile ? { showCloseButton: false } : {})}
        onPointerDownOutside={(event) => {
          if (dirty) {
            event.preventDefault();
            leave(onClose);
          }
        }}
        onEscapeKeyDown={(event) => {
          if (dirty) {
            event.preventDefault();
            leave(onClose);
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!open) onRestoreFocus();
        }}
      >
        <Header className="sr-only">
          <Title>Pengaturan</Title>
          <Description>Kelola pengalamanmu tanpa meninggalkan pekerjaan.</Description>
        </Header>
        <AlertDialog
          open={pendingLeave !== null || blocker.status === "blocked"}
          onOpenChange={(value) => {
            if (!value) {
              setPendingLeave(null);
              blocker.reset?.();
            }
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              if (!discardApproved.current && pendingFocus.current?.isConnected) {
                event.preventDefault();
                pendingFocus.current.focus();
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Buang perubahan yang belum disimpan?</AlertDialogTitle>
              <AlertDialogDescription>
                Perubahan proaktivitas akan dibuang. Pilihan yang sudah tersimpan tetap berlaku.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Lanjutkan mengedit</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  discardApproved.current = true;
                  setDirty(false);
                  blocker.proceed?.();
                  pendingLeave?.();
                  setPendingLeave(null);
                }}
              >
                Buang perubahan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <SettingsPanel
          initialCategory={initialCategory}
          mobile={mobile}
          onClose={() => leave(onClose)}
          onDirtyChange={setDirty}
        />
      </Content>
    </Root>
  );
}
