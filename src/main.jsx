import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import UpdatePrompt from "./components/UpdatePrompt.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>
);
