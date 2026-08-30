import { Platform } from "react-native";

export const BACKGROUND_LOCATION_TASK = "routeradio-background-location";

export function registerBackgroundLocationTask(): void {
  if (Platform.OS === "web") return;
  try {
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    if (TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) return;
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
      if (error || !data) return;
    });
  } catch {
    // native module not present (web / tests)
  }
}
