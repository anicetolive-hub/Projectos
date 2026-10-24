import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import "./App.css";
import { ChatPanel } from "./assistant/ChatPanel";
import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/context";
import { LoginPage } from "./auth/LoginPage";
import { Alerts } from "./pages/Alerts";
import { Kpis } from "./pages/Kpis";
import { Objectives } from "./pages/Objectives";
import { PerformanceDashboard } from "./pages/PerformanceDashboard";
import { ProjectsTasks } from "./pages/ProjectsTasks";
import { Team } from "./pages/Team";
import { PerformanceToolbar } from "./performance/Toolbar";

// Só existe no build de demonstração (comparação literal para o build normal o eliminar)
const DemoBanner =
  import.meta.env.VITE_DEMO === "true" ? lazy(() => import("./demo/DemoBanner").then((m) => ({ default: m.DemoBanner }))) : null;

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

/** Mostra o ecrã de login até existir uma sessão válida. */
function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) return <p className="hint" style={{ padding: "2rem" }}>Carregando...</p>;
  if (!user) return <LoginPage />;
  return <Shell />;
}

function Shell() {
  return (
    <div className="app-shell">
      {DemoBanner && (
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
      )}
      <header className="app-header">
        <h1>Tarefas e Projectos</h1>
        <nav>
          <div className="nav-group">
            <NavLink to="/" end>
              Visão geral
            </NavLink>
            <NavLink to="/objetivos">Objetivos</NavLink>
            <NavLink to="/kpis">KPIs</NavLink>
            <NavLink to="/projetos">Projetos e tarefas</NavLink>
            <NavLink to="/equipa">Equipa</NavLink>
            <NavLink to="/alertas">Alertas</NavLink>
          </div>
        </nav>
        <PerformanceToolbar />
      </header>
      <main className="app-content">
        <Routes>
          <Route path="/" element={<PerformanceDashboard />} />
          <Route path="/objetivos" element={<Objectives />} />
          <Route path="/kpis" element={<Kpis />} />
          <Route path="/projetos" element={<ProjectsTasks />} />
          <Route path="/equipa" element={<Team />} />
          <Route path="/alertas" element={<Alerts />} />
        </Routes>
      </main>
      <ChatPanel />
    </div>
  );
}

export default App;
