import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesProvider } from "@/hooks/use-preferences";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      storageKey="ngertiin-web-client-theme"
      enableSystem
      disableTransitionOnChange
    >
      <PreferencesProvider>
        <TooltipProvider delayDuration={300}>
          <App />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </PreferencesProvider>
    </ThemeProvider>
  </StrictMode>,
);
