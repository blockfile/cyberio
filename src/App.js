import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { WalletProvider } from "./context/WalletConnect";
import BGMProvider from "./context/BGMProvider"; // << add this


import Dapp from "./components/pages/dapp";
import Inventory from "./components/pages/inventory";
import Play from "./components/pages/play";
import Market from "./components/pages/market";

import DimensionPassStore from "./components/pages/DimensionPassStore";
import EarnNpc from "./components/pages/EarnNpc";
function App() {
  return (
    <WalletProvider>
      <Router>
        <BGMProvider>
          <Routes>
            <Route path="/" element={<Dapp />} />
            <Route path="/Earn" element={<EarnNpc />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/play" element={<Play />} />
            <Route path="/store" element={<DimensionPassStore />} />
            <Route path="/market" element={<Market />} />
          </Routes>
        </BGMProvider>
      </Router>
    </WalletProvider>
  );
}

export default App;
