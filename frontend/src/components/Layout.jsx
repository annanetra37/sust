import { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard, Leaf, Users2, Building2, BarChart3, FileText, Settings,
  History, Database, ChevronDown, ChevronRight, LogOut, Menu, X, Globe, Shield, Target,
  Sun, Moon
} from 'lucide-react';
import clsx from 'clsx';
import AssistantChat from './AssistantChat';

const NAV = [
  { label: 'Home', path: '/', icon: LayoutDashboard },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  {
    label: 'Environmental', icon: Leaf, color: 'text-esg-e',
    children: [
      { label: 'Climate & Emissions', path: '/dashboard/E/environmental-1', tag: 'GHG · Carbon' },
      { label: 'Pollution & Waste', path: '/coming-soon', badge: 'Soon' },
      { label: 'Water Resources', path: '/coming-soon', badge: 'Soon' },
      { label: 'Biodiversity', path: '/coming-soon', badge: 'Soon' },
      { label: 'Circular Economy', path: '/coming-soon', badge: 'Soon' },
    ],
  },
  {
    label: 'Social', icon: Users2, color: 'text-esg-s',
    children: [
      { label: 'Workforce & Employees', path: '/dashboard/S/social-1', tag: 'DEI · HR' },
      { label: 'Supply Chain Labor', path: '/coming-soon', badge: 'Soon' },
      { label: 'Community Impact', path: '/coming-soon', badge: 'Soon' },
      { label: 'Consumer Protection', path: '/coming-soon', badge: 'Soon' },
    ],
  },
  {
    label: 'Governance', icon: Shield, color: 'text-esg-g',
    children: [
      { label: 'Board & Leadership', path: '/coming-soon', badge: 'Enterprise' },
      { label: 'Ethics & Compliance', path: '/coming-soon', badge: 'Enterprise' },
    ],
  },
  { label: 'SBTi Targets', path: '/sbti-targets', icon: Target },
  { label: 'Reports', path: '/reports', icon: FileText },
  { label: 'Data Connections', path: '/connections', icon: Database },
  { label: 'History', path: '/history', icon: History },
  { label: 'Users', path: '/users', icon: Users2, adminOnly: true },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanded, setExpanded] = useState({});

  const toggle = (label) => setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={clsx(
        'bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-200',
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
      )}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Globe className="w-8 h-8 text-brand-600" />
            <div>
              <h1 className="font-bold text-lg text-brand-900 leading-tight">Triple I</h1>
              <p className="text-xs text-gray-500">ESG Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV.map((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return null;

            if (item.children) {
              const isExpanded = expanded[item.label];
              const isActive = item.children.some((c) => location.pathname === c.path);

              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggle(item.label)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <item.icon className={clsx('w-4 h-4', item.color)} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {item.children.map((child) => (
                        <Link
                          key={child.path + child.label}
                          to={child.path}
                          className={clsx(
                            'block px-3 py-1.5 rounded-lg text-sm transition-colors',
                            location.pathname === child.path ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                          )}
                        >
                          {child.label}
                          {child.badge && (
                            <span className="ml-2 badge bg-gray-100 text-gray-500">{child.badge}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === item.path ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-500 truncate">{user?.company?.name}</p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-600 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4 shrink-0">
          <button onClick={() => setSidebarOpen((v) => !v)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              {user?.company?.creditBalance ?? 0} credits
            </span>
            <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">{user?.role}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950">
          <Outlet />
        </main>
      </div>

      {/* AI Assistant — available on all pages */}
      <AssistantChat />
    </div>
  );
}
