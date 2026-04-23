import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Toaster } from "./components/ui/sonner";
import { 
  House, 
  Upload, 
  Table, 
  ClockCounterClockwise,
  Database,
  List,
  BookOpen,
  FolderOpen,
  Folder,
  Lightning,
  Flask,
  Moon,
  Sun,
  Buildings
} from "@phosphor-icons/react";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/Upload";
import ReviewWorkbench from "./pages/ReviewWorkbench";
import AuditLogs from "./pages/AuditLogs";
import Synonyms from "./pages/Synonyms";
import Standards from "./pages/Standards";
import BatchHistory from "./pages/BatchHistory";
import IngestionWizard from "./pages/IngestionWizard";
import SessionHistory from "./pages/SessionHistory";
import KeywordRules from "./pages/KeywordRules";
import Sandbox from "./pages/Sandbox";
import MdmEnterprise from "./pages/MdmEnterprise";
import "@/App.css";

const Sidebar = ({ darkMode, toggleDarkMode }) => {
  const location = useLocation();
  
  const links = [
    { to: "/", icon: House, label: "Dashboard" },
    { to: "/ingest", icon: FolderOpen, label: "New Ingestion" },
    { to: "/sessions", icon: Folder, label: "Sessions" },
    { to: "/upload", icon: Upload, label: "Quick Upload" },
    { to: "/batches", icon: List, label: "Batches" },
    { to: "/review", icon: Table, label: "Review" },
    { to: "/standards", icon: BookOpen, label: "Standards" },
    { to: "/synonyms", icon: Database, label: "Synonyms" },
    { to: "/keyword-rules", icon: Lightning, label: "Keyword Rules" },
    { to: "/sandbox", icon: Flask, label: "Test Sandbox" },
    { to: "/mdm-enterprise", icon: Buildings, label: "MDM Enterprise" },
    { to: "/audit", icon: ClockCounterClockwise, label: "Audit Log" },
  ];

  return (
    <aside 
      className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col h-screen sticky top-0"
      data-testid="sidebar"
    >
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Database size={20} weight="duotone" className="text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 dark:text-white text-lg leading-tight">MDM Tool</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Mapping Engine</p>
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
      
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
        <button
          onClick={toggleDarkMode}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
          data-testid="dark-mode-toggle"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Phase 1</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Rule-based matching</p>
        </div>
      </div>
    </aside>
  );
};

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('mdm-dark-mode');
    return saved === 'true';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('mdm-dark-mode', darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ingest" element={<IngestionWizard />} />
            <Route path="/sessions" element={<SessionHistory />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/batches" element={<BatchHistory />} />
            <Route path="/review" element={<ReviewWorkbench />} />
            <Route path="/review/:batchId" element={<ReviewWorkbench />} />
            <Route path="/standards" element={<Standards />} />
            <Route path="/synonyms" element={<Synonyms />} />
            <Route path="/keyword-rules" element={<KeywordRules />} />
            <Route path="/sandbox" element={<Sandbox />} />
            <Route path="/mdm-enterprise" element={<MdmEnterprise />} />
            <Route path="/audit" element={<AuditLogs />} />
          </Routes>
        </main>
        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  );
}

export default App;
