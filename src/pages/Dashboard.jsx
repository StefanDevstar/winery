import React, { useState, useEffect, useMemo, useCallback } from "react";
import { normalizeCountryCode, normalizeWineTypeToCode } from "../lib/utils";

import KPITile from "../components/dashboard/KPITile";
import FilterBar from "../components/dashboard/FilterBar";
import StockFloatChart from "../components/dashboard/StockFloatChart";
import ForecastAccuracyChart from "../components/dashboard/ForecastAccuracyChart";
import WarehouseStockProjectionChart from "../components/dashboard/WarehouseStockProjectionChart";
import DistributorMap from "../components/dashboard/DistributorMap";
import AlertsFeed from "../components/dashboard/AlertsFeed";
import DrilldownModal from "../components/dashboard/DrilldownModal";

/**
 * Parses dates from various Excel formats (M/D/Y, D/M/Y, Y-M-D, etc.)
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} - Parsed date or null if invalid
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const cleaned = dateStr.trim();
  if (!cleaned) return null;
  
  // Try standard Date parsing first
  let date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try parsing formats like "2/10/25", "2/10/2025", "10/2/25", "10/2/2025"
  const parts = cleaned.split(/[\/\-]/);
  if (parts.length >= 3) {
    let month, day, year;
    
    // Determine format: US format (M/D/Y) vs ISO (Y-M-D)
    if (parts[0].length === 4) {
      // ISO format: YYYY-MM-DD
      year = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1; // Month is 0-indexed
      day = parseInt(parts[2]);
    } else {
      // US format: M/D/Y or D/M/Y (try both)
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      const third = parseInt(parts[2]);
      
      // If first part > 12, it's likely D/M/Y format
      if (first > 12 && second <= 12) {
        day = first;
        month = second - 1;
        year = third;
      } else {
        // Assume M/D/Y format
        month = first - 1;
        day = second;
        year = third;
      }
      
      // Handle 2-digit years
      if (year < 100) {
        year = year >= 50 ? 1900 + year : 2000 + year;
      }
    }
    
    date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

export default function Dashboard() {
  const [filters, setFilters] = useState({
    country: "usa", // Default to New Zealand (first in the list)
    distributor: "all",
    state: "all", // State filter for USA
    wineType: "all",
    year: "all",
    viewMode: "historical",
    forwardLookingMonths: 3,
    dateRange: {
      from: new Date(new Date().getFullYear(), new Date().getMonth() - 12, 1),
      to: new Date(),
    },
  });

  const [stockFloatData, setStockFloatData] = useState([]);
  const [forecastAccuracyData, setForecastAccuracyData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [selectedKPI, setSelectedKPI] = useState(null);
  const [drilldownData, setDrilldownData] = useState(null);
  const [kpiValues, setKpiValues] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [warehouseStockProjection, setWarehouseStockProjection] = useState([]);

  // Memoize raw data loading - only parse JSON once
  const rawData = useMemo(() => {
    try {
      const salesMetadataRaw = localStorage.getItem("vc_salesmetadata");
      const exportsRaw = localStorage.getItem("vc_exports_data");
      const warehouseStockRaw = localStorage.getItem("vc_warehouse_stock_data");
      const stockOnHandDistributorsRaw = localStorage.getItem("vc_distributor_stock_on_hand_data");

      // Only require sales (depletion summary) and exports data

      return {
        exportsData: exportsRaw ? JSON.parse(exportsRaw) : null,  
        warehouseStock: warehouseStockRaw ? JSON.parse(warehouseStockRaw) : null,
        stockOnHandDistributors: stockOnHandDistributorsRaw ? JSON.parse(stockOnHandDistributorsRaw) : null,
        salesMetadata: salesMetadataRaw ? JSON.parse(salesMetadataRaw) : null,
      };
    } catch (err) {
      return null;
    }
  }, []); // Only load once on mount

  useEffect(() => {
    if (!rawData) return;
    
    const loadAndProcessData = () => {
      setIsProcessing(true);
      
      // Use requestAnimationFrame to prevent blocking the UI
      requestAnimationFrame(() => {
        try {
          
          const { warehouseStock, stockOnHandDistributors, exportsData: rawExportsData, sales, salesMetadata } = rawData;

          // Load exports data - aggregate from all sheets if needed
          let exportsData = [];
          if (rawExportsData && Array.isArray(rawExportsData)) {
            exportsData = rawExportsData;
          } else {
            // Try loading from individual sheets
            const exportsMetadataRaw = localStorage.getItem("vc_exports_metadata");
            if (exportsMetadataRaw) {
              try {
                const metadata = JSON.parse(exportsMetadataRaw);
                if (metadata.sheetNames && Array.isArray(metadata.sheetNames)) {
                  metadata.sheetNames.forEach(sheetName => {
                    const sheetKey = `vc_exports_data_${sheetName}`;
                    const sheetData = localStorage.getItem(sheetKey);
                    if (sheetData) {
                      try {
                        const parsed = JSON.parse(sheetData);
                        if (Array.isArray(parsed)) {
                          exportsData.push(...parsed);
                        }
                      } catch (e) {
                        // Error parsing exports sheet
                      }
                    }
                  });
                }
              } catch (e) {
                // Error parsing exports metadata
              }
            }
          }

          // Load distributor stock on hand data - aggregate from all sheets if needed
          let distributorStockOnHand = [];
          if (stockOnHandDistributors && Array.isArray(stockOnHandDistributors)) {
            distributorStockOnHand = stockOnHandDistributors;
          } else {
            // Try loading from individual sheets
            const metadataRaw = localStorage.getItem("vc_distributor_stock_on_hand_metadata");
            if (metadataRaw) {
              try {
                const metadata = JSON.parse(metadataRaw);
                if (metadata.sheetNames && Array.isArray(metadata.sheetNames)) {
                  metadata.sheetNames.forEach(sheetName => {
                    const sheetKey = `vc_distributor_stock_on_hand_data_${sheetName}`;
                    const sheetData = localStorage.getItem(sheetKey);
                    if (sheetData) {
                      try {
                        const parsed = JSON.parse(sheetData);
                        if (Array.isArray(parsed)) {
                          distributorStockOnHand.push(...parsed);
                        }
                      } catch (e) {
                        // Error parsing distributor stock on hand sheet
                      }
                    }
                  });
                }
              } catch (e) {
                // Error parsing distributor stock on hand metadata
              }
            }
          }

          // Load sales data (depletion summary) - always load from individual sheets using salesMetadata
          // Only load specific distributor sheets: IRE, NZL, AU-C
          let salesData = []; // This is actually the depletion summary (sales data)
          const salesMetadataRaw = localStorage.getItem("vc_sales_metadata");
          if (salesMetadataRaw) {
            try {
              const salesMeta = JSON.parse(salesMetadataRaw);
              if (salesMeta.sheetNames && Array.isArray(salesMeta.sheetNames)) {
                // Only load specific distributor sheets: IRE, NZL, AU-C
                const allowedSheets = ['IRE', 'NZL', 'USA', 'AU-B'];
                salesMeta.sheetNames.forEach(sheetName => {
                  // Check if this sheet is in the allowed list (case-insensitive)
                  const normalizedSheetName = sheetName.toUpperCase();
                  const isAllowed = allowedSheets.some(allowed => 
                    normalizedSheetName === allowed.toUpperCase() || 
                    normalizedSheetName.includes(allowed.toUpperCase())
                  );
                  
                  if (isAllowed) {
                    const sheetKey = `vc_sales_data_${sheetName}`;
                    const sheetData = localStorage.getItem(sheetKey);
                    if (sheetData) {
                      try {
                        const parsed = JSON.parse(sheetData);
                        if (Array.isArray(parsed)) {
                          salesData.push(...parsed);
                        }
                      } catch (e) {
                        // Error parsing sales sheet
                      }
                    }
                  }
                });
              }
            } catch (e) {
              // Error parsing sales metadata
            }
          }

          // Ensure data is arrays
          if (!Array.isArray(salesData)) {
            salesData = [];
          }
          if (!Array.isArray(distributorStockOnHand)) {
            distributorStockOnHand = [];
          }
          if (!Array.isArray(warehouseStock)) {
            // Warehouse stock data is not an array
          }
          if (!Array.isArray(exportsData)) {
            // Exports data is not an array
          }

          const monthNames = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
          ];

          // Pre-compute filter values for efficiency
          const countryFilter = filters.country === "all" ? null : filters.country.toLowerCase();
          const distributorFilter = filters.distributor === "all" ? null : filters.distributor.replace(/_/g, " ").toLowerCase();
          const stateFilter = filters.state === "all" ? null : filters.state.trim();
          const wineTypeFilter = filters.wineType === "all" ? null : filters.wineType.replace(/_/g, " ").toLowerCase();
          const wineTypeCode = filters.wineType === "all" ? null : filters.wineType.split("_")[0];
          const yearFilter = filters.year === "all" ? null : filters.year.toString();
          
          
          // ───────── Filter Distributor Stock On Hand ─────────
          // Filter distributor stock on hand data (actual stock at distributors)
          const filteredDistributorStockOnHand = [];
          for (let i = 0; i < distributorStockOnHand.length; i++) {
            const r = distributorStockOnHand[i];
            
            // Apply filters
            if (countryFilter) {
              const rawCountryCode = (r.AdditionalAttribute2 || r.Market || "");
              const countryCode = normalizeCountryCode(rawCountryCode).toLowerCase();
              const normalizedFilter = normalizeCountryCode(countryFilter).toLowerCase();
              if (countryCode !== normalizedFilter) continue;
            }
            
            // For USA, filter by state (Location field contains state name)
            if (countryFilter === 'usa' && stateFilter) {
              const location = (r.Location || "").trim();
              if (location !== stateFilter) {
                continue;
              }
            }
            
            // For other countries, filter by distributor
            if (countryFilter !== 'usa' && distributorFilter) {
              let location = (r.Location || r.Distributor || "").toLowerCase().replace(/_/g, " ");
              let locationWithoutPrefix = location.replace(/^[a-z]{2,3}\s*-\s*/i, "").trim();
              if (!locationWithoutPrefix || locationWithoutPrefix === location) {
                locationWithoutPrefix = location.replace(/^[a-z]{2,3}\s+/i, "").trim();
              }
              if (!locationWithoutPrefix || locationWithoutPrefix === location) {
                locationWithoutPrefix = location;
              }
              const normalizedFilter = distributorFilter.toLowerCase();
              if (!locationWithoutPrefix.includes(normalizedFilter) &&
                  !normalizedFilter.includes(locationWithoutPrefix)) {
                continue;
              }
            }
            
            if (wineTypeFilter || wineTypeCode) {
              // Check both AdditionalAttribute3 and VarietyCode fields
              const wineCode = (r.AdditionalAttribute3 || "").toLowerCase();
              const varietyCode = (r.VarietyCode || "").toLowerCase();
              const productName = (r.ProductName || "").toLowerCase();
              
              // Map wine type codes (from filter) to their full names and variations for matching
              const codeToNameMap = {
                'sab': ['sauvignon blanc', 'sauvignon', 'sab'],
                'pin': ['pinot noir', 'pin'],
                'chr': ['chardonnay', 'chr'],
                'pig': ['pinot gris', 'pinot grigio', 'pig'],
                'rose': ['rose', 'rosé'],
                'gru': ['gruner veltliner', 'gruner', 'gru'],
                'lhs': ['late harvest sauvignon', 'lhs'],
                'ries': ['riesling']
              };
              
              let matchesWine = false;
              
              if (wineTypeCode) {
                const code = wineTypeCode.toLowerCase();
                const codeUpper = code.toUpperCase();
                
                // PRIORITY 1: Check AdditionalAttribute3 and VarietyCode - exact match first
                if (!matchesWine) {
                  matchesWine = wineCode === code ||
                               wineCode === codeUpper ||
                               wineCode.trim() === code ||
                               wineCode.trim() === codeUpper ||
                               varietyCode === code ||
                               varietyCode === codeUpper ||
                               varietyCode.trim() === code ||
                               varietyCode.trim() === codeUpper;
                }
                
                // Then check for variety code in compound formats in both fields
                if (!matchesWine) {
                  matchesWine = wineCode.includes(`_${code}_`) || 
                               wineCode.includes(`_${codeUpper}_`) ||
                               wineCode.startsWith(`${code}_`) || 
                               wineCode.startsWith(`${codeUpper}_`) ||
                               wineCode.endsWith(`_${code}`) ||
                               wineCode.endsWith(`_${codeUpper}`) ||
                               wineCode.indexOf(`_${code}_`) >= 0 ||
                               wineCode.indexOf(`_${codeUpper}_`) >= 0 ||
                               varietyCode.includes(`_${code}_`) || 
                               varietyCode.includes(`_${codeUpper}_`) ||
                               varietyCode.startsWith(`${code}_`) || 
                               varietyCode.startsWith(`${codeUpper}_`) ||
                               varietyCode.endsWith(`_${code}`) ||
                               varietyCode.endsWith(`_${codeUpper}`) ||
                               varietyCode.indexOf(`_${code}_`) >= 0 ||
                               varietyCode.indexOf(`_${codeUpper}_`) >= 0;
                }
                
                // PRIORITY 2: Check if wineCode or varietyCode itself is a full wine name (normalizeWineTypeToCode might have returned full text)
                if (!matchesWine) {
                  const normalizedWineCode = normalizeWineTypeToCode(wineCode.toUpperCase()).toLowerCase();
                  const normalizedVarietyCode = normalizeWineTypeToCode(varietyCode.toUpperCase()).toLowerCase();
                  if (normalizedWineCode === code || normalizedWineCode === codeUpper ||
                      normalizedVarietyCode === code || normalizedVarietyCode === codeUpper) {
                    matchesWine = true;
                  }
                }
                
                // PRIORITY 3: Check for full variety names in both fields
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    const variations = [
                      name,
                      name.replace(/\s+/g, ''),
                      name.toUpperCase(),
                      name.toUpperCase().replace(/\s+/g, '')
                    ];
                    
                    for (const variation of variations) {
                      if (wineCode.includes(variation.toLowerCase()) || 
                          varietyCode.includes(variation.toLowerCase())) {
                        matchesWine = true;
                        break;
                      }
                    }
                    if (matchesWine) break;
                  }
                }
                
                // PRIORITY 4: Check product name
                if (!matchesWine && codeToNameMap[code] && productName) {
                  for (const name of codeToNameMap[code]) {
                    if (productName.includes(name)) {
                      matchesWine = true;
                      break;
                    }
                  }
                }
              }
              
              if (!matchesWine) {
                continue;
              }
            }
            
            filteredDistributorStockOnHand.push(r);
          }
          
          // ───────── Filter Sales Data (Depletion Summary) ─────────
          // Filter sales/depletion data for sales predictions
          const filteredStock = [];
          for (let i = 0; i < salesData.length; i++) {
            const r = salesData[i];
            
            // Early exit for country filter (most selective)
            if (countryFilter) {
              const rawCountryCode = (r.AdditionalAttribute2 || r.Market || r.Country || "").toString().trim();
              const countryCode = normalizeCountryCode(rawCountryCode).toLowerCase();
              const normalizedFilter = normalizeCountryCode(countryFilter).toLowerCase();
            
              if (rawCountryCode && (countryFilter === "AU-B" || rawCountryCode.toUpperCase().includes("AU"))) {
                console.log("FILTER CHECK:", { rawCountryCode, countryCode, countryFilter, normalizedFilter });
              }
            
              if (countryCode !== normalizedFilter) continue;
            }
            
            
            
            // Early exit for year filter
            if (yearFilter) {
              // Check multiple possible year fields: _year, Vintage, Year
              const recordYear = (r._year || r.Vintage || r.Year || "").toString().trim();
              // Extract year from vintage if it's in format like "2022" or "22"
              let yearMatch = false;
              if (recordYear) {
                // If vintage is like "2022", extract it
                const yearMatch202x = recordYear.match(/20(\d{2})/);
                const yearMatch2x = recordYear.match(/^(\d{2})$/);
                if (yearMatch202x) {
                  yearMatch = yearMatch202x[0] === yearFilter || yearMatch202x[1] === yearFilter.slice(-2);
                } else if (yearMatch2x) {
                  // Convert 2-digit year to 4-digit
                  const fullYear = parseInt(yearMatch2x[1]) >= 50 
                    ? `19${yearMatch2x[1]}` 
                    : `20${yearMatch2x[1]}`;
                  yearMatch = fullYear === yearFilter;
                } else {
                  yearMatch = recordYear === yearFilter || recordYear.includes(yearFilter);
                }
              }
              // Also check if year is in wine code (e.g., "JT_22_SAB" contains "22")
              if (!yearMatch && r.AdditionalAttribute3) {
                const wineCode = r.AdditionalAttribute3.toString();
                const yearInCode = wineCode.match(/_(\d{2})_|_(\d{4})_|^(\d{2})|^(\d{4})/);
                if (yearInCode) {
                  const foundYear = yearInCode[1] || yearInCode[2] || yearInCode[3] || yearInCode[4];
                  if (foundYear) {
                    const fullYear = foundYear.length === 2
                      ? (parseInt(foundYear) >= 50 ? `19${foundYear}` : `20${foundYear}`)
                      : foundYear;
                    yearMatch = fullYear === yearFilter;
                  }
                }
              }
              if (!yearMatch) continue;
            }
            
            // For USA, filter by state (Location field contains state name)
            if (countryFilter === 'usa' && stateFilter) {
              const location = (r.Location || "").trim();
              if (location !== stateFilter) {
                continue;
              }
            }
            
            // For other countries, filter by distributor
            if (countryFilter !== 'usa' && distributorFilter) {
              let location = (r.Location || "").toLowerCase().replace(/_/g, " ");
              // Strip country code prefix if present (fallback for other data sources that might still have it)
              let locationWithoutPrefix = location.replace(/^[a-z]{2,3}\s*-\s*/i, "").trim();
              if (!locationWithoutPrefix || locationWithoutPrefix === location) {
                locationWithoutPrefix = location.replace(/^[a-z]{2,3}\s+/i, "").trim();
              }
              // If still no change, use original location (no prefix was present)
              if (!locationWithoutPrefix || locationWithoutPrefix === location) {
                locationWithoutPrefix = location;
              }
              const normalizedFilter = distributorFilter.toLowerCase();
              
              // Match against location (filter has no prefix)
              if (!locationWithoutPrefix.includes(normalizedFilter) &&
                  !normalizedFilter.includes(locationWithoutPrefix)) {
                continue;
              }
            }
            
            // Early exit for wine type filter
            if (wineTypeFilter || wineTypeCode) {
              const wineCode = (r.AdditionalAttribute3 || "").toLowerCase();
              const productName = (r.ProductName || "").toLowerCase();
              // Extract variety from ProductName if Variety field doesn't exist (e.g., NZL data)
              let variety = (r.Variety || "").toLowerCase();
              if (!variety && productName) {
                // Try to extract variety from product name (format: "Brand Variety" or "Brand Variety Vintage")
                const parts = productName.split(/\s+/);
                // Skip first part (brand) and take the rest as variety
                if (parts.length > 1) {
                  variety = parts.slice(1).join(' ').toLowerCase();
                }
              }
              
              // Also extract variety from wine code if it's in format "BRAND_VARIETY" (NZL format)
              if (!variety && wineCode) {
                const parts = wineCode.split('_');
                if (parts.length > 1) {
                  // Skip first part (brand) and join the rest as variety
                  variety = parts.slice(1).join(' ').toLowerCase();
                }
              }
              
              // Map wine type codes (from filter) to their full names and variations for matching in AdditionalAttribute3
              // This is critical because AdditionalAttribute3 may contain full names, not codes
              const codeToNameMap = {
                'sab': ['sauvignon blanc', 'sauvignon', 'sab'],
                'pin': ['pinot noir', 'pin'],
                'chr': ['chardonnay', 'chr'],
                'pig': ['pinot gris', 'pinot grigio', 'pig'],
                'rose': ['rose', 'rosé'], // Include accented version
                'gru': ['gruner veltliner', 'gruner', 'gru'],
                'lhs': ['late harvest sauvignon', 'lhs'],
                'ries': ['riesling']
              };
              
              let matchesWine = false;
              
              if (wineTypeCode) {
                const code = wineTypeCode.toLowerCase();
                const codeUpper = code.toUpperCase();
                
                // PRIORITY 1: Check AdditionalAttribute3 (wineCode) - this is the PRIMARY field
                // First check for exact match (most common for normalized codes like SAB, PIN, etc.)
                if (!matchesWine) {
                  matchesWine = wineCode === code ||
                               wineCode === codeUpper ||
                               wineCode.trim() === code ||
                               wineCode.trim() === codeUpper;
                }
                
                // Then check for variety code in compound formats (e.g., BRAND_CODE_VINTAGE or CODE_VINTAGE)
                if (!matchesWine) {
                  matchesWine = wineCode.includes(`_${code}_`) || 
                               wineCode.includes(`_${codeUpper}_`) ||
                               wineCode.startsWith(`${code}_`) || 
                               wineCode.startsWith(`${codeUpper}_`) ||
                               wineCode.endsWith(`_${code}`) ||
                               wineCode.endsWith(`_${codeUpper}`) ||
                               wineCode.indexOf(`_${code}_`) >= 0 ||
                               wineCode.indexOf(`_${codeUpper}_`) >= 0;
                }
                
                // PRIORITY 2: Check if wineCode itself is a full wine name (normalizeWineTypeToCode might have returned full text)
                // Try to normalize the wineCode and see if it matches
                if (!matchesWine) {
                  const normalizedWineCode = normalizeWineTypeToCode(wineCode.toUpperCase()).toLowerCase();
                  if (normalizedWineCode === code || normalizedWineCode === codeUpper) {
                    matchesWine = true;
                  }
                }
                
                // PRIORITY 3: Check for full variety names (most common in NZL data or when normalizeWineTypeToCode returns full text)
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    // Create all possible variations
                    const variations = [
                      name,                                    // "pinot gris"
                      name,              // "pinot_gris"
                      name.replace(/\s+/g, ''),               // "pinotgris"
                      name.toUpperCase(),                      // "PINOT GRIS"
                      name.toUpperCase(), // "PINOT_GRIS"
                      name.toUpperCase().replace(/\s+/g, '')   // "PINOTGRIS"
                    ];
                    
                    // Check if wineCode contains any variation (case-insensitive)
                    for (const variation of variations) {
                      if (wineCode.includes(variation.toLowerCase())) {
                        matchesWine = true;
                        break;
                      }
                    }
                    if (matchesWine) break;
                  }
                }
                
                // PRIORITY 3: Check extracted variety and product name
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    if ((variety && (variety.includes(name) || name.includes(variety))) ||
                        (productName && (productName.includes(name) || name.includes(productName)))) {
                      matchesWine = true;
                      break;
                    }
                  }
                }
              }
              
              // Fallback: check with wineTypeFilter if still no match
              if (!matchesWine && wineTypeFilter) {
                const filterVariations = [
                  wineTypeFilter,
                  wineTypeFilter,
                  wineTypeFilter.replace(/\s+/g, ''),
                  wineTypeFilter.toUpperCase(),
                  wineTypeFilter.toUpperCase()
                ];
                
                for (const filterVar of filterVariations) {
                  if (productName.includes(filterVar) || 
                      (variety && variety.includes(filterVar)) ||
                      wineCode.includes(filterVar)) {
                    matchesWine = true;
                    break;
                  }
                }
              }
              
              if (!matchesWine && (wineTypeFilter || wineTypeCode)) continue;
            }
            
            filteredStock.push(r);
          }
          console.log(
            "POST-FILTER sales markets:",
            [...new Set(filteredStock.map(x =>
              normalizeCountryCode(x.AdditionalAttribute2 || x.Market || x.Country).toLowerCase()
            ))]
          );
          console.log("POST-FILTER sales rows:", filteredStock.length);
          console.log("Unique sales raw AdditionalAttribute2:", [...new Set(salesData.map(r => (r.AdditionalAttribute2||"").toString().trim()))]);
          console.log("Unique exports raw AdditionalAttribute2:", [...new Set(exportsData.map(e => (e.AdditionalAttribute2||"").toString().trim()))]);

          
          
          // ───────── Filter Exports ─────────
          // Only include "waiting to ship" and "in transit" orders (exclude "complete")
          // Optimized filtering with early returns
          const filteredExports = [];
          for (let i = 0; i < exportsData.length; i++) {
            const r = exportsData[i];
            
            // Early exit for status check
            // Check status field first
            const status = (r.Status || "").toLowerCase().trim();
            let isActive = status === "waiting to ship" || 
                          status === "in transit" || 
                          status.includes("waiting") || 
                          status.includes("transit");
            
            // Also check dates: if DateShipped exists but DateArrival is missing or in the future, it's in transit
            if (!isActive) {
              const dateShipped = (r.DateShipped || "").toString().trim();
              const dateArrival = (r.DateArrival || "").toString().trim();
              
              if (dateShipped && !dateArrival) {
                // Has shipped date but no arrival date = in transit
                isActive = true;
              } else if (dateShipped && dateArrival) {
                // Both dates exist: check if arrival is in the future
                const shippedDate = parseDate(dateShipped);
                const arrivalDate = parseDate(dateArrival);
                if (shippedDate && arrivalDate) {
                  const now = new Date();
                  // If arrival date is in the future, it's still in transit
                  if (arrivalDate > now) {
                    isActive = true;
                  }
                }
              } else if (dateShipped) {
                // Only shipped date: check if it's recent (likely in transit)
                const shippedDate = parseDate(dateShipped);
                if (shippedDate) {
                  const now = new Date();
                  const daysSinceShipped = Math.ceil((now - shippedDate) / (1000 * 60 * 60 * 24));
                  // If shipped within last 90 days and no arrival date, likely in transit
                  if (daysSinceShipped >= 0 && daysSinceShipped <= 90) {
                    isActive = true;
                  }
                }
              }
            }
            
            // Exclude "complete" orders
            if (status === "complete" || status.includes("complete")) {
              isActive = false;
            }
            
            if (!isActive) continue;
            
            // Early exit for country filter
            // For exports data, country is now set in AdditionalAttribute2 during normalization
            if (countryFilter) {
              const rawMarket = (r.AdditionalAttribute2 || r.Market || "").trim();
              const recordCountry = normalizeCountryCode(rawMarket).toLowerCase();
              const normalizedFilter = normalizeCountryCode(countryFilter).toLowerCase();
              
              if (recordCountry !== normalizedFilter) continue;
            }
            
            // Early exit for year filter
            if (yearFilter) {
              let yearMatch = false;
              
              // Priority 1: Check DateShipped field (for exports, this is the primary date field)
              const dateShipped = (r.DateShipped || "").toString().trim();
              if (dateShipped) {
                const dateObj = parseDate(dateShipped);
                if (dateObj) {
                  const shippedYear = dateObj.getFullYear().toString();
                  const shippedYear2Digit = shippedYear.slice(-2);
                  // Match full year or 2-digit year
                  yearMatch = shippedYear === yearFilter || 
                             shippedYear2Digit === yearFilter.slice(-2) ||
                             shippedYear === `20${yearFilter.slice(-2)}`;
                }
              }
              
              // Priority 2: Check DateArrival field if DateShipped didn't match
              if (!yearMatch) {
                const dateArrival = (r.DateArrival || "").toString().trim();
                if (dateArrival) {
                  const dateObj = parseDate(dateArrival);
                  if (dateObj) {
                    const arrivalYear = dateObj.getFullYear().toString();
                    const arrivalYear2Digit = arrivalYear.slice(-2);
                    yearMatch = arrivalYear === yearFilter || 
                               arrivalYear2Digit === yearFilter.slice(-2) ||
                               arrivalYear === `20${yearFilter.slice(-2)}`;
                  }
                }
              }
              
              // Priority 3: Check Vintage, Year fields (fallback)
              if (!yearMatch) {
                const recordYear = (r.Vintage || r.Year || "").toString().trim();
                if (recordYear) {
                  const yearMatch202x = recordYear.match(/20(\d{2})/);
                  const yearMatch2x = recordYear.match(/^(\d{2})$/);
                  if (yearMatch202x) {
                    yearMatch = yearMatch202x[0] === yearFilter || yearMatch202x[1] === yearFilter.slice(-2);
                  } else if (yearMatch2x) {
                    const fullYear = parseInt(yearMatch2x[1]) >= 50 
                      ? `19${yearMatch2x[1]}` 
                      : `20${yearMatch2x[1]}`;
                    yearMatch = fullYear === yearFilter;
                  } else {
                    yearMatch = recordYear === yearFilter || recordYear.includes(yearFilter);
                  }
                }
              }
              
              // Priority 4: Check if year is in AdditionalAttribute3 (wine code) or Stock field
              if (!yearMatch) {
                const wineCode = (r.AdditionalAttribute3 || r.Stock || "").toString();
                const yearInCode = wineCode.match(/_(\d{2})_|_(\d{4})_|^(\d{2})|^(\d{4})/);
                if (yearInCode) {
                  const foundYear = yearInCode[1] || yearInCode[2] || yearInCode[3] || yearInCode[4];
                  if (foundYear) {
                    const fullYear = foundYear.length === 2
                      ? (parseInt(foundYear) >= 50 ? `19${foundYear}` : `20${foundYear}`)
                      : foundYear;
                    yearMatch = fullYear === yearFilter;
                  }
                }
              }
              
              if (!yearMatch) continue;
            }
            
            // Early exit for distributor filter
            // Strip country code prefix for matching (filter has no prefix)
            if (distributorFilter) {
              let customer = (r.Customer || r.Company || "").toLowerCase();
              // Strip country code prefix - handles both "nzl - customer" and "nzl customer" formats
              let customerWithoutPrefix = customer.replace(/^[a-z]{2,3}\s*-\s*/i, "").trim();
              if (!customerWithoutPrefix || customerWithoutPrefix === customer) {
                customerWithoutPrefix = customer.replace(/^[a-z]{2,3}\s+/i, "").trim();
              }
              const normalizedFilter = distributorFilter.toLowerCase();
              
              // Match against customer without prefix (filter has no prefix)
              if (!customerWithoutPrefix.includes(normalizedFilter) &&
                  !normalizedFilter.includes(customerWithoutPrefix)) {
                continue;
              }
            }
            
            // Early exit for wine type filter
            if (wineTypeFilter || wineTypeCode) {
              const varietyCode = (r.VarietyCode || r.Stock || r.AdditionalAttribute3 || "").toLowerCase();
              let variety = (r.Variety || "").toLowerCase();
              const productName = (r.ProductName || r.Stock || "").toLowerCase();
              
              // Extract variety from ProductName if Variety field doesn't exist (e.g., NZL data)
              if (!variety && productName) {
                const parts = productName.split(/\s+/);
                if (parts.length > 1) {
                  variety = parts.slice(1).join(' ').toLowerCase();
                }
              }
              
              // Also extract variety from wine code if it's in format "BRAND_VARIETY" (NZL format)
              if (!variety && varietyCode) {
                const parts = varietyCode.split('_');
                if (parts.length > 1) {
                  // Skip first part (brand) and join the rest as variety
                  variety = parts.slice(1).join(' ').toLowerCase();
                }
              }
              
              // Map wine type codes (from filter) to their full names for matching in AdditionalAttribute3
              const codeToNameMap = {
                'sab': ['sauvignon blanc', 'sauvignon', 'sab'],
                'pin': ['pinot noir', 'pin'],
                'chr': ['chardonnay', 'chr'],
                'pig': ['pinot gris', 'pinot grigio', 'pig'],
                'rose': ['rose', 'rosé'], // Include accented version
                'gru': ['gruner veltliner', 'gruner', 'gru'],
                'lhs': ['late harvest sauvignon', 'lhs'],
                'ries': ['riesling']
              };
              
              let matchesWine = false;
              
              if (wineTypeCode) {
                const code = wineTypeCode.toLowerCase();
                const codeUpper = code.toUpperCase();
                
                // PRIORITY 1: Check for variety code directly (e.g., PIG, PIN, ROSE)
                if (!matchesWine) {
                  matchesWine = varietyCode.includes(`_${code}_`) || 
                              varietyCode.includes(`_${codeUpper}_`) ||
                              varietyCode.startsWith(`${code}_`) || 
                              varietyCode.startsWith(`${codeUpper}_`) ||
                              varietyCode.endsWith(`_${code}`) ||
                              varietyCode.endsWith(`_${codeUpper}`) ||
                              varietyCode === code ||
                              varietyCode === codeUpper ||
                              varietyCode.indexOf(`_${code}_`) >= 0 ||
                              varietyCode.indexOf(`_${codeUpper}_`) >= 0;
                }
                
                // PRIORITY 2: Check AdditionalAttribute3 (varietyCode) for full variety names
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    // Create all possible variations
                    const variations = [
                      name,
                      name,
                      name.replace(/\s+/g, ''),
                      name.toUpperCase(),
                      name.toUpperCase(),
                      name.toUpperCase().replace(/\s+/g, '')
                    ];
                    
                    // Check if varietyCode contains any variation
                    for (const variation of variations) {
                      if (varietyCode.includes(variation)) {
                        matchesWine = true;
                        break;
                      }
                    }
                    if (matchesWine) break;
                  }
                }
                
                // PRIORITY 3: Check extracted variety and product name
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    if ((variety && (variety.includes(name) || name.includes(variety))) ||
                        (productName && (productName.includes(name) || name.includes(productName)))) {
                      matchesWine = true;
                      break;
                    }
                  }
                }
              }
              
              if (!matchesWine && wineTypeFilter) {
                const filterVariations = [
                  wineTypeFilter,
                  wineTypeFilter,
                  wineTypeFilter.replace(/\s+/g, ''),
                  wineTypeFilter.toUpperCase(),
                  wineTypeFilter.toUpperCase()
                ];
                
                for (const filterVar of filterVariations) {
                  if ((variety && variety.includes(filterVar)) || 
                      productName.includes(filterVar) ||
                      varietyCode.includes(filterVar)) {
                    matchesWine = true;
                    break;
                  }
                }
              }
              
              if (!matchesWine) continue;
            }
            
            filteredExports.push(r);
          }

          // ───────── Stock & Exports Aggregation by Distributor and Wine ─────────
          // Use distributor stock on hand data (filteredDistributorStockOnHand) for actual stock
          // Use sales/depletion data (filteredStock) only for sales predictions
          // Use Map for better performance with large datasets
          // 
          // IMPORTANT: Aggregate distributor stock correctly:
          // - For each distributor (USA, IRE, NZL, AU-B), calculate total on hand by summing OnHand values
          // - For USA specifically, only sum rows where Product = "Total"
          // - For others (IRE, NZL, AU-B), sum all OnHand values
          const distributorStockByWine = new Map();
          
          // First, group by distributor name (from sheet name) to calculate total stock per distributor
          for (let i = 0; i < filteredDistributorStockOnHand.length; i++) {
            const r = filteredDistributorStockOnHand[i];
            let location = (r.Location || r.Distributor || r._sheetName || "Unknown").trim();
            
            // Normalize distributor name to match sheet names (USA, IRE, NZ, AU-B)
            // Sheet names are stored in _sheetName field or Location field
            let distributorName = location.toUpperCase();
            
            // Map common variations to standard distributor names
            if (distributorName === 'USA' || distributorName.includes('USA')) {
              distributorName = 'USA';
            } else if (distributorName === 'IRE' || distributorName.includes('IRE') || distributorName.includes('IRELAND')) {
              distributorName = 'IRE';
            } else if (distributorName === 'NZ' || distributorName === 'NZL' || distributorName.includes('NEW ZEALAND')) {
              distributorName = 'NZL';
            } else if (distributorName === 'AU-B' || distributorName === 'AUB' || distributorName.includes('AU-B')) {
              distributorName = 'AU-B';
            } else {
              // Try to extract from _sheetName if available
              const sheetName = (r._sheetName || "").toUpperCase();
              if (sheetName === 'USA' || sheetName.includes('USA')) {
                distributorName = 'USA';
              } else if (sheetName === 'IRE' || sheetName.includes('IRE')) {
                distributorName = 'IRE';
              } else if (sheetName === 'NZ' || sheetName === 'NZL') {
                distributorName = 'NZL';
              } else if (sheetName === 'AU-B' || sheetName === 'AUB') {
                distributorName = 'AU-B';
              }
            }
            
            // Get wine code
            const wineCode = (r.AdditionalAttribute3 || "").toUpperCase().trim();
            if (!wineCode) continue;
            
            // Get stock on hand value
            const onHand = parseFloat(r.OnHand || r.StockOnHand || 0);
            if (onHand <= 0) continue; // Skip zero/negative stock
            
            // Aggregate by distributor and wine
            const key = `${distributorName.toLowerCase()}_${wineCode}`;
            if (!distributorStockByWine.has(key)) {
              distributorStockByWine.set(key, {
                distributor: distributorName, // Use normalized distributor name (USA, IRE, NZL, AU-B)
                wineCode: wineCode,
                stock: 0,
                brand: r.Brand || "",
                variety: r.Variety || r.ProductName || "",
                country: r.AdditionalAttribute2 || r.Market || "" // Preserves 'au-b', 'au-c', 'ire', etc.
              });
            }
            const item = distributorStockByWine.get(key);
            // Sum stock on hand values
            item.stock += onHand;
          }
          
          // Group in-transit exports by market, distributor and wine code
          // Key format: `${normalizedMarket}_${customerKey}_${wineCode}` to ensure proper market assignment
          const inTransitByMarketDistributorWine = new Map();
          for (let i = 0; i < filteredExports.length; i++) {
            const e = filteredExports[i];
            
            // Get and normalize market from export record
            // First try Market/AdditionalAttribute2, then fallback to company mapping
            // Country is now set in AdditionalAttribute2 during normalization
            let rawMarket = (e.AdditionalAttribute2 || e.Market || "").trim();
            let normalizedMarket = normalizeCountryCode(rawMarket).toLowerCase();
            
            // Get customer/distributor name
            // IMPORTANT: Map country to distributor name (e.g., USA country = USA distributor)
            // Distributor name should match the sheet names: USA, IRE, NZL, AU-B
            let distributorName = "";
            
            // First, try to get distributor from country/market
            if (normalizedMarket === 'usa' || normalizedMarket === 'us') {
              distributorName = 'USA';
            } else if (normalizedMarket === 'ire' || normalizedMarket === 'ireland') {
              distributorName = 'IRE';
            } else if (normalizedMarket === 'nzl' || normalizedMarket === 'nz' || normalizedMarket === 'new zealand') {
              distributorName = 'NZL';
            } else if (normalizedMarket === 'au-b' || normalizedMarket === 'aub') {
              distributorName = 'AU-B';
            } else {
              // Fallback: try to extract from customer name
              let customer = (e.Customer || e.Company || "Unknown").trim();
              // Strip country code prefix from customer for storage (matches filter format)
              let cleanedCustomer = customer.replace(/^[A-Z]{2,3}\s*-\s*/i, "").trim();
              if (!cleanedCustomer || cleanedCustomer === customer) {
                cleanedCustomer = customer.replace(/^[A-Z]{2,3}\s+/i, "").trim();
              }
              if (!cleanedCustomer || cleanedCustomer === customer) {
                cleanedCustomer = customer;
              }
              
              // Try to map cleaned customer to distributor name
              const customerUpper = cleanedCustomer.toUpperCase();
              if (customerUpper === 'USA' || customerUpper.includes('USA')) {
                distributorName = 'USA';
              } else if (customerUpper === 'IRE' || customerUpper.includes('IRE') || customerUpper.includes('IRELAND')) {
                distributorName = 'IRE';
              } else if (customerUpper === 'NZ' || customerUpper === 'NZL' || customerUpper.includes('NEW ZEALAND')) {
                distributorName = 'NZL';
              } else if (customerUpper === 'AU-B' || customerUpper === 'AUB' || customerUpper.includes('AU-B')) {
                distributorName = 'AU-B';
              } else {
                distributorName = cleanedCustomer; // Use as-is if no match
              }
            }
            
            const customerKey = distributorName.toLowerCase();
            
            // Get wine code
            const wineCode = (e.AdditionalAttribute3 || "").toUpperCase().trim() || 
                            (e.Stock || e.ProductDescription || "").toUpperCase().trim();
            // Skip if we still don't have a market (shouldn't happen after company mapping fallback, but safety check)
            if (!normalizedMarket) {
              continue;
            }
            
            if (!wineCode) {
              // Try to construct from Brand and Variety if available
              if (e.Brand && e.VarietyCode) {
                const constructedCode = `${e.BrandCode || e.Brand}_${e.VarietyCode}_${e.Vintage || ""}`.toUpperCase();
                if (constructedCode && constructedCode !== '_') {
                  // Map country to distributor name (same logic as above)
                  let distributorNameForConstructed = "";
                  if (normalizedMarket === 'usa' || normalizedMarket === 'us') {
                    distributorNameForConstructed = 'USA';
                  } else if (normalizedMarket === 'ire' || normalizedMarket === 'ireland') {
                    distributorNameForConstructed = 'IRE';
                  } else if (normalizedMarket === 'nzl' || normalizedMarket === 'nz' || normalizedMarket === 'new zealand') {
                    distributorNameForConstructed = 'NZL';
                  } else if (normalizedMarket === 'au-b' || normalizedMarket === 'aub') {
                    distributorNameForConstructed = 'AU-B';
                  } else {
                    distributorNameForConstructed = normalizedMarket; // Use market as fallback
                  }
                  
                  // Use constructed code with market
                  const key = `${normalizedMarket}_${distributorNameForConstructed.toLowerCase()}_${constructedCode}`;
                  if (!inTransitByMarketDistributorWine.has(key)) {
                    inTransitByMarketDistributorWine.set(key, {
                      market: normalizedMarket,
                      distributor: distributorNameForConstructed, // Use normalized distributor name
                      wineCode: constructedCode,
                      inTransit: 0,
                      brand: e.Brand || "",
                      variety: e.Variety || "",
                      country: normalizedMarket
                    });
                  }
                  const item = inTransitByMarketDistributorWine.get(key);
                  item.inTransit += parseFloat(e.cases) || 0;
                }
              }
              continue;
            }
            
            // Key includes market to ensure proper regional assignment
            const key = `${normalizedMarket}_${customerKey}_${wineCode}`;
            if (!inTransitByMarketDistributorWine.has(key)) {
              inTransitByMarketDistributorWine.set(key, {
                market: normalizedMarket,
                distributor: distributorName, // Use normalized distributor name (USA, IRE, NZL, AU-B)
                wineCode: wineCode,
                inTransit: 0,
                brand: e.Brand || "",
                variety: e.Variety || "",
                country: normalizedMarket
              });
            }
            const item = inTransitByMarketDistributorWine.get(key);
            item.inTransit += parseFloat(e.cases) || 0;
          }
          // Convert to distributor/wine key format for compatibility (but keep market info)
          const inTransitByDistributorWine = new Map();
          for (const [key, transit] of inTransitByMarketDistributorWine.entries()) {
            // Only include in-transit for the current country filter (if set)
            // Use transit.market (which should now be set from company mapping if needed)
            const transitMarket = transit.market || transit.country || "";
            if (!countryFilter || transitMarket === countryFilter) {
              const distributorWineKey = `${transit.distributor.toLowerCase()}_${transit.wineCode}`;
              if (!inTransitByDistributorWine.has(distributorWineKey)) {
                inTransitByDistributorWine.set(distributorWineKey, {
                  ...transit,
                  inTransit: 0
                });
              }
              const item = inTransitByDistributorWine.get(distributorWineKey);
              item.inTransit += transit.inTransit;
            }
          }

          // Combine distributor stock and in-transit for total stock float per distributor/wine
          // Use Map for better performance
          const stockFloatByDistributorWine = new Map();
          
          // Add all stock items
          for (const [key, stock] of distributorStockByWine.entries()) {
            stockFloatByDistributorWine.set(key, {
              ...stock,
              inTransit: 0,
              totalStockFloat: stock.stock
            });
          }
          
          // Add/update with in-transit items
          for (const [key, transit] of inTransitByDistributorWine.entries()) {
            if (stockFloatByDistributorWine.has(key)) {
              const item = stockFloatByDistributorWine.get(key);
              item.inTransit = transit.inTransit;
              item.totalStockFloat = item.stock + transit.inTransit;
            } else {
              stockFloatByDistributorWine.set(key, {
                distributor: transit.distributor,
                wineCode: transit.wineCode,
                stock: 0,
                inTransit: transit.inTransit,
                totalStockFloat: transit.inTransit,
                brand: transit.brand,
                variety: transit.variety,
                country: transit.country
              });
            }
          }
          // Legacy aggregation for backward compatibility (aggregated by wine only)
          const stockByWine = new Map();
          for (const item of stockFloatByDistributorWine.values()) {
            const wineCode = item.wineCode;
            stockByWine.set(wineCode, (stockByWine.get(wineCode) || 0) + item.totalStockFloat);
          }

          const exportsByWineCode = new Map();
          for (let i = 0; i < filteredExports.length; i++) {
            const e = filteredExports[i];
            const wineCode = (e.Vintage || "").toUpperCase().trim() || 
                            (e.Stock || "").toUpperCase().trim();
            if (!wineCode) continue;
            exportsByWineCode.set(wineCode, (exportsByWineCode.get(wineCode) || 0) + (parseFloat(e.cases) || 0));
          }
        // ───────── Build Time Range ─────────
        const now = new Date();
        const currentYear = now.getFullYear().toString();
        const monthsToDisplay =
          filters.viewMode === "forward"
            ? monthNames.slice(0, filters.forwardLookingMonths).map((m) => ({
                month: m,
                year: currentYear,
              }))
            : (() => {
                const from = filters.dateRange.from;
                const to = filters.dateRange.to;
                const cur = new Date(from);
                const list = [];
                while (cur <= to) {
                  list.push({
                    month: monthNames[cur.getMonth()],
                    year: cur.getFullYear().toString(),
                  });
                  cur.setMonth(cur.getMonth() + 1);
                }
                return list;
              })();

        // ───────── Sales Prediction Calculation from Depletion Summary ─────────
        // SIMPLE FORMULA: Average = Sum / Count
        // Sum = total sales of cases in the observed period
        // Count = number of months in the observed period
        // Example: 2000, 3000, 4000 → sum=9000, count=3 → average=3000
        // Use this average to predict future sales (no trends in initial scope)
        // ONLY use depletion summary data (no iDig sales data)
        
        // Helper function to normalize month format to month names (Jan, Feb, etc.)
        const normalizeMonth = (month) => {
          if (!month) return "";
          const monthStr = String(month).trim();
          
          // If already a month name, return as-is (capitalize first letter)
          const monthNameIndex = monthNames.findIndex(m => 
            m.toLowerCase() === monthStr.toLowerCase() || 
            m.substring(0, 3).toLowerCase() === monthStr.substring(0, 3).toLowerCase()
          );
          if (monthNameIndex >= 0) {
            return monthNames[monthNameIndex];
          }
          
          // If it's a numeric month (1-12), convert to month name
          const monthNum = parseInt(monthStr);
          if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
            return monthNames[monthNum - 1];
          }
          
          // Try to match partial month names (e.g., "11" might be "Nov")
          // Map common numeric patterns to month names
          const numericToMonth = {
            "1": "Jan", "01": "Jan",
            "2": "Feb", "02": "Feb",
            "3": "Mar", "03": "Mar",
            "4": "Apr", "04": "Apr",
            "5": "May", "05": "May",
            "6": "Jun", "06": "Jun",
            "7": "Jul", "07": "Jul",
            "8": "Aug", "08": "Aug",
            "9": "Sep", "09": "Sep",
            "10": "Oct",
            "11": "Nov",
            "12": "Dec"
          };
          
          if (numericToMonth[monthStr]) {
            return numericToMonth[monthStr];
          }
          
          // If no match, return original (will be filtered out if invalid)
          return monthStr;
        };
        
        const salesByMarket = new Map(); // key: market, value: array of {year, month, value}
        const filteredSalesByPeriod = new Map(); // key: `${year}_${normalizedMonth}` (overall)
        
        // For warehouse predictions, we need ALL sales data (not filtered by wine type)
        // Create a separate aggregation for warehouse predictions
        const warehouseSalesByPeriod = new Map(); // key: `${year}_${normalizedMonth}` (for warehouse predictions - all wine types)
        
        // Create unfiltered sales data for warehouse predictions (only filter by country/state, not wine type)
        const warehouseSalesData = [];
        for (let i = 0; i < salesData.length; i++) {
          const r = salesData[i];
          
          // Filter by country only (not wine type for warehouse predictions)
          if (countryFilter) {
            const rawCountryCode = (r.AdditionalAttribute2 || "");
            const countryCode = normalizeCountryCode(rawCountryCode).toLowerCase();
            const normalizedFilter = normalizeCountryCode(countryFilter).toLowerCase();
            if (countryCode !== normalizedFilter) continue;
          }
          
          // Filter by state for USA
          if (countryFilter === 'usa' && stateFilter) {
            const location = (r.Location || "").trim();
            if (location !== stateFilter) {
              continue;
            }
          }
          
          // Filter by distributor for non-USA (but not wine type)
          if (countryFilter !== 'usa' && distributorFilter) {
            let location = (r.Location || "").toLowerCase().replace(/_/g, " ");
            let locationWithoutPrefix = location.replace(/^[a-z]{2,3}\s*-\s*/i, "").trim();
            if (!locationWithoutPrefix || locationWithoutPrefix === location) {
              locationWithoutPrefix = location.replace(/^[a-z]{2,3}\s+/i, "").trim();
            }
            if (!locationWithoutPrefix || locationWithoutPrefix === location) {
              locationWithoutPrefix = location;
            }
            const normalizedFilter = distributorFilter.toLowerCase();
            if (!locationWithoutPrefix.includes(normalizedFilter) &&
                !normalizedFilter.includes(locationWithoutPrefix)) {
              continue;
            }
          }
          
          warehouseSalesData.push(r);
        }
        
        // Aggregate warehouse sales data (all wine types) by period
        for (let i = 0; i < warehouseSalesData.length; i++) {
          const r = warehouseSalesData[i];
          const rawMonth = r._month || "";
          const year = r._year || "";
          const salesValue = parseFloat(r.Available) || 0;
          const market = (r.AdditionalAttribute2 || "").toLowerCase().trim();
          
          if (countryFilter && market !== countryFilter) {
            continue;
          }
          
          const normalizedMonth = normalizeMonth(rawMonth);
          if (normalizedMonth && year && salesValue > 0 && market) {
            const periodKey = `${year}_${normalizedMonth}`;
            warehouseSalesByPeriod.set(periodKey, (warehouseSalesByPeriod.get(periodKey) || 0) + salesValue);
          }
        }
        
          // Aggregate sales from filtered stock data (depletion summary) by market and period
        let salesDataCount = 0;
        let missingFieldsCount = 0;
        for (let i = 0; i < filteredStock.length; i++) {
          const r = filteredStock[i];
          const rawMonth = r._month || "";
          const year = r._year || "";
          const salesValue = parseFloat(r.Available) || 0;
          // Get market/country from AdditionalAttribute2 (normalized country code)
          // This should match the countryFilter if one is set
          const market = (r.AdditionalAttribute2 || "").toLowerCase().trim();
          
          // CRITICAL: If country filter is set, ensure market matches the filter
          // This is a safety check - filteredStock should already be filtered by country
          if (countryFilter && market !== countryFilter) {
            continue; // Skip this record if market doesn't match country filter
          }
          
          // Track missing fields
          if (!rawMonth || !year) {
            missingFieldsCount++;
          }
          
          // Normalize month to consistent format (month names)
          const normalizedMonth = normalizeMonth(rawMonth);
          
          if (normalizedMonth && year && salesValue > 0 && market) {
            const periodKey = `${year}_${normalizedMonth}`;
            
            // Aggregate by period (for overall)
            filteredSalesByPeriod.set(periodKey, (filteredSalesByPeriod.get(periodKey) || 0) + salesValue);
            
            // Store in market-specific array for average calculation
            if (!salesByMarket.has(market)) {
              salesByMarket.set(market, []);
            }
            salesByMarket.get(market).push({ year, month: normalizedMonth, value: salesValue });
            salesDataCount++;
          }
        }
        
        if (missingFieldsCount > 0) {
          // Some records missing _month or _year fields
        }
        
        // Sort sales arrays by date for each market
        for (const [market, salesArray] of salesByMarket.entries()) {
          salesArray.sort((a, b) => {
            const monthOrder = monthNames.indexOf(a.month) - monthNames.indexOf(b.month);
            if (monthOrder !== 0) return monthOrder;
            return a.year.localeCompare(b.year);
          });
        }
        
        // Calculate predicted sales: Average sales from the FILTERED date range
        // CRITICAL: predictedSales should be calculated from the filtered date range (filters.dateRange)
        // - If filter is "last 6 months", calculate average from those 6 months of historical data
        // - If filter is "last 1 year", calculate average from those 12 months of historical data
        // - Use the SAME predictedSales value for all months in the graph
        // - Only recalculate when filters change
        
        let predictedSales = 0;
        
        // Get the filtered period keys from the DATE RANGE filter (not monthsToDisplay)
        // For forward predictions, monthsToDisplay shows future months, but we need historical data
        // For historical view, monthsToDisplay shows the filtered date range
        const dateRangePeriodKeys = filters.viewMode === "forward"
          ? (() => {
              // For forward predictions: Use dateRange filter to get historical periods
              const from = filters.dateRange.from;
              const to = filters.dateRange.to;
              const cur = new Date(from);
              const keys = new Set();
              while (cur <= to) {
                const month = monthNames[cur.getMonth()];
                const year = cur.getFullYear().toString();
                keys.add(`${year}_${month}`);
                cur.setMonth(cur.getMonth() + 1);
              }
              return keys;
            })()
          : new Set(monthsToDisplay.map(({ month, year }) => `${year}_${month}`));
        
        // Get all sales data from the FILTERED periods (date range)
        const filteredSalesArray = Array.from(filteredSalesByPeriod.entries())
          .map(([key, value]) => {
            const [year, month] = key.split('_');
            return { year, month, value, periodKey: key };
          })
          .filter(({ periodKey }) => dateRangePeriodKeys.has(periodKey))
          .sort((a, b) => {
            const monthOrder = monthNames.indexOf(a.month) - monthNames.indexOf(b.month);
            if (monthOrder !== 0) return monthOrder;
            return a.year.localeCompare(b.year);
          });
        
        // Predicted sales = Sum of actual sales / Count of months in filtered range
        // This gives us the average sales per month for the selected date range
        if (filteredSalesArray.length > 0) {
          // Sum = total actual sales from all filtered periods
          const sum = filteredSalesArray.reduce((total, s) => total + s.value, 0);
          // Count = number of months in the filtered range
          const count = filteredSalesArray.length;
          // Average = Sum / Count (this is the predicted sales - constant for all months)
          predictedSales = sum / count;
        }
        

        // Market-specific predictions (for wine-level distribution)
        // Use filtered periods from date range (same as overall predictedSales)
        const marketPredictions = new Map(); // key: market, value: {avgSales}
        
        // Get the filtered period keys (same as used for overall predictedSales - from dateRange filter)
        const marketFilteredPeriodKeys = dateRangePeriodKeys;
        
        for (const [market, salesArray] of salesByMarket.entries()) {
          // Filter to only include sales from periods in the FILTERED date range
          const filteredMarketSales = salesArray.filter(s => {
            const periodKey = `${s.year}_${s.month}`;
            return marketFilteredPeriodKeys.has(periodKey);
          });
          
          if (filteredMarketSales.length > 0) {
            // Sum = total sales of cases in the filtered periods
            const sum = filteredMarketSales.reduce((total, s) => total + s.value, 0);
            // Count = number of months in the filtered periods
            const count = filteredMarketSales.length;
            // Average = Sum / Count
            const avgSales = sum / count;
            
            marketPredictions.set(market, {
              avgSales
            });
          }
        }

        console.log("sales markets:", [...salesByMarket.keys()]);
        console.log("exports markets:", [...inTransitByMarketDistributorWine.values()].map(x => x.market));


        // ───────── Stock Float Projection ─────────
        // stockFloatByDistributorWine is already built from filteredStock and filteredExports
        // which were filtered by distributor, wine type, country, and year filters
        // So no need to filter again - just convert to array
        
        // Group transit items by expected arrival month
        // Key: `${year}_${month}`, Value: Map of transit items for that month
        const transitByMonth = new Map();
        const currentDate = new Date();
        const transitCurrentYear = currentDate.getFullYear();
        const transitCurrentMonth = currentDate.getMonth();
        
        // Process each export to determine which month it should be allocated to
        for (let i = 0; i < filteredExports.length; i++) {
          const e = filteredExports[i];
          const dateShipped = e.DateShipped ? parseDate(e.DateShipped.toString().trim()) : null;
          const dateArrival = e.DateArrival ? parseDate(e.DateArrival.toString().trim()) : null;
          
          // Determine expected arrival month
          let arrivalMonth = null;
          let arrivalYear = null;
          
          if (dateArrival) {
            // Use actual arrival date
            arrivalMonth = dateArrival.getMonth();
            arrivalYear = dateArrival.getFullYear();
          } else if (dateShipped) {
            // Estimate arrival based on shipping time
            // Use average shipping time from ShippingDays if available, otherwise estimate
            const shippingDays = e.ShippingDays || e.DaysInTransit || 30; // Default 30 days
            const estimatedArrival = new Date(dateShipped);
            estimatedArrival.setDate(estimatedArrival.getDate() + Math.ceil(shippingDays));
            arrivalMonth = estimatedArrival.getMonth();
            arrivalYear = estimatedArrival.getFullYear();
          } else {
            // No date info: assume current month if status indicates in transit
            const status = (e.Status || "").toLowerCase().trim();
            if (status.includes("transit") || status.includes("waiting")) {
              arrivalMonth = transitCurrentMonth;
              arrivalYear = transitCurrentYear;
            }
          }
          
          if (arrivalMonth !== null && arrivalYear !== null) {
            // Get distributor and wine code
            let customer = (e.Customer || e.Company || "Unknown").trim();
            let cleanedCustomer = customer.replace(/^[A-Z]{2,3}\s*-\s*/i, "").trim();
            if (!cleanedCustomer || cleanedCustomer === customer) {
              cleanedCustomer = customer.replace(/^[A-Z]{2,3}\s+/i, "").trim();
            }
            if (!cleanedCustomer || cleanedCustomer === customer) {
              cleanedCustomer = customer;
            }
            
            const wineCode = (e.AdditionalAttribute3 || "").toUpperCase().trim() || 
                            (e.Stock || e.ProductDescription || "").toUpperCase().trim();
            
            if (wineCode) {
              const monthKey = `${arrivalYear}_${monthNames[arrivalMonth]}`;
              const itemKey = `${cleanedCustomer.toLowerCase()}_${wineCode}`;
              
              if (!transitByMonth.has(monthKey)) {
                transitByMonth.set(monthKey, new Map());
              }
              
              const monthTransit = transitByMonth.get(monthKey);
              if (!monthTransit.has(itemKey)) {
                monthTransit.set(itemKey, {
                  distributor: cleanedCustomer,
                  wineCode: wineCode,
                  inTransit: 0,
                  brand: e.Brand || "",
                  variety: e.Variety || "",
                  country: e.AdditionalAttribute2 || e.Market || ""
                });
              }
              
              const item = monthTransit.get(itemKey);
              item.inTransit += parseFloat(e.cases) || 0;
            }
          }
        }
        
        const stockFloatArray = Array.from(stockFloatByDistributorWine.values());
        // Helper function to normalize strings for comparison (used in export inclusion check)
        const normalizeForMatch = (str) => {
          if (!str) return "";
          return String(str).toLowerCase().replace(/_/g, " ").trim();
        };
        
        // Ensure exports are included: if no stock but exports exist for filtered distributor/wine, include them
        // This handles cases where exports exist but no matching stock record
        if (distributorFilter || wineTypeFilter || wineTypeCode) {
          for (const [key, transit] of inTransitByDistributorWine.entries()) {
            const transitDistributor = normalizeForMatch(transit.distributor);
            const transitWineCode = (transit.wineCode || "").toLowerCase();
            const transitVariety = normalizeForMatch(transit.variety);
            
            // Check if this export matches the filters (strip country code prefix)
            let matchesDistributor = !distributorFilter;
            if (!matchesDistributor) {
              let transitDistributorWithoutPrefix = normalizeForMatch(transit.distributor).replace(/^[a-z]{2,3}\s*-\s*/i, "").trim();
              if (!transitDistributorWithoutPrefix || transitDistributorWithoutPrefix === normalizeForMatch(transit.distributor)) {
                transitDistributorWithoutPrefix = normalizeForMatch(transit.distributor).replace(/^[a-z]{2,3}\s+/i, "").trim();
              }
              const normalizedFilter = normalizeForMatch(distributorFilter);
              
              // Match against distributor without prefix (filter has no prefix)
              matchesDistributor = transitDistributorWithoutPrefix.includes(normalizedFilter) ||
                                   normalizedFilter.includes(transitDistributorWithoutPrefix);
            }
            
            // Check wine type match
            // Extract variety from wine code if variety is empty (for NZL data format: "BRAND_VARIETY")
            let transitVarietyExtracted = transitVariety;
            if (!transitVarietyExtracted && transitWineCode) {
              const parts = transitWineCode.split('_');
              if (parts.length > 1) {
                transitVarietyExtracted = parts.slice(1).join(' ');
              }
            }
            
            // Map wine type codes (from filter) to their full names for matching in AdditionalAttribute3
            const codeToNameMap = {
              'sab': ['sauvignon blanc', 'sauvignon', 'sab'],
              'pin': ['pinot noir', 'pin'],
              'chr': ['chardonnay', 'chr'],
              'pig': ['pinot gris', 'pinot grigio', 'pig'],
              'rose': ['rose', 'rosé'], // Include accented version
              'gru': ['gruner veltliner', 'gruner', 'gru'],
              'lhs': ['late harvest sauvignon', 'lhs'],
              'ries': ['riesling']
            };
            
            let matchesWine = !wineTypeFilter && !wineTypeCode;
            if (!matchesWine) {
              if (wineTypeCode) {
                const code = wineTypeCode.toLowerCase();
                const codeUpper = code.toUpperCase();
                
                // PRIORITY 1: Check for variety code directly (e.g., PIG, PIN, ROSE)
                if (!matchesWine) {
                  matchesWine = transitWineCode.includes(`_${code}_`) || 
                               transitWineCode.includes(`_${codeUpper}_`) ||
                               transitWineCode.startsWith(`${code}_`) || 
                               transitWineCode.startsWith(`${codeUpper}_`) ||
                               transitWineCode.endsWith(`_${code}`) ||
                               transitWineCode.endsWith(`_${codeUpper}`) ||
                               transitWineCode === code ||
                               transitWineCode === codeUpper ||
                               transitWineCode.indexOf(`_${code}_`) >= 0 ||
                               transitWineCode.indexOf(`_${codeUpper}_`) >= 0;
                }
                
                // PRIORITY 2: Check AdditionalAttribute3 (transitWineCode) for full variety names
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    // Create all possible variations
                    const variations = [
                      name,
                      name,
                      name.replace(/\s+/g, ''),
                      name.toUpperCase(),
                      name.toUpperCase(),
                      name.toUpperCase().replace(/\s+/g, '')
                    ];
                    
                    // Check if transitWineCode contains any variation
                    for (const variation of variations) {
                      if (transitWineCode.includes(variation)) {
                        matchesWine = true;
                        break;
                      }
                    }
                    if (matchesWine) break;
                  }
                }
                
                // PRIORITY 3: Check extracted variety
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    if (transitVarietyExtracted && (transitVarietyExtracted.includes(name) || name.includes(transitVarietyExtracted))) {
                      matchesWine = true;
                      break;
                    }
                  }
                }
              }
              if (!matchesWine && wineTypeFilter) {
                const filterVariations = [
                  wineTypeFilter,
                  wineTypeFilter,
                  wineTypeFilter.replace(/\s+/g, ''),
                  wineTypeFilter.toUpperCase(),
                  wineTypeFilter.toUpperCase()
                ];
                
                for (const filterVar of filterVariations) {
                  if ((transitVarietyExtracted && transitVarietyExtracted.includes(filterVar)) || 
                      transitWineCode.includes(filterVar)) {
                    matchesWine = true;
                    break;
                  }
                }
              }
            }
            
            if (matchesDistributor && matchesWine) {
              // Check if already in stockFloatArray (use normalized comparison)
              const exists = stockFloatArray.some(item => 
                normalizeForMatch(item.distributor) === transitDistributor &&
                (item.wineCode || "").toLowerCase() === transitWineCode
              );
              
              if (!exists && transit.inTransit > 0) {
                // Add export-only entry (no stock, just in-transit)
                stockFloatArray.push({
                  distributor: transit.distributor,
                  wineCode: transit.wineCode,
                  stock: 0,
                  inTransit: transit.inTransit,
                  totalStockFloat: transit.inTransit,
                  brand: transit.brand,
                  variety: transit.variety,
                  country: transit.country
                });
              }
            }
          }
        }
        // Calculate stock float per distributor and wine type
        // IMPORTANT: For historical periods, use ACTUAL sales data. For future periods, use PREDICTED sales.
        // CRITICAL: predictedSales should be the SAME for all future months - calculated once based on filter
        const stockFloatCurrentDate = new Date();
        const stockFloatCurrentYear = stockFloatCurrentDate.getFullYear();
        const stockFloatCurrentMonth = stockFloatCurrentDate.getMonth();
        
        // Pre-calculate wine-level predicted sales proportions ONCE (before the month loop)
        // This ensures the same predicted sales are used for all future months
        // Use BASE stock (without in-transit) for proportions so they stay constant
        const winePredictedSalesMap = new Map(); // key: `${distributor}_${wineCode}`, value: predictedSales
        
        // First, collect all unique wines from stockFloatArray and in-transit items
        const allWinesSet = new Map(); // key: `${distributor}_${wineCode}`, value: {stock, country, distributor, wineCode}
        
        // Add wines from stock items
        for (const item of stockFloatArray) {
          const itemKey = `${item.distributor.toLowerCase()}_${item.wineCode}`;
          if (!allWinesSet.has(itemKey)) {
            allWinesSet.set(itemKey, {
              stock: item.stock || 0,
              country: item.country,
              distributor: item.distributor,
              wineCode: item.wineCode
            });
          }
        }
        
        // Add wines from in-transit items (may not have stock yet)
        for (const transit of inTransitByDistributorWine.values()) {
          const itemKey = `${transit.distributor.toLowerCase()}_${transit.wineCode}`;
          if (!allWinesSet.has(itemKey)) {
            allWinesSet.set(itemKey, {
              stock: 0, // No stock yet, just in transit
              country: transit.country,
              distributor: transit.distributor,
              wineCode: transit.wineCode
            });
          }
        }
        
        // Calculate predicted sales for ALL wines (including transit-only ones)
        for (const [itemKey, wineData] of allWinesSet.entries()) {
          const itemMarket = (wineData.country || "").toLowerCase();
          
          // Calculate predicted sales for this wine
          // Use base stock (without in-transit) for proportions
          let winePredictedSales = 0;
          
          // Priority 1: Use market-specific average if available
          if (itemMarket && marketPredictions.has(itemMarket)) {
            const marketPred = marketPredictions.get(itemMarket);
            const marketPredictedSales = marketPred.avgSales;
            
            // Calculate total base stock for this market (without in-transit)
            const totalBaseStockForMarket = Array.from(allWinesSet.values())
              .filter(i => (i.country || "").toLowerCase() === itemMarket)
              .reduce((sum, i) => sum + i.stock, 0);
            
            if (totalBaseStockForMarket > 0) {
              // If this wine has stock, use proportion. Otherwise use equal distribution
              if (wineData.stock > 0) {
                const wineProportion = wineData.stock / totalBaseStockForMarket;
                winePredictedSales = marketPredictedSales * wineProportion;
              } else {
                // For transit-only items (no stock), distribute equally among all wines in market
                const marketItemCount = Array.from(allWinesSet.values())
                  .filter(i => (i.country || "").toLowerCase() === itemMarket).length;
                winePredictedSales = marketItemCount > 0 ? marketPredictedSales / marketItemCount : 0;
              }
            } else {
              // Equal distribution if no stock data
              const marketItemCount = Array.from(allWinesSet.values())
                .filter(i => (i.country || "").toLowerCase() === itemMarket).length;
              winePredictedSales = marketItemCount > 0 ? marketPredictedSales / marketItemCount : 0;
            }
          } 
          // Priority 2: Fallback - distribute overall predicted sales proportionally
          else {
            const totalBaseStock = Array.from(allWinesSet.values())
              .reduce((sum, i) => sum + i.stock, 0);
            
            if (totalBaseStock > 0) {
              if (wineData.stock > 0) {
                const wineProportion = wineData.stock / totalBaseStock;
                winePredictedSales = predictedSales * wineProportion;
              } else {
                // Equal distribution for transit-only items
                winePredictedSales = allWinesSet.size > 0 ? predictedSales / allWinesSet.size : 0;
              }
            } else {
              // Equal distribution if no stock data
              winePredictedSales = allWinesSet.size > 0 ? predictedSales / allWinesSet.size : 0;
            }
          }
          
          winePredictedSalesMap.set(itemKey, winePredictedSales);
        }
        
        // Track cumulative stock float for future months (subtract predictedSales once per month)
        // Month 1: Stock Float = Stock - predictedSales + In Transit
        // Month 2: Stock Float = (Month 1 Stock Float) - predictedSales + In Transit
        // Month 3: Stock Float = (Month 2 Stock Float) - predictedSales + In Transit
        const cumulativeStockFloatByItem = new Map(); // key: `${distributor}_${wineCode}`, value: stockFloat
        let previousAggregateStockFloat = undefined; // Track previous month's aggregate stock float
        
        const projection = monthsToDisplay.map(({ month, year }, idx) => {
          // Determine if this period is historical (past) or future
          const periodYear = parseInt(year);
          const periodMonthIndex = monthNames.indexOf(month);
          const isHistorical = periodYear < stockFloatCurrentYear || 
                              (periodYear === stockFloatCurrentYear && periodMonthIndex < stockFloatCurrentMonth);
          
          // For historical periods: Get actual sales from that period
          // For future periods: Use predictedSales (constant, same for all months)
          const periodKey = `${year}_${month}`;
          const actualSalesForPeriod = isHistorical ? (filteredSalesByPeriod.get(periodKey) || 0) : 0;
          
          // For future periods: Use predictedSales (constant, not cumulative)
          // We'll subtract it from the previous month's stock float
          const salesToUse = isHistorical ? actualSalesForPeriod : predictedSales;

          // Get transit items for this specific month
          const monthTransit = transitByMonth.get(periodKey) || new Map();
          
          // Build stock float array with month-specific transit data
          // Start with base stock items
          const monthStockFloatArray = stockFloatArray.map(item => {
            const itemKey = `${item.distributor.toLowerCase()}_${item.wineCode}`;
            const transitItem = monthTransit.get(itemKey);
            
            // Get transit for this month (only items arriving in this month)
            const inTransitThisMonth = transitItem ? transitItem.inTransit : 0;
            
            return {
              ...item,
              inTransit: inTransitThisMonth,
              totalStockFloat: item.stock + inTransitThisMonth
            };
          });
          
          // Add transit-only items (items that don't have stock but are in transit this month)
          for (const [itemKey, transitItem] of monthTransit.entries()) {
            const exists = monthStockFloatArray.some(item => 
              `${item.distributor.toLowerCase()}_${item.wineCode}` === itemKey
            );
            if (!exists) {
              monthStockFloatArray.push({
                distributor: transitItem.distributor,
                wineCode: transitItem.wineCode,
                stock: 0,
                inTransit: transitItem.inTransit,
                totalStockFloat: transitItem.inTransit,
                brand: transitItem.brand,
                variety: transitItem.variety,
                country: transitItem.country
              });
            }
          }

          // Limit to first 1000 items to prevent performance issues with very large datasets
          const limitedStockFloat = monthStockFloatArray;
          const distributorProjections = limitedStockFloat.map(item => {
            // Get market for this item
            const itemMarket = (item.country || "").toLowerCase();
            
            // Calculate wine-specific sales for this period
            // For historical periods: Use actual sales data for this wine/market in this period
            // For future periods: Use cumulative predicted sales (1x, 2x, 3x, etc.)
            let wineSalesForPeriod = 0;
            
            if (isHistorical) {
              // For historical periods, get actual sales for this wine/market in this period
              // We need to get actual sales from filteredStock for this specific period and wine
              // Since we don't have wine-level historical sales readily available, we'll distribute
              // the period's actual sales proportionally based on stock float
              const totalStockForMarket = monthStockFloatArray
                .filter(i => (i.country || "").toLowerCase() === itemMarket)
                .reduce((sum, i) => sum + i.totalStockFloat, 0);
              
              if (totalStockForMarket > 0 && actualSalesForPeriod > 0) {
                // Distribute actual sales proportionally based on stock float
                const wineProportion = item.totalStockFloat / totalStockForMarket;
                wineSalesForPeriod = actualSalesForPeriod * wineProportion;
              } else if (actualSalesForPeriod > 0) {
                // Equal distribution if no stock data
                const marketItemCount = monthStockFloatArray.filter(i => (i.country || "").toLowerCase() === itemMarket).length;
                wineSalesForPeriod = marketItemCount > 0 ? actualSalesForPeriod / marketItemCount : 0;
              }
            } else {
              // For future periods: Use predicted sales (constant, same for all months)
              // Get the pre-calculated monthly predicted sales for this wine
              const itemKey = `${item.distributor.toLowerCase()}_${item.wineCode}`;
              wineSalesForPeriod = winePredictedSalesMap.get(itemKey) || 0;
            }
            
            // Stock Float calculation for FORWARD PREDICTIONS:
            // Formula: Stock Float = Previous Stock Float - predictedSales + Stock in Transit
            // For historical: Stock Float = Stock - Actual Sales + In Transit
            // For future: Subtract predictedSales ONCE per month from previous month's stock float
            let stockFloat = 0;
            const itemKey = `${item.distributor.toLowerCase()}_${item.wineCode}`;
            
            if (isHistorical) {
              // Historical: Stock Float = Stock - Actual Sales + In Transit
              stockFloat = Math.max(0, item.stock - wineSalesForPeriod + item.inTransit);
            } else {
              // Future: Get previous month's stock float, subtract predictedSales once, add in-transit
              const previousStockFloat = cumulativeStockFloatByItem.get(itemKey);
              if (previousStockFloat !== undefined) {
                // Month 2+: Stock Float = Previous Stock Float - predictedSales + In Transit
                stockFloat = Math.max(0, previousStockFloat - wineSalesForPeriod + item.inTransit);
              } else {
                // Month 1: Stock Float = Stock - predictedSales + In Transit
                stockFloat = Math.max(0, item.stock - wineSalesForPeriod + item.inTransit);
              }
              // Store for next month
              cumulativeStockFloatByItem.set(itemKey, stockFloat);
            }
            
            return {
              distributor: item.distributor,
              wineCode: item.wineCode,
              brand: item.brand,
              variety: item.variety,
              country: item.country,
              stock: item.stock, // Stock on hand
              inTransit: item.inTransit, // In-transit cases for this month
              sales: wineSalesForPeriod, // Actual sales for historical, cumulative predicted sales for future
              predictedSales: isHistorical ? wineSalesForPeriod : (winePredictedSalesMap.get(`${item.distributor.toLowerCase()}_${item.wineCode}`) || 0), // Monthly predicted sales (for display)
              stockFloat: stockFloat // Distributor stock on hand - cumulative sales + in-transit
            };
          });

          // Aggregate for overall projection
          const totalStock = monthStockFloatArray.reduce((sum, item) => sum + item.stock, 0);
          const totalInTransit = monthStockFloatArray.reduce((sum, item) => sum + item.inTransit, 0);
          
          // For aggregate: Use predictedSales (constant) for future months
          // Historical: use actual sales. Future: use predictedSales (subtract once per month)
          const totalSalesForPeriod = isHistorical ? actualSalesForPeriod : predictedSales;
          
          // Calculate aggregate stock float
          // For historical: Stock Float = Total Stock - Actual Sales + In Transit
          // For future: Stock Float = Previous Total Stock Float - predictedSales + In Transit
          let totalStockFloat = 0;
          if (isHistorical) {
            totalStockFloat = Math.max(0, totalStock - totalSalesForPeriod + totalInTransit);
            previousAggregateStockFloat = totalStockFloat; // Update for next iteration
          } else {
            // For future: Use previous month's aggregate stock float
            if (previousAggregateStockFloat !== undefined) {
              // Month 2+: Stock Float = Previous Stock Float - predictedSales + In Transit
              totalStockFloat = Math.max(0, previousAggregateStockFloat - totalSalesForPeriod + totalInTransit);
            } else {
              // Month 1: Stock Float = Total Stock - predictedSales + In Transit
              totalStockFloat = Math.max(0, totalStock - totalSalesForPeriod + totalInTransit);
            }
            previousAggregateStockFloat = totalStockFloat; // Update for next iteration
          }

          return {
            period: `${month} ${year.slice(-2)}`,
            currentStock: totalStock, // Stock on hand
            inTransit: totalInTransit, // In-transit cases
            sales: totalSalesForPeriod, // Actual sales for historical, cumulative predicted sales for future
            predictedSales: isHistorical ? actualSalesForPeriod : predictedSales, // Monthly predicted sales (for display in tooltip)
            stockFloat: totalStockFloat, // Distributor stock on hand - (cumulative sales) + in-transit
            distributorProjections: distributorProjections // Per-distributor breakdown
          };
        });
        
        
        setStockFloatData(projection);
        
        // ───────── Stock Out Projection ─────────
        // Calculate months until stock hits 0 for each distributor/wine combination
        // Formula: Based on current stock + in-transit stock - projected sales per month
        const stockOutProjections = [];
        
        // Group distributor projections by distributor and wine
        const distributorWineMap = new Map();
        for (const period of projection) {
          for (const distProj of period.distributorProjections) {
            const key = `${distProj.distributor}_${distProj.wineCode}`;
            if (!distributorWineMap.has(key)) {
              distributorWineMap.set(key, {
                distributor: distProj.distributor,
                wineCode: distProj.wineCode,
                brand: distProj.brand,
                variety: distProj.variety,
                country: distProj.country,
                projections: []
              });
            }
            distributorWineMap.get(key).projections.push({
              period: period.period,
              stock: distProj.stock,
              inTransit: distProj.inTransit,
              predictedSales: distProj.predictedSales,
              stockFloat: distProj.stockFloat
            });
          }
        }
        
        // Calculate months until stock out for each distributor/wine
        for (const [key, item] of distributorWineMap.entries()) {
          // Sort projections by period (chronological order)
          const sortedProjections = [...item.projections].sort((a, b) => {
            const [monthA, yearA] = a.period.split(' ');
            const [monthB, yearB] = b.period.split(' ');
            const dateA = new Date(2000 + parseInt(yearA), monthNames.indexOf(monthA));
            const dateB = new Date(2000 + parseInt(yearB), monthNames.indexOf(monthB));
            return dateA - dateB;
          });
          
          // Calculate cumulative stock float over time
          let cumulativeStock = 0;
          let monthsUntilStockOut = null;
          
          for (let i = 0; i < sortedProjections.length; i++) {
            const proj = sortedProjections[i];
            // For first period, start with current stock + in-transit
            if (i === 0) {
              cumulativeStock = proj.stock + proj.inTransit;
            } else {
              // For subsequent periods, subtract predicted sales from previous period
              cumulativeStock = Math.max(0, cumulativeStock - (sortedProjections[i - 1].predictedSales || 0));
              // Add in-transit for this period
              cumulativeStock += proj.inTransit;
            }
            
            // Check if stock hits 0 or below
            if (cumulativeStock <= 0 && monthsUntilStockOut === null) {
              monthsUntilStockOut = i;
              break;
            }
          }
          
          // If stock never hits 0 in the projection period, calculate based on predicted sales
          if (monthsUntilStockOut === null && sortedProjections.length > 0) {
            const firstProj = sortedProjections[0];
            const initialStock = firstProj.stock + firstProj.inTransit;
            const avgPredictedSales = sortedProjections.reduce((sum, p) => sum + (p.predictedSales || 0), 0) / sortedProjections.length;
            
            if (avgPredictedSales > 0) {
              monthsUntilStockOut = Math.ceil(initialStock / avgPredictedSales);
            } else {
              monthsUntilStockOut = null; // No sales predicted, stock won't run out
            }
          }
          
          if (monthsUntilStockOut !== null) {
            stockOutProjections.push({
              distributor: item.distributor,
              wineCode: item.wineCode,
              brand: item.brand,
              variety: item.variety,
              country: item.country,
              monthsUntilStockOut: monthsUntilStockOut,
              currentStock: sortedProjections[0]?.stock || 0,
              currentInTransit: sortedProjections[0]?.inTransit || 0,
              predictedSales: sortedProjections[0]?.predictedSales || 0
            });
          }
        }
        
        // ───────── Alerts for Stock Out ─────────
        const stockOutAlerts = stockOutProjections
          .filter(proj => proj.monthsUntilStockOut !== null && proj.monthsUntilStockOut <= 3)
          .map(proj => ({
            type: 'stockout',
            severity: proj.monthsUntilStockOut <= 1 ? 'critical' : proj.monthsUntilStockOut <= 2 ? 'high' : 'medium',
            title: `Stock Out Projection: ${proj.distributor}`,
            description: `${proj.brand || ''} ${proj.variety || ''} (${proj.wineCode}) projected to run out in ${proj.monthsUntilStockOut} month${proj.monthsUntilStockOut !== 1 ? 's' : ''}. Current stock: ${Math.round(proj.currentStock)}, In transit: ${Math.round(proj.currentInTransit)}`,
            timestamp: new Date(),
            distributor: proj.distributor,
            wineCode: proj.wineCode,
            country: proj.country,
            monthsUntilStockOut: proj.monthsUntilStockOut
          }));
        
        // ───────── Forecast Accuracy ─────────
        // Calculate accuracy by comparing predicted vs actual sales
        // IMPORTANT: Use actual sales from filteredSalesByPeriod and predictedSales (constant from filter)
        // Formula: Accuracy = 100 * (1 - |predicted - actual| / max(predicted, actual))
        // This shows how close the prediction was relative to the magnitude of sales
        const accuracyData = [];
        
        for (const p of projection) {
          const { period } = p;
          
          // Get actual sales from historical data - ONLY use depletion summary data (no iDig)
          const [month, year] = period.split(' ');
          const fullYear = '20' + year;
          
          // Get actual sales from filtered sales data (depletion summary only)
          const periodKey = `${fullYear}_${month}`;
          let actualSales = filteredSalesByPeriod.get(periodKey) || 0;
          
          // CRITICAL: Use the constant predictedSales value (calculated from filtered date range)
          // This is the same value used for all months in the projection
          const forecastValue = predictedSales; // Constant predicted sales from filter
          
          // Determine if this is a historical or future period
          const periodYear = parseInt(fullYear);
          const periodMonthIndex = monthNames.indexOf(month);
          const stockFloatCurrentDate = new Date();
          const stockFloatCurrentYear = stockFloatCurrentDate.getFullYear();
          const stockFloatCurrentMonth = stockFloatCurrentDate.getMonth();
          const isHistorical = periodYear < stockFloatCurrentYear || 
                              (periodYear === stockFloatCurrentYear && periodMonthIndex < stockFloatCurrentMonth);
          
          // For forward-looking periods, show predicted sales (forecast) and actual if available
          if (!isHistorical || filters.viewMode === "forward") {
            accuracyData.push({
              period,
              actual: actualSales > 0 ? Math.round(actualSales) : 0, // Show actuals if available
              forecast: Math.round(forecastValue), // Predicted sales (constant from filter)
              accuracy: null, // Don't calculate accuracy for future periods without actuals
            });
          }
          // For historical periods, calculate accuracy if we have both actual and predicted data
          else if (actualSales > 0 && forecastValue > 0) {
            // Accuracy calculation: percentage of how close prediction was to actual
            // Formula accounts for both over-prediction and under-prediction
            const maxValue = Math.max(forecastValue, actualSales, 1); // Prevent division by zero
            const errorRatio = Math.abs(forecastValue - actualSales) / maxValue;
            const accuracy = Math.round((1 - errorRatio) * 100);
            
            accuracyData.push({
              period,
              actual: Math.round(actualSales), // Actual sales from depletion summary
              forecast: Math.round(forecastValue), // Predicted sales (constant from filter)
              accuracy: Math.max(0, Math.min(100, accuracy)), // Clamp between 0-100
            });
          }
          // For historical periods without actuals, still show forecast if available
          else if (forecastValue > 0) {
            accuracyData.push({
              period,
              actual: 0, // No actual data
              forecast: Math.round(forecastValue), // Predicted sales (constant from filter)
              accuracy: null, // Can't calculate accuracy without actuals
            });
          }
        }
        
        setForecastAccuracyData(accuracyData);
        
          // ───────── Shipping Time Analysis ─────────
          // Calculate average shipping times by distributor and freight forwarder
          // Optimize by pre-filtering
          const exportsWithShipping = [];
          for (let i = 0; i < filteredExports.length; i++) {
            const e = filteredExports[i];
            if (e.ShippingDays !== null && e.ShippingDays > 0) {
              exportsWithShipping.push(e);
            }
          }
          
          const shippingAnalysis = exportsWithShipping.reduce((acc, e) => {
            const customer = e.Customer || e.Company || "Unknown";
            const forwarder = e.FreightForwarder || "Unknown";
            
            if (!acc.byDistributor[customer]) {
              acc.byDistributor[customer] = { total: 0, count: 0, days: [] };
            }
            if (!acc.byForwarder[forwarder]) {
              acc.byForwarder[forwarder] = { total: 0, count: 0, days: [] };
            }
            
            acc.byDistributor[customer].total += e.ShippingDays;
            acc.byDistributor[customer].count += 1;
            acc.byDistributor[customer].days.push(e.ShippingDays);
            
            acc.byForwarder[forwarder].total += e.ShippingDays;
            acc.byForwarder[forwarder].count += 1;
            acc.byForwarder[forwarder].days.push(e.ShippingDays);
            
            acc.global.total += e.ShippingDays;
            acc.global.count += 1;
            acc.global.days.push(e.ShippingDays);
            
            return acc;
          }, {
            byDistributor: {},
            byForwarder: {},
            global: { total: 0, count: 0, days: [] }
          });
        
        // Calculate averages and store for potential future use
        const shippingStats = {
          global: {
            average: shippingAnalysis.global.count > 0 
              ? Math.round(shippingAnalysis.global.total / shippingAnalysis.global.count)
              : 0,
            min: shippingAnalysis.global.days.length > 0 
              ? Math.min(...shippingAnalysis.global.days) 
              : 0,
            max: shippingAnalysis.global.days.length > 0 
              ? Math.max(...shippingAnalysis.global.days) 
              : 0,
            count: shippingAnalysis.global.count
          },
          byDistributor: Object.fromEntries(
            Object.entries(shippingAnalysis.byDistributor).map(([dist, data]) => [
              dist,
              {
                average: Math.round(data.total / data.count),
                min: Math.min(...data.days),
                max: Math.max(...data.days),
                count: data.count
              }
            ])
          ),
          byForwarder: Object.fromEntries(
            Object.entries(shippingAnalysis.byForwarder).map(([forwarder, data]) => [
              forwarder,
              {
                average: Math.round(data.total / data.count),
                min: Math.min(...data.days),
                max: Math.max(...data.days),
                count: data.count
              }
            ])
          )
        };
        
        // Store shipping stats for potential future use (e.g., chatbot queries)
        localStorage.setItem('vc_shipping_stats', JSON.stringify(shippingStats));

        // ───────── Distributor Summary ─────────
        const distributorSummary = Object.values(
          filteredStock.reduce((acc, row) => {
            const location = row.Location || "Unknown";
            if (!acc[location])
              acc[location] = {
                name: location,
                region: row.AdditionalAttribute2 || "",
                current_stock: 0,
              };
            acc[location].current_stock += parseFloat(row.Available) || 0;
            return acc;
          }, {})
        );
        setDistributors(distributorSummary);

        // ───────── Alerts ─────────
        // Generate alerts for distributors with low stock float and stock out projections
        const threshold = 1000;
        const alerts = [];
        
        // Add stock out alerts (from stock out projection calculation above)
        alerts.push(...stockOutAlerts);
        
        // Check each period's distributor projections for low stock float
        projection.forEach((period) => {
          if (period.distributorProjections) {
            period.distributorProjections.forEach((distProj) => {
              if (distProj.stockFloat < threshold) {
                alerts.push({
                  id: `alert_${distProj.distributor}_${distProj.wineCode}_${period.period}`,
                  title: `Low Stock Float: ${distProj.distributor} - ${distProj.brand || ''} ${distProj.variety || distProj.wineCode}`,
                  description: `Stock float (${Math.round(distProj.stockFloat)} cases) below threshold (${threshold} cases) for ${period.period}`,
                  severity: distProj.stockFloat < 0 ? "critical" : distProj.stockFloat < threshold * 0.5 ? "warning" : "info",
                  type: "low_stock_float",
                  distributor: distProj.distributor,
                  wine_type: distProj.variety || distProj.wineCode,
                  brand: distProj.brand,
                  variety: distProj.variety,
                  country: distProj.country,
                  stockFloat: distProj.stockFloat,
                  stock: distProj.stock,
                  inTransit: distProj.inTransit,
                  period: period.period,
                  created_date: new Date().toISOString().split("T")[0],
                });
              }
            });
          }
          
          // Also add aggregate alerts for backward compatibility
          if (period.stockFloat < threshold) {
            alerts.push({
              id: `alert_aggregate_${period.period}`,
              title: `Aggregate Stock Float below threshold (${period.period})`,
              description: `Overall stock float (${Math.round(period.stockFloat)} cases) below threshold`,
              severity: period.stockFloat < 0 ? "critical" : "warning",
              type: "low_stock_float_aggregate",
              distributor: filters.distributor === "all" ? "All Distributors" : filters.distributor,
              wine_type: filters.wineType === "all" ? "All Wine Types" : filters.wineType,
              stockFloat: period.stockFloat,
              period: period.period,
              created_date: new Date().toISOString().split("T")[0],
            });
          }
        });
        
        setAlerts(alerts);
        
        // ───────── Warehouse Stock Projection ─────────
        // Calculate warehouse stock projection: Available = On Hand - (Allocated + Pending) - Projected Sales
        // This shows what stock we will have available at future dates
        const warehouseStockProjection = [];
        
        // Load warehouse stock data - aggregate from all sheets if needed
        let warehouseStockData = [];
        if (warehouseStock && Array.isArray(warehouseStock)) {
          warehouseStockData = warehouseStock;
        } else {
          // Try loading from individual sheets
          const warehouseMetadataRaw = localStorage.getItem("vc_warehouse_stock_metadata");
          if (warehouseMetadataRaw) {
            try {
              const metadata = JSON.parse(warehouseMetadataRaw);
              if (metadata.sheetNames && Array.isArray(metadata.sheetNames)) {
                metadata.sheetNames.forEach(sheetName => {
                  const sheetKey = `vc_warehouse_stock_data_${sheetName}`;
                  const sheetData = localStorage.getItem(sheetKey);
                  if (sheetData) {
                    try {
                      const parsed = JSON.parse(sheetData);
                      if (Array.isArray(parsed)) {
                        warehouseStockData.push(...parsed);
                      }
                    } catch (e) {
                      // Error parsing warehouse stock sheet
                    }
                  }
                });
              }
            } catch (e) {
              // Error parsing warehouse stock metadata
            }
          }
        }
        
        console.log(
          "WAREHOUSE unique market-ish fields:",
          [...new Set(warehouseStockData.map(x => (x.Market || x.AdditionalAttribute2 || x._sheetName || "").toString().trim()))]
        );
        
        console.log("WAREHOUSE sheets actually loaded:", [...new Set(warehouseStockData.map(r => r._sheetName))]);

        
        if (warehouseStockData && Array.isArray(warehouseStockData) && warehouseStockData.length > 0) {
          // Filter warehouse stock by country and wine type
          // Note: warehouse stock data uses OnHand, Allocated, Pending, Available (capitalized)
          // and Market/AdditionalAttribute2 for country
          const filteredWarehouseStock = warehouseStockData.filter(item => {
            // Skip items without stock data
            const hasStockData = (item.OnHand || item.onHand || 0) > 0 || 
                                 (item.Available || item.available || 0) > 0;
            if (!hasStockData) {
              return false;
            }
            
            // Filter by country (if selected)
            if (countryFilter) {
              const rawCountryCode = (item.Market || item.AdditionalAttribute2 || item.market || item.additionalAttribute2 || "");
              const countryCode = normalizeCountryCode(rawCountryCode).toLowerCase();
              const normalizedFilter = normalizeCountryCode(countryFilter).toLowerCase();
              if (countryCode !== normalizedFilter) {
                return false;
              }
            }
            
            // Filter by wine type (if selected)
            if (wineTypeFilter && wineTypeFilter !== "all" && wineTypeCode) {
              const itemVariety = (item.VarietyCode || item.ProductName || item.variety || item.productName || "").toLowerCase();
              const itemCode = (item.Code || item.AdditionalAttribute3 || item.code || item.additionalAttribute3 || "").toLowerCase();
              
              // Use the same sophisticated matching logic as other filters
              const code = wineTypeCode.toLowerCase();
              const codeUpper = code.toUpperCase();
              
              let matchesWine = false;
              
              // Check exact match
              if (!matchesWine) {
                matchesWine = itemCode === code ||
                             itemCode === codeUpper ||
                             itemCode.trim() === code ||
                             itemCode.trim() === codeUpper;
              }
              
              // Check compound formats
              if (!matchesWine) {
                matchesWine = itemCode.includes(`_${code}_`) || 
                             itemCode.includes(`_${codeUpper}_`) ||
                             itemCode.startsWith(`${code}_`) || 
                             itemCode.startsWith(`${codeUpper}_`) ||
                             itemCode.endsWith(`_${code}`) ||
                             itemCode.endsWith(`_${codeUpper}`);
              }
              
              // Normalize and check
              if (!matchesWine) {
                const normalizedItemCode = normalizeWineTypeToCode(itemCode.toUpperCase()).toLowerCase();
                if (normalizedItemCode === code || normalizedItemCode === codeUpper) {
                  matchesWine = true;
                }
              }
              
              // Check full variety names
              const codeToNameMap = {
                'sab': ['sauvignon blanc', 'sauvignon', 'sab'],
                'pin': ['pinot noir', 'pin'],
                'chr': ['chardonnay', 'chr'],
                'pig': ['pinot gris', 'pinot grigio', 'pig'],
                'rose': ['rose', 'rosé'],
                'gru': ['gruner veltliner', 'gruner', 'gru'],
                'lhs': ['late harvest sauvignon', 'lhs'],
                'ries': ['riesling']
              };
              
              if (!matchesWine && codeToNameMap[code]) {
                for (const name of codeToNameMap[code]) {
                  const variations = [
                    name,
                    name.replace(/\s+/g, ''),
                    name.toUpperCase(),
                    name.toUpperCase().replace(/\s+/g, '')
                  ];
                  
                  for (const variation of variations) {
                    if (itemCode.includes(variation.toLowerCase()) || 
                        itemVariety.includes(variation.toLowerCase())) {
                      matchesWine = true;
                      break;
                    }
                  }
                  if (matchesWine) break;
                }
              }
              
              if (!matchesWine) {
                return false;
              }
            }
            
            return true;
          });
          
          // Group by distributor (AdditionalAttribute2) and wine code
          // IMPORTANT: 
          // - Stock value is "Available" field (not OnHand)
          // - AdditionalAttribute2 is distributor name
          // - This shows what stock we will have on hand at future dates
          const warehouseStockByDistributorWine = new Map();
          filteredWarehouseStock.forEach(item => {
            // Get distributor name from AdditionalAttribute2
            // CRITICAL: Normalize distributor name to match Stock Float Projection format
            // Warehouse stock uses country codes (usa, ire, nzl, au-b), but we need to map to distributor names (USA, IRE, NZL, AU-B)
            let rawDistributorName = (item.AdditionalAttribute2 || item.additionalAttribute2 || item.Market || item.market || "").trim();
            if (!rawDistributorName) return;
            
            // Normalize distributor name to match Stock Float Projection format (USA, IRE, NZL, AU-B)
            // This ensures the lookup key matches winePredictedSalesMap keys
            let distributorName = rawDistributorName.toUpperCase();
            if (distributorName === 'USA' || distributorName === 'US' || distributorName.includes('USA')) {
              distributorName = 'USA';
            } else if (distributorName === 'IRE' || distributorName === 'IRELAND' || distributorName.includes('IRE')) {
              distributorName = 'IRE';
            } else if (distributorName === 'NZ' || distributorName === 'NZL' || distributorName === 'NEW ZEALAND' || distributorName.includes('NZ')) {
              distributorName = 'NZL';
            } else if (distributorName === 'AU-B' || distributorName === 'AUB' || distributorName.includes('AU-B')) {
              distributorName = 'AU-B';
            } else {
              // Fallback: use normalized country code
              distributorName = normalizeCountryCode(rawDistributorName).toUpperCase();
            }
            
            // Get wine code - PRIORITY: Use AdditionalAttribute3 (wine type code) first, not Code (product code) or ProductName (brand)
            // AdditionalAttribute3 should contain the wine type code (SAB, PIN, CHR, etc.) from normalizeWarehouseStockData
            let wineCode = (item.AdditionalAttribute3 || item.additionalAttribute3 || "").toUpperCase().trim();
            
            // If AdditionalAttribute3 is empty, try to get it from VarietyCode
            if (!wineCode) {
              wineCode = (item.VarietyCode || item.varietyCode || "").toUpperCase().trim();
            }
            
            // If still empty, try to normalize from Variety field
            if (!wineCode && item.Variety) {
              wineCode = normalizeWineTypeToCode(item.Variety).toUpperCase();
            }
            
            // Skip if we still don't have a valid wine type code
            if (!wineCode) return;
            
            // Create key: distributor_wineCode (use lowercase for key matching)
            const key = `${distributorName.toLowerCase()}_${wineCode}`;
            
            // Get wine type name for display (use Variety or map from code)
            const wineTypeNameMap = {
              'SAB': 'Sauvignon Blanc',
              'PIN': 'Pinot Noir',
              'CHR': 'Chardonnay',
              'PIG': 'Pinot Gris',
              'ROS': 'Rose',
              'GRU': 'Gruner Veltliner',
              'LHS': 'Late Harvest Sauvignon',
              'RIES': 'Riesling'
            };
            const wineTypeName = wineTypeNameMap[wineCode] || item.Variety || wineCode;
            
            if (!warehouseStockByDistributorWine.has(key)) {
              warehouseStockByDistributorWine.set(key, {
                distributor: distributorName, // Distributor name from AdditionalAttribute2
                wineCode: wineCode, // Wine type code (SAB, PIN, etc.)
                brand: item.Brand || item.brand || "",
                variety: wineTypeName, // Wine type name for display
                country: item.Market || item.AdditionalAttribute2 || item.market || item.additionalAttribute2 || "",
                onHand: 0,
                allocated: 0,
                pending: 0,
                available: 0 // This is the primary stock value we care about
              });
            }
            
            const wineStock = warehouseStockByDistributorWine.get(key);
            // Handle both capitalized and lowercase field names
            wineStock.onHand += parseFloat(item.OnHand || item.onHand || 0);
            wineStock.allocated += parseFloat(item.Allocated || item.allocated || 0);
            wineStock.pending += parseFloat(item.Pending || item.pending || 0);
            // IMPORTANT: Use Available field as the stock value
            wineStock.available += parseFloat(item.Available || item.available || 0);
          });
          
          // Convert to wine-only map for backward compatibility (grouping by wine across all distributors)
          // Group by wine type name (variety) for display, not wineCode
          const warehouseStockByWine = new Map();
          warehouseStockByDistributorWine.forEach((wineStock, key) => {
            // Use wine type name (variety) as the key for grouping, not wineCode
            const wineTypeName = wineStock.variety || wineStock.wineCode;
            if (!warehouseStockByWine.has(wineTypeName)) {
              warehouseStockByWine.set(wineTypeName, {
                wineCode: wineStock.wineCode,
                brand: wineStock.brand,
                variety: wineTypeName, // Use wine type name for display
                country: wineStock.country,
                onHand: 0,
                allocated: 0,
                pending: 0,
                available: 0
              });
            }
            const aggregated = warehouseStockByWine.get(wineTypeName);
            aggregated.onHand += wineStock.onHand;
            aggregated.allocated += wineStock.allocated;
            aggregated.pending += wineStock.pending;
            aggregated.available += wineStock.available;
          });
          
          
          // CRITICAL: For warehouse stock projection, use the EXACT SAME predicted sales as Stock Float Projection
          // Use winePredictedSalesMap directly - don't create a separate map!
          // Calculate projection for each month
          // IMPORTANT: Use "Available" field as the stock value (not OnHand)
          // Formula: Projected Available = Current Available - Projected Sales (per month)
          // This shows what stock we will have available at future dates
          // CRITICAL: Use the SAME TOTAL predictedSales value as Stock Float Projection
          // Track cumulative TOTAL projected available for future months (subtract TOTAL predictedSales once per month)
          // Month 1: Total Projected Available = Total Initial Available - TOTAL predictedSales
          // Month 2+: Total Projected Available = Previous Total Projected Available - TOTAL predictedSales
          // This matches Stock Float Projection logic exactly (uses aggregate predictedSales, not wine-specific)
          let previousTotalProjectedAvailable = undefined;
          
          // Calculate initial total available stock
          const initialTotalAvailable = Array.from(warehouseStockByDistributorWine.values())
            .reduce((sum, wineStock) => sum + wineStock.available, 0);
          
          monthsToDisplay.forEach(({ month, year }, monthIndex) => {
            // Use the EXACT SAME predictedSales logic as Stock Float Projection
            // Historical: use actual sales from that period
            // Forward: use predictedSales (constant value) - THIS IS THE TOTAL, NOT WINE-SPECIFIC
            const periodKey = `${year}_${month}`;
            const isHistorical = filters.viewMode === "historical";
            const actualSalesForPeriod = isHistorical ? (filteredSalesByPeriod.get(periodKey) || 0) : 0;
            const totalPredictedSalesForPeriod = isHistorical ? actualSalesForPeriod : predictedSales;
            
            const warehouseProjection = {
              period: `${month} ${year.slice(-2)}`,
              predictedSales: totalPredictedSalesForPeriod, // EXACT SAME TOTAL predictedSales as Stock Float Projection
              wines: []
            };
            
            // Calculate total projected available for this month (aggregate level, like Stock Float)
            let totalProjectedAvailable = 0;
            if (filters.viewMode === "forward") {
              // EXACT SAME logic as Stock Float Projection aggregate
              // Formula: Total Projected Available = Previous Total Projected Available - TOTAL predictedSales
              // Month 1: Total Projected Available = Total Initial Available - TOTAL predictedSales
              // Month 2+: Total Projected Available = Previous Total Projected Available - TOTAL predictedSales
              if (previousTotalProjectedAvailable !== undefined) {
                // Month 2+: Get previous month's total projected available, subtract TOTAL predicted sales
                totalProjectedAvailable = Math.max(0, previousTotalProjectedAvailable - totalPredictedSalesForPeriod);
              } else {
                // Month 1: Start with initial total available stock, subtract TOTAL predicted sales
                totalProjectedAvailable = Math.max(0, initialTotalAvailable - totalPredictedSalesForPeriod);
              }
              // Store for next month
              previousTotalProjectedAvailable = totalProjectedAvailable;
            } else {
              // For historical view: Just show current total available stock (no projections)
              totalProjectedAvailable = initialTotalAvailable;
            }
            
            // Distribute total projected available proportionally to each wine based on initial proportions
            // This maintains the relative distribution while applying the total subtraction
            warehouseStockByDistributorWine.forEach((wineStock, key) => {
              // Calculate proportion of this wine's initial stock relative to total initial stock
              const wineProportion = initialTotalAvailable > 0 
                ? wineStock.available / initialTotalAvailable 
                : (1 / warehouseStockByDistributorWine.size); // Equal distribution if no initial stock
              
              // Distribute the total projected available proportionally
              const projectedAvailable = totalProjectedAvailable * wineProportion;
              
              // Get wine-specific predicted sales for display purposes (but we use TOTAL for calculation)
              const itemKey = `${wineStock.distributor.toLowerCase()}_${wineStock.wineCode}`;
              const winePredictedSales = winePredictedSalesMap.get(itemKey) || 0;
              
              warehouseProjection.wines.push({
                distributor: wineStock.distributor, // Distributor name from AdditionalAttribute2
                wineCode: wineStock.wineCode,
                brand: wineStock.brand,
                variety: wineStock.variety,
                country: wineStock.country,
                onHand: wineStock.onHand, // Initial on-hand stock
                allocated: wineStock.allocated,
                pending: wineStock.pending,
                available: wineStock.available, // Initial available stock (from Available field)
                currentAvailable: wineStock.available, // Initial available for reference
                predictedSales: winePredictedSales, // Wine-specific predicted sales (for display)
                projectedAvailable: projectedAvailable, // Proportionally distributed projected available (after subtracting TOTAL predictedSales)
                monthsStockOnHand: totalPredictedSalesForPeriod > 0 
                  ? totalProjectedAvailable / totalPredictedSalesForPeriod 
                  : (totalProjectedAvailable > 0 ? Infinity : 0)
              });
            });
            
            warehouseStockProjection.push(warehouseProjection);
          });
          
        }
        
        // Store warehouse stock projection for potential future use
        setWarehouseStockProjection(warehouseStockProjection);

        // ───────── KPIs ─────────
        const lastIdx = projection.length - 1;
        const prevIdx = Math.max(0, lastIdx - 1);

        const avgFloatNow = Number(projection[lastIdx]?.stockFloat || 0);
        const avgFloatPrev = Number(projection[prevIdx]?.stockFloat || 0);
        const forecastAccNow = Number(
          accuracyData.length > 0
            ? accuracyData[accuracyData.length - 1].accuracy
            : 0
        );
        const forecastAccPrev = Number(
          accuracyData.length > 1
            ? accuracyData[accuracyData.length - 2].accuracy
            : 0
        );
        const criticalNow = Number(
          alerts.filter((a) => a.severity === "critical").length
        );
        const criticalPrev = Number(Math.max(0, criticalNow - 1));
        const atRiskNow = Number(alerts.length);
        const atRiskPrev = Number(Math.max(0, atRiskNow - 1));

          setKpiValues({
            avgFloatNow,
            avgFloatPrev,
            forecastAccNow,
            forecastAccPrev,
            criticalNow,
            criticalPrev,
            atRiskNow,
            atRiskPrev,
          });
          
          setIsProcessing(false);
        } catch (err) {
          setIsProcessing(false);
        }
      });
    };

    loadAndProcessData();
    const handler = () => loadAndProcessData();
    window.addEventListener("vc:data:uploaded", handler);
    return () => window.removeEventListener("vc:data:uploaded", handler);
  }, [filters, rawData]);

  // Debounce filter changes to prevent excessive recalculations
  const filterTimeoutRef = React.useRef(null);
  
  const handleFilterChange = useCallback((type, value) => {
    // Clear existing timeout
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }
    
    // Debounce filter changes by 150ms to prevent lag
    filterTimeoutRef.current = setTimeout(() => {
      setFilters((prev) => {
        // If country is changing, reset appropriate filters
        if (type === 'country') {
            // When switching away from USA, reset state filter
            return { ...prev, [type]: value, distributor: 'all', state: 'all' };
        }
        return { ...prev, [type]: value };
      });
    }, 150);
  }, []);
  
  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, []);

  const {
    avgFloatNow = 0,
    avgFloatPrev = 0,
    forecastAccNow = 0,
    forecastAccPrev = 0,
    criticalNow = 0,
    criticalPrev = 0,
    atRiskNow = 0,
    atRiskPrev = 0,
  } = kpiValues;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {isProcessing && (
          <div className="fixed top-16 sm:top-4 right-2 sm:right-4 bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span className="hidden sm:inline">Processing data...</span>
            <span className="sm:hidden">Processing...</span>
          </div>
        )}
        <FilterBar filters={filters} onFilterChange={handleFilterChange} />

        {/* KPI Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <KPITile
            title="Avg Stock Float"
            value={avgFloatNow}
            previousValue={avgFloatPrev}
            unit="cases"
            trend={avgFloatNow > avgFloatPrev ? "up" : avgFloatNow < avgFloatPrev ? "down" : "neutral"}
            status={avgFloatNow < 500 ? "warning" : "healthy"}
          />
          <KPITile
            title="Forecast Accuracy"
            value={forecastAccNow}
            previousValue={forecastAccPrev}
            unit="%"
            trend={forecastAccNow > forecastAccPrev ? "up" : forecastAccNow < forecastAccPrev ? "down" : "neutral"}
            status={forecastAccNow > 80 ? "healthy" : "warning"}
          />
          <KPITile
            title="Months till Stock Out"
            value={criticalNow}
            previousValue={criticalPrev}
            unit="alerts"
            trend={criticalNow > criticalPrev ? "up" : criticalNow < criticalPrev ? "down" : "neutral"}
            status={criticalNow > 0 ? "critical" : "healthy"}
          />
          <KPITile
            title="Distributors at Risk"
            value={atRiskNow}
            previousValue={atRiskPrev}
            unit="distributors"
            trend={atRiskNow > atRiskPrev ? "up" : atRiskNow < atRiskPrev ? "down" : "neutral"}
            status={atRiskNow > 2 ? "warning" : "healthy"}
          />
        </div>

        {/* Charts + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <StockFloatChart
              data={stockFloatData}
              threshold={1000}
              distributor={filters.distributor}
              wineType={filters.wineType}
            />
            <ForecastAccuracyChart data={forecastAccuracyData} />
            <WarehouseStockProjectionChart data={warehouseStockProjection} />
          </div>
          <div className="lg:col-span-1">
            <AlertsFeed alerts={alerts} />
          </div>
        </div>

        <DistributorMap distributors={distributors} />
      </div>

      <DrilldownModal
        isOpen={!!selectedKPI}
        onClose={() => setSelectedKPI(null)}
        title={selectedKPI?.metric_name}
        data={drilldownData}
      />
    </div>
  );
}
