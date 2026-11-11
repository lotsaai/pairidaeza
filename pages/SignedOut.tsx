import { Text, View } from "nsh";
import { cancelSignIn, signInError, signInSession, signInState } from "../auth";
import { TextButton } from "../components/ui";

export function SignedOut() {
  return (
    <View class="flex-1 items-center justify-center bg-background p-6">
      <View class="w-full max-w-sm gap-4">
        <Text role="header" class="text-center text-2xl font-semibold text-foreground">
          Sign in to Pairidaeza
        </Text>
        <If when={signInError()}>
          <Text class="text-destructive">{signInError()}</Text>
        </If>
        <If
          when={signInState() !== "idle"}
          else={
            <TextButton
              label="Sign in"
              variant="primary"
              onPress={() => {
                void signInSession();
              }}
            />
          }
        >
          <Text class="text-center text-muted-foreground">Complete sign-in in your browser.</Text>
          <TextButton label="Cancel" onPress={cancelSignIn} />
        </If>
      </View>
    </View>
  );
}
