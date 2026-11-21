// The right panel beside the chat: drag its leading edge to resize within 320..(window - sidebar - 320).
import { batch, type JSX, PanResponder, View } from "nsh";
import { clampPanelWidth, panelDragWidth, panelShownWidth, panelWidth } from "../nav";

function PanelResizeHandle() {
  let start = 0;
  const end = (width: number | null) =>
    batch(() => {
      if (width !== null) panelWidth.set(clampPanelWidth(width));
      panelDragWidth.set(null);
    });
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      start = panelShownWidth();
      panelDragWidth.set(start);
    },
    onPanResponderMove: (_e, g) => panelDragWidth.set(start - g.dx),
    onPanResponderRelease: (_e, g) => end(start - g.dx),
    onPanResponderTerminate: () => end(null),
  });
  return (
    <View
      accessibilityLabel="Resize details panel"
      role="adjustable"
      {...pan.panHandlers}
      style={{ cursor: "col-resize" }}
      class="absolute inset-y-0 left-0 w-1.5 hover:bg-border active:bg-border"
    />
  );
}

/** A resizable panel beside the chat. */
export function SidePanel(props: { children: JSX.Element }) {
  return (
    <View class="border-l border-border" style={{ width: panelShownWidth() }}>
      {props.children}
      <PanelResizeHandle />
    </View>
  );
}
