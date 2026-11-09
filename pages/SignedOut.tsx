// What shows after Log out: a sign-in form with no backend behind it (any entry signs in).
import { signal, Text, View } from "nsh";
import { Input } from "nsh/base";
import { Field, fieldClass, TextButton } from "../components/ui";
import { signIn } from "../store";

export function SignedOut() {
  const email = signal("");
  const password = signal("");
  return (
    <View class="flex-1 items-center justify-center bg-background p-6">
      <View class="w-full max-w-sm gap-4">
        <Text role="header" class="text-center text-2xl font-semibold text-foreground">
          Sign in to Pairidaeza
        </Text>
        <Field label="Email">
          <Input
            value={email()}
            onChange={({ value }) => email.set(value)}
            placeholder="Your email address"
            accessibilityLabel="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            class={fieldClass}
          />
        </Field>
        <Field label="Password">
          <Input
            value={password()}
            onChange={({ value }) => password.set(value)}
            onSubmit={signIn}
            placeholder="Password"
            accessibilityLabel="Password"
            masked
            class={fieldClass}
          />
        </Field>
        <TextButton label="Sign in" variant="primary" onPress={signIn} />
      </View>
    </View>
  );
}
