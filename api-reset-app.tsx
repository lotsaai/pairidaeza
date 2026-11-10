import { mount, resource, Text, View } from "nsh";

function Reset() {
  const reset = resource(async () => {
    const baseUrl = process.env.PAIRIDAEZA_API_URL || "http://127.0.0.1:17810";
    const response = await fetch(`${baseUrl}/api/mock/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    if (!response.ok) throw new Error(`Mock API reset failed: HTTP ${response.status}`);
    return true;
  });
  return (
    <View>
      <Text>{reset.error() ? String(reset.error()) : reset() ? "Mock API reset" : "Resetting mock API"}</Text>
    </View>
  );
}
mount(Reset);
