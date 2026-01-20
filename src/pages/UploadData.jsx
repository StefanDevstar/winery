import React, { useState, useEffect } from 'react';
import DataUploadCard from '../components/upload/DataUploadCard';
import { TrendingUp, Package, FileText, Users, ChevronLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

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
} from '@/lib/utils';

export default function UploadDataPage() {
  const [statuses, setStatuses] = useState({
    sales: { status: 'idle', message: '', progress: 0 },
    exports: { status: 'idle', message: '', progress: 0 },
    stock_on_hand_distributors: { status: 'idle', message: '', progress: 0 },
    warehouse_stock: { status: 'idle', message: '', progress: 0 }
  });
  const [globalError, setGlobalError] = useState(null);
  const [globalSuccess, setGlobalSuccess] = useState(null);
  const [lastUpdatedTimes, setLastUpdatedTimes] = useState({});

  // Helper function to format last updated time
  const getLastUpdatedText = (type) => {
    // First check state, then localStorage
    if (lastUpdatedTimes[type]) {
      return lastUpdatedTimes[type];
    }
    
    const timestampStr = localStorage.getItem(`vc_last_upload_timestamp_${type}`);
    if (!timestampStr) {
      return null;
    }

    try {
      const uploadDate = new Date(timestampStr);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - uploadDate.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      let text = "";
      if (diffDays === 0) {
        text = "Today";
      } else if (diffDays === 1) {
        text = "Yesterday";
      } else {
        text = `${diffDays} days ago`;
      }
      
      // Update state
      setLastUpdatedTimes(prev => ({ ...prev, [type]: text }));
      return text;
    } catch (e) {
      return null;
    }
  };

  // Load last updated times on mount
  useEffect(() => {
    const types = ['sales', 'exports', 'warehouse_stock', 'stock_on_hand_distributors'];
    const times = {};
    types.forEach(type => {
      const timestampStr = localStorage.getItem(`vc_last_upload_timestamp_${type}`);
      if (timestampStr) {
        try {
          const uploadDate = new Date(timestampStr);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - uploadDate.getTime());
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays === 0) {
            times[type] = "Today";
          } else if (diffDays === 1) {
            times[type] = "Yesterday";
          } else {
            times[type] = `${diffDays} days ago`;
          }
        } catch (e) {
          // ignore
        }
      }
    });
    setLastUpdatedTimes(times);
  }, []);

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

  // Clear all localStorage keys for a specific data type
  const clearDataTypeFromStorage = (type) => {
    try {
      // Clear metadata first to get sheet names
      const metadataKey = {
        sales: 'vc_sales_metadata',
        exports: 'vc_exports_metadata',
        warehouse_stock: 'vc_warehouse_stock_metadata',
        stock_on_hand_distributors: 'vc_distributor_stock_on_hand_metadata'
      }[type];

      if (metadataKey) {
        const metadataRaw = localStorage.getItem(metadataKey);
        if (metadataRaw) {
          try {
            const metadata = JSON.parse(metadataRaw);
            // Clear individual sheet data
            if (metadata.sheetNames && Array.isArray(metadata.sheetNames)) {
              metadata.sheetNames.forEach(sheetName => {
                const sheetKey = {
                  sales: `vc_sales_data_${sheetName}`,
                  exports: `vc_exports_data_${sheetName}`,
                  warehouse_stock: `vc_warehouse_stock_data_${sheetName}`,
                  stock_on_hand_distributors: `vc_distributor_stock_on_hand_data_${sheetName}`
                }[type];
                if (sheetKey) {
                  localStorage.removeItem(sheetKey);
                }
              });
            }
          } catch (e) {
            // Error parsing metadata, continue anyway
          }
        }
        // Clear metadata
        localStorage.removeItem(metadataKey);
      }

      // Clear combined data
      const combinedKey = {
        sales: 'vc_sales_data',
        exports: 'vc_exports_data',
        warehouse_stock: 'vc_warehouse_stock_data',
        stock_on_hand_distributors: 'vc_distributor_stock_on_hand_data'
      }[type];
      if (combinedKey) {
        localStorage.removeItem(combinedKey);
      }

      // Clear upload timestamp
      const timestampKey = `vc_last_upload_timestamp_${type}`;
      localStorage.removeItem(timestampKey);
    } catch (e) {
      // Error clearing storage, continue anyway
    }
  };

  const handleFileUpload = async (file, type) => {
    if (!file) return;

    // Check file type - Excel for exports, stock_on_hand_distributors, sales, warehouse_stock; CSV also accepted for some
    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
    
    // Accept CSV files for: exports, stock_on_hand_distributors, sales, warehouse_stock
    const excelTypes = ['warehouse_stock', 'exports', 'stock_on_hand_distributors', 'sales'];
    
    if (excelTypes.includes(type)) {
      if (!isExcel && !isCsv) {
        clearDataTypeFromStorage(type);
        updateStatus(type, 'error', 'Invalid file type. Please upload an Excel (.xlsx) or CSV file.');
        return;
      }
    } else {
      if (!isCsv) {
        clearDataTypeFromStorage(type);
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
      
      if (isExcel && (type === 'warehouse_stock' || type === 'exports' || type === 'stock_on_hand_distributors' || type === 'sales')) {
        // Handle Excel file with multiple sheets
        updateStatus(type, 'processing', 'Reading Excel file...', 30);
        const arrayBuffer = await file.arrayBuffer();
        updateStatus(type, 'processing', 'Parsing Excel sheets...', 50);
        const sheetsData = parseExcel(arrayBuffer);
        
        if (!sheetsData || Object.keys(sheetsData).length === 0) {
          throw new Error('Excel file contains no sheets or data.');
        }
        
        sheetCount = Object.keys(sheetsData).length;
        
        // Normalize and save each sheet separately
        const allNormalizedRecords = [];
        const sheetMetadata = {
          sheetNames: [],
          sheetCounts: {}
        };
        
        updateStatus(type, 'processing', 'Normalizing sheet data...', 60);
        
        if (type === 'sales') {
          // Handle sales/depletion summary data (uses normalizeDistributorStockData)
          Object.keys(sheetsData).forEach((sheetName) => {
            const sheetRecords = sheetsData[sheetName];
            if (sheetRecords.length === 0) return;
            
            const normalizedRecords = normalizeSalesData(sheetRecords, sheetName);
            const sheetStorageKey = `vc_sales_data_${sheetName}`;
            localStorage.setItem(sheetStorageKey, JSON.stringify(normalizedRecords));
            
            sheetMetadata.sheetNames.push(sheetName);
            sheetMetadata.sheetCounts[sheetName] = normalizedRecords.length;
            allNormalizedRecords.push(...normalizedRecords);
          });
          localStorage.setItem('vc_sales_metadata', JSON.stringify(sheetMetadata));
          // Try to save combined data, but catch quota errors
          try {
            const combinedDataString = JSON.stringify(allNormalizedRecords);
            // Remove old combined data first to free space
            localStorage.removeItem('vc_sales_data');
            // localStorage.setItem('vc_sales_data', combinedDataString);
          } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
              // Combined sales data too large for localStorage. Will aggregate from individual sheets.
              localStorage.removeItem('vc_sales_data');
            } else {
              throw e;
            }
          }
          records = allNormalizedRecords;
          totalRecords = allNormalizedRecords.length;
        } else if (type === 'exports') {
          // Handle exports
          Object.keys(sheetsData).forEach((sheetName) => {
            const sheetRecords = sheetsData[sheetName];
            if (sheetRecords.length === 0) return;
            
            const normalizedRecords = normalizeExportsData(sheetRecords, sheetName);
            const sheetStorageKey = `vc_exports_data_${sheetName}`;
            localStorage.setItem(sheetStorageKey, JSON.stringify(normalizedRecords));
            
            sheetMetadata.sheetNames.push(sheetName);
            sheetMetadata.sheetCounts[sheetName] = normalizedRecords.length;
            allNormalizedRecords.push(...normalizedRecords);
          });
          localStorage.setItem('vc_exports_metadata', JSON.stringify(sheetMetadata));
          // Try to save combined data, but catch quota errors
          try {
            const combinedDataString = JSON.stringify(allNormalizedRecords);
            // Remove old combined data first to free space
            localStorage.removeItem('vc_exports_data');
            localStorage.setItem('vc_exports_data', combinedDataString);
          } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
              // Combined exports data too large for localStorage. Will aggregate from individual sheets.
              localStorage.removeItem('vc_exports_data');
            } else {
              throw e;
            }
          }
          records = allNormalizedRecords;
          totalRecords = allNormalizedRecords.length;
        } else if (type === 'warehouse_stock') {
          // Handle warehouse stock on hand (winery stock)
          Object.keys(sheetsData).forEach((sheetName) => {
            const sheetRecords = sheetsData[sheetName];
            if (sheetRecords.length === 0) return;
            
            const normalizedRecords = normalizeWarehouseStockData(sheetRecords, sheetName);
            const sheetStorageKey = `vc_warehouse_stock_data_${sheetName}`;
            localStorage.setItem(sheetStorageKey, JSON.stringify(normalizedRecords));
            
            sheetMetadata.sheetNames.push(sheetName);
            sheetMetadata.sheetCounts[sheetName] = normalizedRecords.length;
            allNormalizedRecords.push(...normalizedRecords);
          });
          localStorage.setItem('vc_warehouse_stock_metadata', JSON.stringify(sheetMetadata));
          // Try to save combined data, but catch quota errors
          try {
            const combinedDataString = JSON.stringify(allNormalizedRecords);
            // Remove old combined data first to free space
            localStorage.removeItem('vc_warehouse_stock_data');
            localStorage.setItem('vc_warehouse_stock_data', combinedDataString);
          } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
              // Combined warehouse stock data too large for localStorage. Will aggregate from individual sheets.
              localStorage.removeItem('vc_warehouse_stock_data');
            } else {
              throw e;
            }
          }
          records = allNormalizedRecords;
          totalRecords = allNormalizedRecords.length;
        } else if (type === 'stock_on_hand_distributors') {
          // Handle distributor stock on hand
          Object.keys(sheetsData).forEach((sheetName) => {
            const sheetRecords = sheetsData[sheetName];
            if (sheetRecords.length === 0) return;
            
            const normalizedRecords = normalizeDistributorStockOnHandData(sheetRecords, sheetName);
            const sheetStorageKey = `vc_distributor_stock_on_hand_data_${sheetName}`;
            localStorage.setItem(sheetStorageKey, JSON.stringify(normalizedRecords));
            
            sheetMetadata.sheetNames.push(sheetName);
            sheetMetadata.sheetCounts[sheetName] = normalizedRecords.length;
            allNormalizedRecords.push(...normalizedRecords);
          });
          localStorage.setItem('vc_distributor_stock_on_hand_metadata', JSON.stringify(sheetMetadata));
          // Try to save combined data, but catch quota errors
          // Note: Combined data may be too large for localStorage, so we'll aggregate on-demand in Dashboard
          try {
            const combinedDataString = JSON.stringify(allNormalizedRecords);
            const dataSizeMB = (combinedDataString.length * 2) / (1024 * 1024); // Approximate size in MB (UTF-16 encoding)
            
            // Check localStorage usage before saving
            let totalSize = 0;
            for (let key in localStorage) {
              if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length + key.length;
              }
            }
            const totalSizeMB = (totalSize * 2) / (1024 * 1024);
            
            // Try to free up space by removing old combined data first
            localStorage.removeItem('vc_distributor_stock_on_hand_data');
            
            localStorage.setItem('vc_distributor_stock_on_hand_data', combinedDataString);
          } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
              // Combined distributor stock on hand data too large for localStorage. Will aggregate from individual sheets.
              // Remove the combined key if it exists to free space
              localStorage.removeItem('vc_distributor_stock_on_hand_data');
              // Show user-friendly message
              updateStatus(type, 'processing', `Saved ${totalRecords} records across ${sheetCount} sheets. Combined data too large - will aggregate on demand.`, 90);
            } else {
              throw e;
            }
          }
          records = allNormalizedRecords;
          totalRecords = allNormalizedRecords.length;
        }
        
        updateStatus(type, 'processing', `Processed ${sheetCount} sheet(s)...`, 70);
      } else {
        // Handle CSV file
        updateStatus(type, 'processing', 'Reading file...', 30);
        const text = await file.text();
        updateStatus(type, 'processing', 'Parsing CSV...', 50);

        // Use parseCSV util to get array of objects
        if (type === "sales") {
          records = parseCSVWithPapa(text).totalsByYear
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

      // Persist to localStorage under different keys depending on type
      const keyMap = {
        warehouse_stock: 'vc_warehouse_stock_data',
        stock_on_hand_distributors: 'vc_distributor_stock_on_hand_data',
        exports: 'vc_exports_data',
        sales: 'vc_sales_data'
      };
      const storageKey = keyMap[type] || `vc_upload_${type}`;
      // For CSV files, save to combined key (Excel files already saved combined data above)
      if (!isExcel) {
        localStorage.setItem(storageKey, JSON.stringify(records));
      }
      // Note: For Excel files, combined data is already saved above in the type-specific handlers

      // Save upload timestamp to localStorage for this specific data type
      const uploadTimestamp = new Date().toISOString();
      localStorage.setItem(`vc_last_upload_timestamp_${type}`, uploadTimestamp);
      
      // Update state immediately
      setLastUpdatedTimes(prev => ({ ...prev, [type]: "Today" }));

      // Notify other parts of app that new data is available
      try {
        window.dispatchEvent(new CustomEvent('vc:data:uploaded', { 
          detail: { 
            type, 
            storageKey, 
            count: totalRecords,
            ...((type === 'exports' || type === 'stock_on_hand_distributors' || type === 'sales' || type === 'warehouse_stock') && isExcel ? { sheets: sheetCount } : {})
          } 
        }));
      } catch (e) {
        // ignore if CustomEvent not supported
      }

      const successMessage = (type === 'exports' || type === 'stock_on_hand_distributors' || type === 'sales' || type === 'warehouse_stock') && isExcel
        ? `${totalRecords} records from ${sheetCount} sheet(s) imported successfully.`
        : `${totalRecords} records imported successfully.`;
      
      updateStatus(type, 'success', successMessage, 100);
      setTimeout(() => updateStatus(type, 'idle', ''), 3000);

    } catch (error) {
      // Clear localStorage for this data type on error
      clearDataTypeFromStorage(type);
      updateStatus(type, 'error', error.message || 'An unknown error occurred.');
      setGlobalError(`Failed to process ${type} data. Please check the file format and try again.`);
    }
  };


  const handleRefresh = async () => {
    try {
      // Clear all localStorage data
      localStorage.clear();
      
      // Delete all records from relevant entities
      setGlobalError(null);
      setGlobalSuccess(null);

      // Reset all statuses
      setStatuses({
        sales: { status: 'idle', message: '', progress: 0 },
        exports: { status: 'idle', message: '', progress: 0 },
        stock_on_hand_distributors: { status: 'idle', message: '', progress: 0 },
        warehouse_stock: { status: 'idle', message: '', progress: 0 }
      });

      // Dispatch event to notify dashboard that data was cleared
      try {
        window.dispatchEvent(new CustomEvent('vc:data:uploaded', { 
          detail: { 
            type: 'refresh',
            cleared: true
          } 
        }));
      } catch (e) {
        // ignore if CustomEvent not supported
      }

      setGlobalSuccess('All data cleared. Ready for new data uploads.');
    } catch (error) {
      setGlobalError('Failed to refresh: ' + error.message);
    }
  };

  const allUploadsComplete = Object.values(statuses).every(s => s.status === 'success');

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gradient-to-br from-slate-50 to-white min-h-[calc(100vh-80px)]">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0 mb-6 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button asChild variant="outline" size="icon" className="shrink-0">
              <Link to={createPageUrl('Dashboard')}>
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Import Data</h1>
              <p className="text-xs sm:text-sm text-slate-500">Upload CSV files from your data sources</p>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 w-full sm:w-auto text-sm">
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh & Clear All</span>
                <span className="sm:hidden">Clear All</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all upload statuses and prepare the page for new data imports.
                  Previously uploaded data will remain in the database unless manually deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRefresh}>
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

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

        {allUploadsComplete && (
          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">All Uploads Complete!</AlertTitle>
            <AlertDescription className="text-blue-700">
              All data has been successfully imported. You can now view the updated dashboard.
              <Link to={createPageUrl('Dashboard')}>
                <Button variant="link" className="pl-2 text-blue-600">
                  Go to Dashboard →
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* <DataUploadCard
            title="iDig Sales Data"
            description="Monthly sales data from iDig platform"
            Icon={TrendingUp}
            onFileUpload={(file) => handleFileUpload(file, 'sales')}
            processingStatus={statuses.sales}
            acceptFileTypes=".xlsx,.xls,.csv"
          /> */}

          <DataUploadCard
            title="All Export Running Record"
            description="Complete export transaction history"
            Icon={FileText}
            onFileUpload={(file) => handleFileUpload(file, 'exports')}
            processingStatus={statuses.exports}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('exports')}
            onReset={() => resetStatus('exports')}
          />

          <DataUploadCard
            title="Stock on Hand Live Report"
            description="Current Warehouse Stock on Hand"
            Icon={Package}
            onFileUpload={(file) => handleFileUpload(file, 'warehouse_stock')}
            processingStatus={statuses.warehouse_stock}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('warehouse_stock')}
            onReset={() => resetStatus('warehouse_stock')}
          />

          <DataUploadCard
            title="Depletion Summary"
            description="Stock levels at distributor locations"
            Icon={Users}
            onFileUpload={(file) => handleFileUpload(file, 'sales')}
            processingStatus={statuses.sales}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('sales')}
            onReset={() => resetStatus('sales')}
          />
          <DataUploadCard
            title="Distributors Stock on Hand"
            description="Current Distributors Stock on Hand(Book1.xlsx)"
            Icon={Users}
            onFileUpload={(file) => handleFileUpload(file, 'stock_on_hand_distributors')}
            processingStatus={statuses.stock_on_hand_distributors}
            acceptFileTypes=".xlsx,.xls,.csv"
            lastUpdated={getLastUpdatedText('stock_on_hand_distributors')}
            onReset={() => resetStatus('stock_on_hand_distributors')}
          />
        </div>

        <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
          <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            Upload Instructions
          </h3>
          <ul className="list-disc list-inside text-xs sm:text-sm space-y-2">
            <li><strong>iDig Sales Data:</strong> Monthly sales figures from iDig distributor platform (Excel .xlsx or CSV)</li>
            <li><strong>All Export Running Record:</strong> Historical export transactions and shipments (Excel .xlsx or CSV)</li>
            <li><strong>Stock on Hand Live Report:</strong> Current warehouse inventory from CIN7 (Excel .xlsx or CSV)</li>
            <li><strong>Distributor Stock Reports:</strong> Inventory levels at each distributor location (Excel .xlsx file with multiple sheets)</li>
            <li className="mt-3 pt-2 border-t border-blue-300">Excel files (.xlsx) are supported for all data types and will parse all sheets automatically. CSV files should have proper headers matching the expected data structure.</li>
            <li>Large files may take a few moments to process - please wait for the checkmark</li>
            <li>If you need to start over, use the "Refresh & Clear All" button</li>
          </ul>
        </div>
      </div>
    </div>
  );
}