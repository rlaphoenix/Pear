import React from "react";
import ReactDOM from "react-dom/client";
import { ToastContainer } from "react-toastify";
import App from "./App";
import { AppStateProvider } from "@/state/AppState";
import { TimebaseProvider } from "@/state/TimebaseContext";
import { PreviewProvider } from "@/state/PreviewContext";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppStateProvider>
      <TimebaseProvider>
        <PreviewProvider>
          <App />
        </PreviewProvider>
      </TimebaseProvider>
    </AppStateProvider>
    <ToastContainer position="top-right" theme="dark" autoClose={5000} newestOnTop />
  </React.StrictMode>,
);
