import { mount, Text, View } from "nsh";
import { Button } from "nsh/base";
import { apiError, apiSignal, bootState, loadApi, retrySaving, saving } from "./api";

const value = apiSignal("test", "value", "");
function App() {
  void loadApi();
  return (
    <View>
      <Text>{bootState()}</Text>
      <Text>{value()}</Text>
      <Text>{saving() ? "Saving" : "Saved"}</Text>
      <Text>{apiError()}</Text>
      <Button accessibilityLabel="First" onPress={() => value.set("first")}>
        <Text>First</Text>
      </Button>
      <Button accessibilityLabel="Second" onPress={() => value.set("second")}>
        <Text>Second</Text>
      </Button>
      <Button
        accessibilityLabel="Retry"
        onPress={() => {
          void retrySaving();
        }}
      >
        <Text>Retry</Text>
      </Button>
    </View>
  );
}
mount(App);
