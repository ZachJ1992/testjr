import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./auth";
import App from "./App";
import "antd/dist/reset.css";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

