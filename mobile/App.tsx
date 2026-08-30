import { useEffect } from "react";

import { NowPlayingScreen } from "./src/ui/screens/NowPlayingScreen";
import { ensureStudioFonts } from "./src/ui/theme";

export default function App() {
  useEffect(() => {
    ensureStudioFonts();
  }, []);
  return <NowPlayingScreen />;
}
