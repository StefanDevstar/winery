import React, { useState } from 'react';
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
  normalizeDistributorStockData,
  normalizeExportsData,
  normalizeStockOnHandData,
  normalizeIdigSalesData
} from '@/lib/utils';

export default function UploadDataPage() {
  const [statuses, setStatuses] = useState({
    sales: { status: 'idle', message: '', progress: 0 },
    exports: { status: 'idle', message: '', progress: 0 },
    stock_on_hand: { status: 'idle', message: '', progress: 0 },
    distributor_stock: { status: 'idle', message: '', progress: 0 }
  });
  const [globalError, setGlobalError] = useState(null);
  const [globalSuccess, setGlobalSuccess] = useState(null);

  const updateStatus = (key, status, message, progress = 0) => {
    setStatuses(prev => ({
      ...prev,
      [key]: { status, message, progress }
    }));
  };

  const handleFileUpload = async (file, type) => {
    if (!file) return;

    // Check file type - Excel for distributor_stock, exports, stock_on_hand, sales; CSV also accepted for some
    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
    
    // Accept Excel files for: distributor_stock, exports, stock_on_hand, sales (idig)
    // Accept CSV files for: exports, sales (idig), cin7
    const excelTypes = ['distributor_stock', 'exports', 'stock_on_hand', 'sales'];
    
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
      
      if (isExcel && (type === 'distributor_stock' || type === 'exports' || type === 'stock_on_hand' || type === 'sales')) {
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
        
        if (type === 'distributor_stock') {
          // Handle distributor stock
          Object.keys(sheetsData).forEach((sheetName) => {
            const sheetRecords = sheetsData[sheetName];
            if (sheetRecords.length === 0) return;
            
            const normalizedRecords = normalizeDistributorStockData(sheetRecords, sheetName);
            const sheetStorageKey = `vc_distributor_stock_data_${sheetName}`;
            localStorage.setItem(sheetStorageKey, JSON.stringify(normalizedRecords));
            
            sheetMetadata.sheetNames.push(sheetName);
            sheetMetadata.sheetCounts[sheetName] = normalizedRecords.length;
            allNormalizedRecords.push(...normalizedRecords);
          });
          localStorage.setItem('vc_distributor_stock_metadata', JSON.stringify(sheetMetadata));
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
          records = allNormalizedRecords;
          totalRecords = allNormalizedRecords.length;
        } else if (type === 'stock_on_hand') {
          // Handle stock on hand (cin7)
          Object.keys(sheetsData).forEach((sheetName) => {
            const sheetRecords = sheetsData[sheetName];
            if (sheetRecords.length === 0) return;
            
            const normalizedRecords = normalizeStockOnHandData(sheetRecords, sheetName);
            const sheetStorageKey = `vc_cin7_data_${sheetName}`;
            localStorage.setItem(sheetStorageKey, JSON.stringify(normalizedRecords));
            
            sheetMetadata.sheetNames.push(sheetName);
            sheetMetadata.sheetCounts[sheetName] = normalizedRecords.length;
            allNormalizedRecords.push(...normalizedRecords);
          });
          localStorage.setItem('vc_cin7_metadata', JSON.stringify(sheetMetadata));
          records = allNormalizedRecords;
          totalRecords = allNormalizedRecords.length;
        } else if (type === 'sales') {
          // Handle iDig sales data - special format
          const normalizedData = normalizeIdigSalesData(sheetsData);
          Object.keys(sheetsData).forEach((sheetName) => {
            const sheetStorageKey = `vc_sales_data_${sheetName}`;
            localStorage.setItem(sheetStorageKey, JSON.stringify(sheetsData[sheetName]));
            sheetMetadata.sheetNames.push(sheetName);
            sheetMetadata.sheetCounts[sheetName] = sheetsData[sheetName].length;
          });
          localStorage.setItem('vc_sales_metadata', JSON.stringify(sheetMetadata));
          records = normalizedData.totalsByYear; // Use the same format as CSV parser
          totalRecords = Object.keys(normalizedData.totalsByYear).length;
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
          console.log("Using standard parser for type:", records)
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
        cin7: 'vc_cin7_data',
        stock_on_hand: 'vc_cin7_data', // stock_on_hand uses same key as cin7
        exports: 'vc_exports_data',
        sales: 'vc_sales_data',
        distributor_stock: 'vc_distributor_stock_data'
      };
      const storageKey = keyMap[type] || `vc_upload_${type}`;
      localStorage.setItem(storageKey, JSON.stringify(records));

      // Notify other parts of app that new data is available
      try {
        window.dispatchEvent(new CustomEvent('vc:data:uploaded', { 
          detail: { 
            type, 
            storageKey, 
            count: totalRecords,
            ...((type === 'distributor_stock' || type === 'exports' || type === 'stock_on_hand' || type === 'sales') && isExcel ? { sheets: sheetCount } : {})
          } 
        }));
      } catch (e) {
        // ignore if CustomEvent not supported
      }

      const successMessage = (type === 'distributor_stock' || type === 'exports' || type === 'stock_on_hand' || type === 'sales') && isExcel
        ? `${totalRecords} records from ${sheetCount} sheet(s) imported successfully.`
        : `${totalRecords} records imported successfully.`;
      
      updateStatus(type, 'success', successMessage, 100);
      setTimeout(() => updateStatus(type, 'idle', ''), 3000);

    } catch (error) {
      console.error(`Upload error for ${type}:`, error);
      updateStatus(type, 'error', error.message || 'An unknown error occurred.');
      setGlobalError(`Failed to process ${type} data. Please check the file format and try again.`);
    }
  };


  const handleRefresh = async () => {
    try {
      // Delete all records from relevant entities
      setGlobalError(null);
      setGlobalSuccess(null);

      // Reset all statuses
      setStatuses({
        sales: { status: 'idle', message: '', progress: 0 },
        exports: { status: 'idle', message: '', progress: 0 },
        stock_on_hand: { status: 'idle', message: '', progress: 0 },
        distributor_stock: { status: 'idle', message: '', progress: 0 }
      });

      setGlobalSuccess('Page refreshed. Ready for new data uploads.');
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
          <DataUploadCard
            title="iDig Sales Data"
            description="Monthly sales data from iDig platform"
            Icon={TrendingUp}
            onFileUpload={(file) => handleFileUpload(file, 'sales')}
            processingStatus={statuses.sales}
            acceptFileTypes=".xlsx,.xls,.csv"
          />

          <DataUploadCard
            title="All Export Running Record"
            description="Complete export transaction history"
            Icon={FileText}
            onFileUpload={(file) => handleFileUpload(file, 'exports')}
            processingStatus={statuses.exports}
            acceptFileTypes=".xlsx,.xls,.csv"
          />

          <DataUploadCard
            title="Stock on Hand Live Report"
            description="Current inventory levels from CIN7"
            Icon={Package}
            onFileUpload={(file) => handleFileUpload(file, 'stock_on_hand')}
            processingStatus={statuses.stock_on_hand}
            acceptFileTypes=".xlsx,.xls,.csv"
          />

          <DataUploadCard
            title="Depletion Summary"
            description="Stock levels at distributor locations"
            Icon={Users}
            onFileUpload={(file) => handleFileUpload(file, 'distributor_stock')}
            processingStatus={statuses.distributor_stock}
            acceptFileTypes=".xlsx,.xls,.csv"
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