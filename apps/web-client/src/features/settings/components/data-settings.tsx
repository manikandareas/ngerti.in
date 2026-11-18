import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PreferenceToggle } from "@/features/settings/components/preference-sections";
import { SettingsRow, SettingsSection } from "@/features/settings/components/shared";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { usePreferences } from "@/hooks/use-preferences";

export function DataSettings() {
  const { reset } = usePreferences();
  const { close } = useSettings();
  return (
    <>
      <SettingsSection title="Storage on this device">
        <PreferenceToggle
          setting="persistDrafts"
          title="Keep drafts after closing the app"
          description="When disabled, drafts only last for this session. Conversation history stays saved."
        />
      </SettingsSection>
      <SettingsSection title="Conversation data">
        <SettingsRow
          title="Export a conversation"
          description="Open a conversation and choose Export conversation from its menu. Exports include messages, without attachments."
        >
          <Button variant="outline" onClick={() => void close()}>
            Go to conversation
          </Button>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="App preferences">
        <SettingsRow
          title="Reset preferences"
          description="Restore appearance and interface behavior on this device."
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Reset preferences</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset preferences?</AlertDialogTitle>
                <AlertDialogDescription>
                  Reset startup, reading, send shortcut, motion, and draft preferences. Theme,
                  accounts, models, and conversation history are kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (reset()) toast.success("Preferences reset.");
                  }}
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
