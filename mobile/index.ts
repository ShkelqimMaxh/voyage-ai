import { registerRootComponent } from "expo";

import App from "./App";
import { registerBackgroundLocationTask } from "./src/engine/location/backgroundLocationTask";

registerBackgroundLocationTask();
registerRootComponent(App);
