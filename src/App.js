import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { WalletProvider } from "./context/WalletConnect";
import BGMProvider from "./context/BGMProvider"; // << add this


import Inventory from "./components/pages/inventory";
import Play from "./components/pages/play";
import Market from "./components/pages/market";

import DimensionPassStore from "./components/pages/DimensionPassStore";
import EarnNpc from "./components/pages/EarnNpc";
import CharacterStage from "./components/characters/CharacterStage";
import World from "./components/world/World";
function App() {
  return (
    <WalletProvider>
      <Router>
        <BGMProvider>
          <Routes>
            {/* /world is now the home — all tools open as in-world HUD overlays */}
            <Route path="/" element={<World />} />
            <Route path="/Earn" element={<EarnNpc />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/play" element={<Play />} />
            <Route path="/store" element={<DimensionPassStore />} />
            <Route path="/market" element={<Market />} />
            <Route path="/characters" element={<CharacterStage />} />
            <Route path="/world" element={<World />} />
          </Routes>
        </BGMProvider>
      </Router>
    </WalletProvider>
  );
}

export default App;
