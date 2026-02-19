import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DataUploadCard from '../components/upload/DataUploadCard';
import { TrendingUp, Package, FileText, Users, ChevronLeft, RefreshCw, Lock, Unlock, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { 
  parseCSV, 
  parseCSVWithPapa, 
  parseExportsCSV, 
  parseExcel, 
  normalizeSalesData,
  normalizeExportsData,
  normalizeWarehouseStockData,
  normalizeDistributorStockOnHandData,
  getMonthsIndex,
  saveMonthsIndex,
  getMonthDataKey,
  getMonthSheetKey,
  getMonthMetaKey,
  isMonthComplete,
  isMonthLocked,
  clearMonthTypeData,
  clearMonthAllData,
  clearAllIdbData,
  MONTHLY_DATA_TYPES,
  getMonthLabel,
  getCurrentMonthKey,
} from '@/lib/utils';
import { idbSet } from '@/lib/storage';

const DATA_TYPE_COLORS = {
  exports: '#3b82f6',
  warehouse_stock: '#22c55e',
  sales: '#f59e0b',
  stock_on_hand_distributors: '#8b5cf6',
};

const DATA_TYPE_LABELS = {
  exports: 'Exports',
  warehouse_stock: 'Warehouse Stock',
  sales: 'Depletion Summary',
  stock_on_hand_distributors: 'Distributor SOH',
};

export default function UploadDataPage() {
  const [workingMonth, setWorkingMonth] = useState(() => getCurrentMonthKey());
  const [monthsIndex, setMonthsIndex] = useState({});
  const [indexLoaded, setIndexLoaded] = useState(false);

  const [statuses, setStatuses] = useState({
    sales: { status: 'idle', message: '', progress: 0 },
    exports: { status: 'idle', message: '', progress: 0 },
    stock_on_hand_distributors: { status: 'idle', message: '', progress: 0 },
    warehouse_stock: { status: 'idle', message: '', progress: 0 }
  });
  const [globalError, setGlobalError] = useState(null);
  const [globalSuccess, setGlobalSuccess] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMonthsIndex().then(idx => {
      if (!cancelled) { setMonthsIndex(idx); setIndexLoaded(true); }
    });
    return () => { cancelled = true; };
  }, []);

  const monthLocked = isMonthLocked(monthsIndex, workingMonth);
  const monthComplete = isMonthComplete(monthsIndex, workingMonth);

  // Generate month tabs (current month + 7 forward months)
  const monthTabs = useMemo(() => {
    const tabs = [];
    const now = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      tabs.push({ key, label: getMonthLabel(key) });
    }
    return tabs;
  }, []);

  // Dashboard data summary
  const dashboardMonths = useMemo(() => {
    return Object.keys(monthsIndex)
      .filter(k => isMonthComplete(monthsIndex, k))
      .sort();
  }, [monthsIndex]);

  const updateStatus = (key, status, message, progress = 0) => {
    setStatuses(prev => ({
      ...prev,
      [key]: { status, message, progress }
    }));
  };

  const resetStatus = (key) => {
    updateStatus(key, 'idle', '', 0);
    setGlobalError(null);
  };

  const updateMonthIndex = useCallback(async (type, recordCount) => {
    setMonthsIndex(prev => {
      const next = { ...prev };
      if (!next[workingMonth]) next[workingMonth] = {};
      next[workingMonth][type] = {
        uploaded: true,
        timestamp: new Date().toISOString(),
        recordCount,
      };

      if (MONTHLY_DATA_TYPES.every(t => next[workingMonth][t]?.uploaded)) {
        next[workingMonth].locked = true;
      }

      saveMonthsIndex(next);
      return next;
    });
  }, [workingMonth]);

  const handleFileUpload = async (file, type) => {
    if (!file) return;
    if (monthLocked) {
      setGlobalError('This month is locked. Use "Reset Month" to unlock before uploading.');
      return;
    }

    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
    
    const excelTypes = ['warehouse_stock', 'exports', 'stock_on_hand_distributors', 'sales'];
    
    if (excelTypes.includes(type)) {
      if (!isExcel && !isCsv) {
        updateStatus(type, 'error', 'Invalid file type. Please upload an Excel (.xlsx) or CSV file.');
        return;
      }
    } else {
      if (!isCsv) {
        updateStatus(type, 'error', 'Invalid file type. Please upload a CSV.');
        return;
      }
    }

    setGlobalError(null);
    updateStatus(type, 'processing', 'Uploading file...', 10);

    try {
      let records = [];
      let totalRecords = 0;
      let sheetCount = 0;
      
      if (isExcel && excelTypes.includes(type)) {
        updateStatus(type, 'processing', 'Reading Excel file...', 30);
        const arrayBuffer = await file.arrayBuffer();
        updateStatus(type, 'processing', 'Parsing Excel sheets...', 50);
        const sheetsData = parseExcel(arrayBuffer);
        
        if (!sheetsData || Object.keys(sheetsData).length === 0) {
          throw new Error('Excel file contains no sheets or data.');
        }
        
        sheetCount = Object.keys(sheetsData).length;
        const allNormalizedRecords = [];
        const sheetMetadata = { sheetNames: [], sheetCounts: {} };
        
        updateStatus(type, 'processing', 'Normalizing sheet data...', 60);
        
        const normalizeMap = {
          sales: normalizeSalesData,
          exports: normalizeExportsData,
          warehouse_stock: normalizeWarehouseStockData,
          stock_on_hand_distributors: normalizeDistributorStockOnHandData,
        };

        const normalizeFn = normalizeMap[type];
        
        for (const sheetName of Object.keys(sheetsData)) {
          const sheetRecords = sheetsData[sheetName];
          if (sheetRecords.length === 0) continue;
          
          const normalizedRecords = normalizeFn(sheetRecords, sheetName);
          
          await idbSet(getMonthSheetKey(workingMonth, type, sheetName), normalizedRecords);
          
          sheetMetadata.sheetNames.push(sheetName);
          sheetMetadata.sheetCounts[sheetName] = normalizedRecords.length;
          allNormalizedRecords.push(...normalizedRecords);
        }

        await idbSet(getMonthMetaKey(workingMonth, type), sheetMetadata);
        await idbSet(getMonthDataKey(workingMonth, type), allNormalizedRecords);

        records = allNormalizedRecords;
        totalRecords = allNormalizedRecords.length;
        
        updateStatus(type, 'processing', `Processed ${sheetCount} sheet(s)...`, 70);
      } else {
        // CSV handling
        updateStatus(type, 'processing', 'Reading file...', 30);
        const text = await file.text();
        updateStatus(type, 'processing', 'Parsing CSV...', 50);

        if (type === "sales") {
          records = parseCSVWithPapa(text).totalsByYear;
        } else if (type === "exports"){
          records = parseExportsCSV(text);
        } else {
          records = parseCSV(text);
        }
        
        totalRecords = Array.isArray(records) ? records.length : 0;
      }

      if (!records || (Array.isArray(records) && records.length === 0)) {
        throw new Error(`Parsed ${isExcel ? 'Excel' : 'CSV'} contains no records.`);
      }

      updateStatus(type, 'processing', `Saving ${totalRecords} records...`, 80);

      // For CSV files, save to monthly key
      if (!isExcel) {
        await idbSet(getMonthDataKey(workingMonth, type), records);
      }

      // Update month index
      updateMonthIndex(type, totalRecords);

      // Notify dashboard
      try {
        window.dispatchEvent(new CustomEvent('vc:data:uploaded', { 
          detail: { type, month: workingMonth, count: totalRecords }
        }));
      } catch (e) {}

      const successMessage = isExcel
        ? `${totalRecords} records from ${sheetCount} sheet(s) imported for ${getMonthLabel(workingMonth)}.`
        : `${totalRecords} records imported for ${getMonthLabel(workingMonth)}.`;
      
      updateStatus(type, 'success', successMessage, 100);
      setTimeout(() => updateStatus(type, 'idle', ''), 3000);

    } catch (error) {
      await clearMonthTypeData(workingMonth, type);
      setMonthsIndex(prev => {
        const next = { ...prev };
        if (next[workingMonth]?.[type]) {
          delete next[workingMonth][type];
          next[workingMonth].locked = false;
          saveMonthsIndex(next);
        }
        return next;
      });
      updateStatus(type, 'error', error.message || 'An unknown error occurred.');
      setGlobalError(`Failed to process ${type} data. Please check the file format and try again.`);
    }
  };

  const handleResetMonth = async () => {
    await clearMonthAllData(workingMonth);
    setMonthsIndex(prev => {
      const next = { ...prev };
      delete next[workingMonth];
      saveMonthsIndex(next);
      return next;
    });
    setStatuses({
      sales: { status: 'idle', message: '', progress: 0 },
      exports: { status: 'idle', message: '', progress: 0 },
      stock_on_hand_distributors: { status: 'idle', message: '', progress: 0 },
      warehouse_stock: { status: 'idle', message: '', progress: 0 }
    });
    setGlobalError(null);
    setGlobalSuccess(`Data for ${getMonthLabel(workingMonth)} has been cleared and unlocked.`);
  };

  const handleRefreshAll = async () => {
    await clearAllIdbData();
    setMonthsIndex({});
    await saveMonthsIndex({});
    setStatuses({
      sales: { status: 'idle', message: '', progress: 0 },
      exports: { status: 'idle', message: '', progress: 0 },
      stock_on_hand_distributors: { status: 'idle', message: '', progress: 0 },
      warehouse_stock: { status: 'idle', message: '', progress: 0 }
    });
    setGlobalError(null);
    setGlobalSuccess('All data cleared. Ready for new data uploads.');

    try {
      window.dispatchEvent(new CustomEvent('vc:data:uploaded', { 
        detail: { type: 'refresh', cleared: true }
      }));
    } catch (e) {}
  };

  const getUploadStatus = (type) => {
    return monthsIndex[workingMonth]?.[type]?.uploaded ? 'uploaded' : 'ready';
  };

  const getLastUpdatedText = (type) => {
    const ts = monthsIndex[workingMonth]?.[type]?.timestamp;
    if (!ts) return null;
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      return `${diffDays} days ago`;
    } catch { return null; }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-br from-slate-50 to-white min-h-[calc(100vh-80px)]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-6 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button asChild variant="outline" size="icon" className="shrink-0">
              <Link to={createPageUrl('Dashboard')}>
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Import Data</h1>
              <p className="text-xs sm:text-sm text-slate-500">Upload monthly snapshots (locked point-in-time datasets)</p>
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 flex-1 sm:flex-none text-sm">
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Refresh & Clear All</span>
                  <span className="sm:hidden">Clear All</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all uploaded data across all months. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRefreshAll}>Continue</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 flex-1 sm:flex-none text-sm">
                  <CalendarDays className="w-4 h-4" />
                  Reset Month
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset {getMonthLabel(workingMonth)}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear all data for {getMonthLabel(workingMonth)} and unlock the month for re-upload.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetMonth}>Reset Month</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Working Month Header */}
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <span className="text-sm font-semibold text-slate-800">Working month: {getMonthLabel(workingMonth)}</span>
            {monthLocked && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Lock className="w-3 h-3" /> Locked
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500">
            Dashboard is currently showing: {dashboardMonths.length > 0 ? dashboardMonths.map(k => getMonthLabel(k)).join(', ') : '—'}
          </div>
        </div>

        {/* Month Tabs */}
        <div className="mb-4 overflow-x-auto">
          <div className="flex gap-2 pb-2 min-w-max">
            {monthTabs.map(tab => {
              const info = monthsIndex[tab.key];
              const complete = isMonthComplete(monthsIndex, tab.key);
              const locked = isMonthLocked(monthsIndex, tab.key);
              const hasAnyData = info && MONTHLY_DATA_TYPES.some(t => info[t]?.uploaded);
              const isActive = tab.key === workingMonth;
              
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setWorkingMonth(tab.key);
                    setStatuses({
                      sales: { status: 'idle', message: '', progress: 0 },
                      exports: { status: 'idle', message: '', progress: 0 },
                      stock_on_hand_distributors: { status: 'idle', message: '', progress: 0 },
                      warehouse_stock: { status: 'idle', message: '', progress: 0 }
                    });
                    setGlobalError(null);
                    setGlobalSuccess(null);
                  }}
                  className={`relative px-4 py-2.5 rounded-lg text-sm font-medium transition-all border min-w-[140px] ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                      : complete
                      ? 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
                      : hasAnyData
                      ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 justify-center">
                    {locked && <Lock className="w-3 h-3" />}
                    <span>{tab.label}</span>
                  </div>
                  <div className="text-[10px] mt-0.5 opacity-75">
                    {complete ? 'Complete' : hasAnyData ? 'Partial' : 'Empty'}
                  </div>
                  
                  {/* Status dots */}
                  {hasAnyData && (
                    <div className="flex gap-0.5 justify-center mt-1">
                      {MONTHLY_DATA_TYPES.map(t => (
                        <div
                          key={t}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: info?.[t]?.uploaded ? DATA_TYPE_COLORS[t] : '#e2e8f0',
                          }}
                          title={`${DATA_TYPE_LABELS[t]}: ${info?.[t]?.uploaded ? 'Uploaded' : 'Missing'}`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Legend */}
        <div className="mb-6 flex flex-wrap gap-3 text-xs">
          {MONTHLY_DATA_TYPES.map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DATA_TYPE_COLORS[t] }} />
              <span className="text-slate-600">{DATA_TYPE_LABELS[t]}</span>
            </div>
          ))}
        </div>

        {/* Alerts */}
        {globalError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload Error</AlertTitle>
            <AlertDescription>{globalError}</AlertDescription>
          </Alert>
        )}

        {globalSuccess && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Success</AlertTitle>
            <AlertDescription className="text-green-700">{globalSuccess}</AlertDescription>
          </Alert>
        )}

        {monthLocked && (
          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <Lock className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">Month Locked</AlertTitle>
            <AlertDescription className="text-blue-700">
              All four data files have been uploaded for {getMonthLabel(workingMonth)}. 
              This month is now locked to prevent accidental overwrites.
              Use "Reset Month" to unlock and re-upload if needed.
            </AlertDescription>
          </Alert>
        )}

        {/* Upload Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <DataUploadCard
            title="All Export Running Record"
            description="Complete export transaction history"
            subtitle={getMonthLabel(workingMonth)}
            Icon={FileText}
            onFileUpload={(file) => handleFileUpload(file, 'exports')}
            processingStatus={statuses.exports}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('exports')}
            onReset={() => resetStatus('exports')}
            disabled={monthLocked}
            uploadedStatus={getUploadStatus('exports')}
          />

          <DataUploadCard
            title="Stock on Hand Live Report"
            description="Current Warehouse Stock on Hand"
            subtitle={getMonthLabel(workingMonth)}
            Icon={Package}
            onFileUpload={(file) => handleFileUpload(file, 'warehouse_stock')}
            processingStatus={statuses.warehouse_stock}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('warehouse_stock')}
            onReset={() => resetStatus('warehouse_stock')}
            disabled={monthLocked}
            uploadedStatus={getUploadStatus('warehouse_stock')}
          />

          <DataUploadCard
            title="Depletion Summary"
            description="Stock levels at distributor locations"
            subtitle={getMonthLabel(workingMonth)}
            Icon={Users}
            onFileUpload={(file) => handleFileUpload(file, 'sales')}
            processingStatus={statuses.sales}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('sales')}
            onReset={() => resetStatus('sales')}
            disabled={monthLocked}
            uploadedStatus={getUploadStatus('sales')}
          />

          <DataUploadCard
            title="Distributors Stock on Hand"
            description="Current Distributors Stock on Hand (Book1.xlsx)"
            subtitle={getMonthLabel(workingMonth)}
            Icon={Users}
            onFileUpload={(file) => handleFileUpload(file, 'stock_on_hand_distributors')}
            processingStatus={statuses.stock_on_hand_distributors}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('stock_on_hand_distributors')}
            onReset={() => resetStatus('stock_on_hand_distributors')}
            disabled={monthLocked}
            uploadedStatus={getUploadStatus('stock_on_hand_distributors')}
          />
        </div>

        {/* Upload Instructions */}
        <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            Upload Instructions (Monthly Snapshots)
          </h3>
          <ul className="list-disc list-inside text-xs sm:text-sm space-y-2">
            <li><strong>Monthly Workflow:</strong> Select a month tab, then upload all four data files for that month.</li>
            <li><strong>Auto-Lock:</strong> Once all four files are uploaded for a month, the month automatically locks to prevent accidental overwrites.</li>
            <li><strong>Reset:</strong> Use "Reset Month" to unlock a month and re-upload files. Use "Refresh & Clear All" to start over.</li>
            <li><strong>All Export Running Record:</strong> Historical export transactions and shipments (Excel .xlsx or CSV)</li>
            <li><strong>Stock on Hand Live Report:</strong> Current warehouse inventory from CIN7 (Excel .xlsx or CSV)</li>
            <li><strong>Depletion Summary:</strong> Sales/depletion data per market (Excel .xlsx with sheets per market)</li>
            <li><strong>Distributors Stock on Hand:</strong> Inventory levels at each distributor location (Excel .xlsx file with multiple sheets)</li>
            <li>Large files may take a few moments to process - please wait for the checkmark</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
