
import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BarChart3, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Layout({ children, currentPageName }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
      <style>{`
        :root {
          --primary-navy: #1a1f2e;
          --accent-gold: #c9a96e;
          --success-green: #22543d;
          --warning-amber: #d69e2e;
          --danger-red: #c53030;
          --background-white: #ffffff;
          --text-primary: #1a202c;
          --text-secondary: #4a5568;
          --border-light: #e2e8f0;
        }
        
        .executive-gradient {
          background: linear-gradient(135deg, var(--primary-navy) 0%, #2d3748 100%);
        }
        
        .gold-accent {
          background: linear-gradient(135deg, var(--accent-gold) 0%, #b7975a 100%);
        }
        
        .glass-effect {
          backdrop-filter: blur(12px);
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
      `}</style>

      {/* Executive Header */}
      <header className="executive-gradient text-white shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Logo & Brand */}
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2 sm:gap-4">
              <div className="gold-accent p-1.5 sm:p-2 rounded-lg">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold">Jules Taylor Wines</h1>
                <p className="text-xs sm:text-sm text-slate-300">Executive Dashboard</p>
              </div>
            </Link>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 w-full sm:w-auto">
              <Link to={createPageUrl('UploadData')} className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto text-white border-white/20 bg-white/10 hover:bg-white/20 hover:text-white gap-2 text-sm">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload Data</span>
                  <span className="sm:hidden">Upload</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative">
        {children}
      </main>
    </div>
  );
}
