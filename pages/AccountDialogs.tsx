// Invite friends and Get the mobile app: small dialogs opened from the account menu.
import { Clipboard, openUrl, signal, Text, View } from "nsh";
import { Button, Dialog, Input } from "nsh/base";
import { fieldClass, Icon, IconButton, type IconName, TextButton } from "../components/ui";
import { inviteOpen, mobileAppOpen } from "../nav";
import { mobileAppUrls, referral } from "../store";

const dialogClass =
  "mt-24 w-full max-w-sm gap-4 self-center rounded-(--radius) border border-border bg-popover p-5 shadow-lg shadow-shadow-color";

const copied = signal(false);

function Perk(props: { icon: IconName; children: string }) {
  return (
    <View class="flex-row items-center gap-3">
      <Icon name={props.icon} size={20} tone="muted-foreground" />
      <Text class="flex-1 text-popover-foreground">{props.children}</Text>
    </View>
  );
}

export function InviteDialog() {
  const close = () => inviteOpen.set(false);
  const copy = async () => {
    await Clipboard.writeText(referral.url);
    copied.set(true);
  };
  return (
    <Dialog
      open={inviteOpen()}
      onOpenChange={({ open }) => {
        if (!open) {
          copied.set(false);
          close();
        }
      }}
      animation="fade"
      backdropClass="bg-overlay"
      class={dialogClass}
    >
      <View class="flex-row items-start justify-between gap-2">
        <Text role="header" class="flex-1 text-lg font-semibold text-popover-foreground">
          {`Give a friend ${referral.trialWeeks} weeks free`}
        </Text>
        <IconButton icon="x" label="Close invite" onPress={close} />
      </View>
      <View class="gap-3">
        <Perk icon="sparkles">{`They get ${referral.trialWeeks} weeks free.`}</Perk>
        <Perk icon="clock">You get a free month when they start their trial with a new card.</Perk>
      </View>
      <Input readonly value={referral.url} accessibilityLabel="Invite link" class={fieldClass} />
      <Button onPress={copy} class="min-h-10 flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 active:bg-primary/80">
        <Icon name={copied() ? "check" : "copy"} size={16} tone="primary-foreground" />
        <Text class="text-sm font-medium text-primary-foreground">{copied() ? "Copied" : "Copy link"}</Text>
      </Button>
    </Dialog>
  );
}

export function MobileAppDialog() {
  const close = () => mobileAppOpen.set(false);
  return (
    <Dialog
      open={mobileAppOpen()}
      onOpenChange={({ open }) => !open && close()}
      animation="fade"
      backdropClass="bg-overlay"
      class={dialogClass}
    >
      <View class="flex-row items-start justify-between gap-2">
        <Text role="header" class="flex-1 text-lg font-semibold text-popover-foreground">
          Get the mobile app
        </Text>
        <IconButton icon="x" label="Close mobile app" onPress={close} />
      </View>
      <Text class="text-sm text-muted-foreground">Your bots, chats and approvals, on your phone.</Text>
      <View class="gap-2">
        <TextButton label="App Store" onPress={() => void openUrl(mobileAppUrls.ios)} />
        <TextButton label="Google Play" onPress={() => void openUrl(mobileAppUrls.android)} />
      </View>
    </Dialog>
  );
}
