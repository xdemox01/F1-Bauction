import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { GridApp } from "./app/GridApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GridApp />
  </StrictMode>,
);
