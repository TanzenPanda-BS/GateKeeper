import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import DecisionGate from "./pages/DecisionGate";
import Portfolio from "./pages/Portfolio";
import AARPage from "./pages/AARPage";
import TrustPage from "./pages/TrustPage";
import ExceptionRules from "./pages/ExceptionRules";
import SentimentPage from "./pages/SentimentPage";
import NotFound from "./pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/gate" component={DecisionGate} />
              <Route path="/portfolio" component={Portfolio} />
              <Route path="/reports" component={AARPage} />
              <Route path="/trust" component={TrustPage} />
              <Route path="/rules" component={ExceptionRules} />
              <Route path="/sentiment" component={SentimentPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
