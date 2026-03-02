import * as React from 'react';
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LayoutDashboard, Database, LogOut, Store, Menu, X } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const SidebarContext = React.createContext<{ isSidebarOpen: boolean; setIsSidebarOpen: (v: boolean) => void }>({ isSidebarOpen: false, setIsSidebarOpen: () => {} });

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    // Show sidebar by default on large screens for a typical admin layout
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024;
  }); // Closed on small screens by default

  // Keep sidebar state in sync with viewport changes so desktop shows persistent sidebar
  React.useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Data Entry', path: '/data-entry', icon: <Database size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {/* Sidebar - Fully Collapsible */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full'
        } bg-white shadow-2xl flex flex-col transition-all duration-500 ease-in-out fixed inset-y-0 left-0 z-50 lg:relative lg:translate-x-0 overflow-hidden`}
      >
        <div className="p-6 border-b flex items-center justify-between bg-white sticky top-0">
          <div className="flex items-center gap-3">
            <span className="font-black text-xl text-gray-900 tracking-tighter">
              Reports
            </span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg text-gray-400"
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 p-6 space-y-3 mt-4">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 ${
                location.pathname === item.path
                  ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-xl shadow-blue-100 font-bold scale-[1.02]'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="text-sm tracking-wide">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="p-6 border-t bg-gray-50/50">
          <button
            onClick={handleLogout}
            className="flex items-center gap-4 px-5 py-4 w-full rounded-2xl text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-300 font-bold"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="text-sm">Logout System</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] h-full overflow-hidden relative">
        <header className="bg-white/80 backdrop-blur-xl border-b border-gray-100 px-6 py-4 flex justify-between items-center z-40 sticky top-0">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-500 hover:text-blue-600 transition-all active:scale-95 group"
              title="Toggle Menu"
            >
              <Menu size={22} className={`transition-transform duration-500 ${isSidebarOpen ? 'rotate-90' : ''}`} />
            </button>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                {navItems.find(n => n.path === location.pathname)?.name || 'Page'}
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-black text-gray-900 leading-tight">Admin User</p>
              <div className="flex items-center justify-end gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Main Office</p>
              </div>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-orange-600 via-orange-500 to-orange-400 flex items-center justify-center text-white font-black shadow-xl shadow-blue-100 border-2 border-white ring-1 ring-gray-100 cursor-pointer hover:rotate-3 transition-all active:scale-95">
              AD
            </div>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-auto custom-scrollbar p-3 md:p-4 pt-1 md:pt-1">
          <div className="max-w-[100%] mx-auto">
            <SidebarContext.Provider value={{ isSidebarOpen, setIsSidebarOpen }}>
              {children}
            </SidebarContext.Provider>
          </div>
        </div>
      </main>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-500"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
};

export default Layout;
