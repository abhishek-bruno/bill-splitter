import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BillSplitter from "./BillSplitter.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BillSplitter />
  </StrictMode>
);
