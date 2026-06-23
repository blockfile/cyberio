import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { Buffer } from "buffer";
window.Buffer = window.Buffer || Buffer;
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// dismiss the boot splash (in index.html) once the app has mounted — with a minimum
// display so it doesn't flash, and a hard cap so it can never linger
(function dismissBootLoader() {
  const MIN_MS = 650;
  const t0 = performance.now();
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    const el = document.getElementById("boot-loader");
    if (!el) return;
    el.classList.add("bl-hide");
    setTimeout(() => el.remove(), 600);
  };
  const finish = () => setTimeout(hide, Math.max(0, MIN_MS - (performance.now() - t0)));
  requestAnimationFrame(() => requestAnimationFrame(finish)); // after first paint
  setTimeout(hide, 6000); // safety cap
})();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
