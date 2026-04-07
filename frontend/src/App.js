import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { 
  House, 
  Upload, 
  Table, 
  ClockCounterClockwise,
  Database,
  List
} from "@phosphor-icons/react";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/Upload";
import ReviewWorkbench from "./pages/ReviewWorkbench";
import AuditLogs from "./pages/AuditLogs";
import Synonyms from "./pages/Synonyms";
import BatchHistory from "./pages/BatchHistory";
import "@/App.css";

const Sidebar = () => {
  const location = useLocation();
  
  const links = [
    { to: "/", icon: House, label: "Dashboard" },
    { to: "/upload", icon: Upload, label: "Upload" },
    { to: "/batches", icon: List, label: "Batches" },
    { to: "/review", icon: Table, label: "Review" },
    { to: "/synonyms", icon: Database, label: "Synonyms" },
    { to: "/audit", icon: ClockCounterClockwise, label: "Audit Log" },
  ];

  return (
    <aside 
      className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0"
      data-testid="sidebar"
    >
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Database size={20} weight="duotone" className="text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 text-lg leading-tight">MDM Tool</h1>
            <p className="text-xs text-slate-500">Mapping Engine</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to || 
            (to === "/review" && location.pathname.startsWith("/review"));
          
          return (
            <NavLink
              key={to}
              to={to}
              data-testid={`nav-${label.toLowerCase().replace(/\s/g, '-')}`}
              className={`sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
            >
              <Icon size={20} weight={isActive ? "duotone" : "regular"} />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-slate-200">
        <div className="p-3 bg-slate-50 rounded-lg">
          <p className="text-xs text-slate-500 font-medium">Phase 1</p>
          <p className="text-xs text-slate-400 mt-0.5">Rule-based matching</p>
        </div>
      </div>
    </aside>
  );
};

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/batches" element={<BatchHistory />} />
            <Route path="/review" element={<ReviewWorkbench />} />
            <Route path="/review/:batchId" element={<ReviewWorkbench />} />
            <Route path="/synonyms" element={<Synonyms />} />
            <Route path="/audit" element={<AuditLogs />} />
          </Routes>
        </main>
        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  );
}

export default App;
