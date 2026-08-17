import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import { polyfillReadableStreamAsyncIterator } from "./lib/safariPolyfills";
import "./index.css";

polyfillReadableStreamAsyncIterator();
registerSW({ immediate: true });

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
