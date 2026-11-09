// The sidebar's trailing edge: drag it to resize within 240..min(480, window-320); below 160 it snaps to the rail.
import { batch, PanResponder, View } from "nsh";
import { clampSidebarWidth, SIDEBAR_SNAP_WIDTH, sidebarCollapsed, sidebarDragWidth, sidebarShownWidth, sidebarWidth } from "../../nav";

export function SidebarResizeHandle() {
  let start = 0;
  const end = (width: number | null) =>
    batch(() => {
      if (width !== null && width < SIDEBAR_SNAP_WIDTH) sidebarCollapsed.set(true);
      else if (width !== null) {
        sidebarCollapsed.set(false);
        sidebarWidth.set(clampSidebarWidth(width));
      }
      sidebarDragWidth.set(null);
    });
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      start = sidebarShownWidth();
      sidebarDragWidth.set(start);
    },
    onPanResponderMove: (_e, g) => sidebarDragWidth.set(start + g.dx),
    onPanResponderRelease: (_e, g) => end(start + g.dx),
    onPanResponderTerminate: () => end(null),
  });
  return (
    <View
      accessibilityLabel="Resize bots sidebar"
      role="adjustable"
      {...pan.panHandlers}
      style={{ cursor: "col-resize" }}
      class="absolute inset-y-0 right-0 w-1.5 hover:bg-sidebar-border active:bg-sidebar-border"
    />
  );
}
