
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BarChart3, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Layout({ children, currentPageName }) {
  const [daysSinceUpdate, setDaysSinceUpdate] = useState("");
  const location = useLocation();

  const updateDaysSinceUpdate = () => {
    const timestampStr = localStorage.getItem('vc_last_upload_timestamp');
    if (!timestampStr) {
      setDaysSinceUpdate("No data uploaded yet");
      return;
    }

    try {
      const uploadDate = new Date(timestampStr);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - uploadDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        setDaysSinceUpdate("Today");
      } else if (diffDays === 1) {
        setDaysSinceUpdate("Yesterday");
      } else {
        setDaysSinceUpdate(`${diffDays} days ago`);
      }
    } catch (e) {
      setDaysSinceUpdate("Invalid date");
    }
  };

  useEffect(() => {
    // Update immediately
    updateDaysSinceUpdate();

    // Update when data is uploaded (listen to custom event)
    const handleDataUploaded = () => {
      updateDaysSinceUpdate();
    };
    
    window.addEventListener('vc:data:uploaded', handleDataUploaded);

    // Update periodically (every minute) to refresh the count
    const interval = setInterval(updateDaysSinceUpdate, 60000);

    return () => {
      window.removeEventListener('vc:data:uploaded', handleDataUploaded);
      clearInterval(interval);
    };
  }, []);

  // Update when route changes (e.g., navigating from UploadData to Dashboard)
  useEffect(() => {
    updateDaysSinceUpdate();
  }, [location.pathname]);
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

            {/* Last Updated & Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 w-full sm:w-auto">
              <Link to={createPageUrl('UploadData')} className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto text-white border-white/20 bg-white/10 hover:bg-white/20 hover:text-white gap-2 text-sm">
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload Data</span>
                  <span className="sm:hidden">Upload</span>
                </Button>
              </Link>
              <div className="text-left sm:text-right">
                <p className="text-xs text-slate-300">Last updated</p>
                <p className="text-xs sm:text-sm font-medium">{daysSinceUpdate || "Loading..."}</p>
              </div>
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
