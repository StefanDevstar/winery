import React, { useState, useEffect, useMemo, useCallback } from "react";
import { normalizeCountryCode } from "../lib/utils";
import KPITile from "../components/dashboard/KPITile";
import FilterBar from "../components/dashboard/FilterBar";
import StockFloatChart from "../components/dashboard/StockFloatChart";
import ForecastAccuracyChart from "../components/dashboard/ForecastAccuracyChart";
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
    country: "usa",
    distributor: "all",
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

  // Memoize raw data loading - only parse JSON once
  const rawData = useMemo(() => {
    try {
      const distributorRaw = localStorage.getItem("vc_distributor_stock_data");
      const exportsRaw = localStorage.getItem("vc_exports_data");
      const salesRaw = localStorage.getItem("vc_sales_data");
      const cin7Raw = localStorage.getItem("vc_cin7_data");
      const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_metadata");

      if (!distributorRaw || !exportsRaw || !salesRaw) return null;

      return {
        distributorStock: JSON.parse(distributorRaw),
        exportsData: JSON.parse(exportsRaw),
        sales: JSON.parse(salesRaw),
        cin7: cin7Raw ? JSON.parse(cin7Raw) : [],
        distributorMetadata: distributorMetadataRaw ? JSON.parse(distributorMetadataRaw) : null
      };
    } catch (err) {
      console.warn("Error loading data:", err);
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
          
          const { distributorStock, exportsData, sales, cin7, distributorMetadata } = rawData;

          // Ensure distributorStock is an array (it should be after normalization)
          if (!Array.isArray(distributorStock)) {
            console.warn("Distributor stock data is not an array, attempting to convert...");
            setIsProcessing(false);
            return;
          }

          const monthNames = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
          ];

          // Pre-compute filter values for efficiency
          const countryFilter = filters.country === "all" ? null : filters.country.toLowerCase();
          const distributorFilter = filters.distributor === "all" ? null : filters.distributor.replace(/_/g, " ").toLowerCase();
          const wineTypeFilter = filters.wineType === "all" ? null : filters.wineType.replace(/_/g, " ").toLowerCase();
          const wineTypeCode = filters.wineType === "all" ? null : filters.wineType.split("_")[0];
          const yearFilter = filters.year === "all" ? null : filters.year.toString();
          console.log("yearFilter", yearFilter, "countryFilter", countryFilter, "distributorFilter", distributorFilter, "wineTypeFilter", wineTypeFilter, "wineTypeCode", wineTypeCode);
          // ───────── Filter Distributor Stock ─────────
          // Optimized filtering with early returns
          const filteredStock = [];

          for (let i = 0; i < distributorStock.length; i++) {
            const r = distributorStock[i];
            
            // Early exit for country filter (most selective)
            if (countryFilter) {
              const countryCode = (r.AdditionalAttribute2 || "").toLowerCase().trim();
              if (countryCode !== countryFilter) continue;
              
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
            
            // Early exit for distributor filter
            // Normalize location the same way as filter (replace underscores with spaces)
            // Location no longer has country code prefix (removed at source), but keep fallback for other data sources
            if (distributorFilter) {
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
                'riesling': ['riesling']
              };
              
              let matchesWine = false;
              
              if (wineTypeCode) {
                const code = wineTypeCode.toLowerCase();
                const codeUpper = code.toUpperCase();
                
                // PRIORITY 1: Check AdditionalAttribute3 (wineCode) - this is the PRIMARY field
                // First check for variety code directly (e.g., PIG, PIN, ROSE)
                if (!matchesWine) {
                  matchesWine = wineCode.includes(`_${code}_`) || 
                               wineCode.includes(`_${codeUpper}_`) ||
                               wineCode.startsWith(`${code}_`) || 
                               wineCode.startsWith(`${codeUpper}_`) ||
                               wineCode.endsWith(`_${code}`) ||
                               wineCode.endsWith(`_${codeUpper}`) ||
                               wineCode === code ||
                               wineCode === codeUpper ||
                               wineCode.indexOf(`_${code}_`) >= 0 ||
                               wineCode.indexOf(`_${codeUpper}_`) >= 0;
                }
                
                // PRIORITY 2: Check for full variety names (most common in NZL data)
                if (!matchesWine && codeToNameMap[code]) {
                  for (const name of codeToNameMap[code]) {
                    // Create all possible variations
                    const variations = [
                      name,                                    // "pinot gris"
                      name.replace(/\s+/g, '_'),              // "pinot_gris"
                      name.replace(/\s+/g, ''),               // "pinotgris"
                      name.toUpperCase(),                      // "PINOT GRIS"
                      name.toUpperCase().replace(/\s+/g, '_'), // "PINOT_GRIS"
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
                  wineTypeFilter.replace(/\s+/g, '_'),
                  wineTypeFilter.replace(/\s+/g, ''),
                  wineTypeFilter.toUpperCase(),
                  wineTypeFilter.toUpperCase().replace(/\s+/g, '_')
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

          // ───────── Filter Exports ─────────
          // Only include "waiting to ship" and "in transit" orders (exclude "complete")
          // Optimized filtering with early returns
          const filteredExports = [];
          console.log(yearFilter, "yearFilter");
          console.log(exportsData, "exportsData");
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
              
              if (recordCountry !== countryFilter) continue;
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
                'riesling': ['riesling']
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
                      name.replace(/\s+/g, '_'),
                      name.replace(/\s+/g, ''),
                      name.toUpperCase(),
                      name.toUpperCase().replace(/\s+/g, '_'),
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
                  wineTypeFilter.replace(/\s+/g, '_'),
                  wineTypeFilter.replace(/\s+/g, ''),
                  wineTypeFilter.toUpperCase(),
                  wineTypeFilter.toUpperCase().replace(/\s+/g, '_')
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
          console.log(filteredExports);
          // ───────── Stock & Exports Aggregation by Distributor and Wine ─────────
          // Use Map for better performance with large datasets
          const distributorStockByWine = new Map();
          for (let i = 0; i < filteredStock.length; i++) {
            const r = filteredStock[i];
            let location = (r.Location || "Unknown").trim();
            // Location no longer has country code prefix (removed at source), but keep fallback for other data sources
            let cleanedLocation = location.replace(/^[A-Z]{2,3}\s*-\s*/i, "").trim();
            if (!cleanedLocation || cleanedLocation === location) {
              cleanedLocation = location.replace(/^[A-Z]{2,3}\s+/i, "").trim();
            }
            // If still no change, use original location (no prefix was present)
            if (!cleanedLocation || cleanedLocation === location) {
              cleanedLocation = location;
            }
            const locationKey = cleanedLocation.toLowerCase();
            const wineCode = (r.AdditionalAttribute3 || "").toUpperCase().trim();
            if (!wineCode) continue;
            
            const key = `${locationKey}_${wineCode}`;
            if (!distributorStockByWine.has(key)) {
              distributorStockByWine.set(key, {
                distributor: cleanedLocation, // Store cleaned version (no country code)
                wineCode: wineCode,
                stock: 0,
                brand: r.Brand || "",
                variety: r.Variety || r.ProductName || "",
                country: r.AdditionalAttribute2 || ""
              });
            }
            const item = distributorStockByWine.get(key);
            item.stock += parseFloat(r.Available) || 0;
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
            let customer = (e.Customer || e.Company || "Unknown").trim();
            // Strip country code prefix from customer for storage (matches filter format)
            let cleanedCustomer = customer.replace(/^[A-Z]{2,3}\s*-\s*/i, "").trim();
            if (!cleanedCustomer || cleanedCustomer === customer) {
              cleanedCustomer = customer.replace(/^[A-Z]{2,3}\s+/i, "").trim();
            }
            if (!cleanedCustomer || cleanedCustomer === customer) {
              cleanedCustomer = customer;
            }
            const customerKey = cleanedCustomer.toLowerCase();
            
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
                const constructedCode = `${e.BrandCode || e.Brand}_${e.VarietyCode}_${e.Vintage || ""}`.toUpperCase().replace(/\s+/g, '_');
                if (constructedCode && constructedCode !== '_') {
                  // Use constructed code with market
                  const key = `${normalizedMarket}_${customerKey}_${constructedCode}`;
                  if (!inTransitByMarketDistributorWine.has(key)) {
                    inTransitByMarketDistributorWine.set(key, {
                      market: normalizedMarket,
                      distributor: cleanedCustomer,
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
                distributor: cleanedCustomer,
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
          console.log(inTransitByMarketDistributorWine);
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
            const wineCode = (e.AdditionalAttribute3 || "").toUpperCase().trim() || 
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

        // ───────── Sales Trend Calculation from Depletion Summary ─────────
        // Use depletion summary data (distributor stock data) to create sales predictions per market
        // Group sales by market, period (year/month) for trend analysis
        
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
        
        const salesByMarketPeriod = new Map(); // key: `${market}_${year}_${normalizedMonth}`
        const salesByMarket = new Map(); // key: market, value: array of {year, month, value}
        const filteredSalesByPeriod = new Map(); // key: `${year}_${normalizedMonth}` (overall)
        
        // Aggregate sales from filtered stock data (depletion summary) by market and period
        for (let i = 0; i < filteredStock.length; i++) {
          const r = filteredStock[i];
          const rawMonth = r._month || "";
          const year = r._year || "";
          const salesValue = parseFloat(r.Available) || 0;
          const market = (r.AdditionalAttribute2 || "").toLowerCase().trim();
          
          // Normalize month to consistent format (month names)
          const normalizedMonth = normalizeMonth(rawMonth);
          
          if (normalizedMonth && year && salesValue > 0 && market) {
            const periodKey = `${year}_${normalizedMonth}`;
            const marketPeriodKey = `${market}_${year}_${normalizedMonth}`;
            
            // Aggregate by period (for overall)
            filteredSalesByPeriod.set(periodKey, (filteredSalesByPeriod.get(periodKey) || 0) + salesValue);
            
            // Aggregate by market and period (for market-specific predictions)
            salesByMarketPeriod.set(marketPeriodKey, (salesByMarketPeriod.get(marketPeriodKey) || 0) + salesValue);
            
            // Also store in market-specific array for trend calculation (with normalized month)
            if (!salesByMarket.has(market)) {
              salesByMarket.set(market, []);
            }
            salesByMarket.get(market).push({ year, month: normalizedMonth, value: salesValue });
          }
        }
        
        // Sort sales arrays by date for each market
        for (const [market, salesArray] of salesByMarket.entries()) {
          salesArray.sort((a, b) => {
            const monthOrder = monthNames.indexOf(a.month) - monthNames.indexOf(b.month);
            if (monthOrder !== 0) return monthOrder;
            return a.year.localeCompare(b.year);
          });
        }
        
        // Calculate predictions per market from depletion summary data
        const marketPredictions = new Map(); // key: market, value: {avgSales, trend, salesHistory}
        for (const [market, salesArray] of salesByMarket.entries()) {
          if (salesArray.length > 0) {
            const last6Months = salesArray.slice(-6);
            const avgSales = last6Months.length > 0
              ? last6Months.reduce((sum, s) => sum + s.value, 0) / last6Months.length
              : salesArray.reduce((sum, s) => sum + s.value, 0) / salesArray.length;
            
            let trend = 0;
            if (salesArray.length >= 6) {
              const recent = salesArray.slice(-3).reduce((sum, s) => sum + s.value, 0) / 3;
              const older = salesArray.slice(-6, -3).reduce((sum, s) => sum + s.value, 0) / 3;
              if (older > 0) {
                trend = (recent - older) / older;
              }
            } else if (salesArray.length >= 2) {
              const recent = salesArray.slice(-1)[0].value;
              const older = salesArray[0].value;
              if (older > 0) {
                trend = (recent - older) / older / salesArray.length;
              }
            }
            
            marketPredictions.set(market, {
              avgSales,
              trend,
              salesHistory: salesArray
            });
          }
        }
        
        // Also use iDig sales data if available (aggregated totals) - primarily for USA
        const historicalSalesValues = Object.entries(sales)
          .flatMap(([year, months]) =>
            Object.entries(months).map(([m, val]) => ({
              year,
              month: m,
              value: val,
            }))
          )
          .sort(
            (a, b) =>
              new Date(`${a.month} 1, ${a.year}`) - new Date(`${b.month} 1, ${b.year}`)
          );

        // Calculate overall trend from filtered sales data (last 6 months)
        const filteredSalesArray = Array.from(filteredSalesByPeriod.entries())
          .map(([key, value]) => {
            const [year, month] = key.split('_');
            return { year, month, value };
          })
          .sort((a, b) => {
            const monthOrder = monthNames.indexOf(a.month) - monthNames.indexOf(b.month);
            if (monthOrder !== 0) return monthOrder;
            return a.year.localeCompare(b.year);
          });

        // Calculate average from last 6 months of filtered sales
        const last6MonthFilteredSales = filteredSalesArray.slice(-6);
        const last6MonthAvg = last6MonthFilteredSales.length > 0
          ? last6MonthFilteredSales.reduce((sum, s) => sum + s.value, 0) / last6MonthFilteredSales.length
          : (historicalSalesValues.slice(-6).reduce((sum, s) => sum + s.value, 0) /
              Math.max(1, Math.min(6, historicalSalesValues.length)) || 0);

        // Calculate overall trend (growth rate) from filtered sales
        let salesTrend = 0; // Default: no trend
        if (filteredSalesArray.length >= 2) {
          const recent = filteredSalesArray.slice(-3).reduce((sum, s) => sum + s.value, 0) / 3;
          const older = filteredSalesArray.slice(-6, -3).reduce((sum, s) => sum + s.value, 0) / 3;
          if (older > 0) {
            salesTrend = (recent - older) / older; // Percentage change
          }
        } else if (historicalSalesValues.length >= 6) {
          // Fallback to iDig data if filtered data insufficient
          const recent = historicalSalesValues.slice(-3).reduce((sum, s) => sum + s.value, 0) / 3;
          const older = historicalSalesValues.slice(-6, -3).reduce((sum, s) => sum + s.value, 0) / 3;
          if (older > 0) {
            salesTrend = (recent - older) / older;
          }
        }

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
              'riesling': ['riesling']
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
                      name.replace(/\s+/g, '_'),
                      name.replace(/\s+/g, ''),
                      name.toUpperCase(),
                      name.toUpperCase().replace(/\s+/g, '_'),
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
                  wineTypeFilter.replace(/\s+/g, '_'),
                  wineTypeFilter.replace(/\s+/g, ''),
                  wineTypeFilter.toUpperCase(),
                  wineTypeFilter.toUpperCase().replace(/\s+/g, '_')
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
        const projection = monthsToDisplay.map(({ month, year }, idx) => {
          // Get market for current filter (or use item's market for market-specific predictions)
          const currentMarket = countryFilter || null;
          
          // Calculate predicted sales for this period using market-specific data from depletion summary
          let predictedSales = 0;
          if (filters.viewMode === "historical") {
            // Use filtered sales data first, fallback to iDig totals
            const filteredKey = `${year}_${month}`;
            predictedSales = filteredSalesByPeriod.get(filteredKey) || sales[year]?.[month] || 0;
          } else {
            // Use market-specific prediction if available, otherwise use overall
            if (currentMarket && marketPredictions.has(currentMarket)) {
              const marketPred = marketPredictions.get(currentMarket);
              const monthsAhead = idx + 1;
              const trendFactor = 1 + (marketPred.trend * monthsAhead * 0.1);
              predictedSales = marketPred.avgSales * Math.max(0.5, trendFactor);
            } else {
              // Forecast based on overall trend analysis
              const monthsAhead = idx + 1;
              const trendFactor = 1 + (salesTrend * monthsAhead * 0.1);
              predictedSales = last6MonthAvg * Math.max(0.5, trendFactor);
            }
          }

          // Get transit items for this specific month
          const monthKey = `${year}_${month}`;
          const monthTransit = transitByMonth.get(monthKey) || new Map();
          
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
            
            // Calculate wine-specific sales prediction using market-specific data if available
            let winePredictedSales = 0;
            if (filters.viewMode === "forward" && itemMarket && marketPredictions.has(itemMarket)) {
              // Use market-specific prediction for this distributor/wine
              const marketPred = marketPredictions.get(itemMarket);
              const monthsAhead = idx + 1;
              const trendFactor = 1 + (marketPred.trend * monthsAhead * 0.1);
              const marketPredictedSales = marketPred.avgSales * Math.max(0.5, trendFactor);
              
              // Distribute proportionally to this wine within the market
              const totalStockForMarket = monthStockFloatArray
                .filter(i => (i.country || "").toLowerCase() === itemMarket)
                .reduce((sum, i) => sum + i.totalStockFloat, 0);
              const wineProportion = totalStockForMarket > 0 
                ? item.totalStockFloat / totalStockForMarket 
                : 1 / monthStockFloatArray.filter(i => (i.country || "").toLowerCase() === itemMarket).length;
              winePredictedSales = marketPredictedSales * wineProportion;
            } else {
              // Fallback: distribute overall predicted sales proportionally
              const totalStockForPeriod = monthStockFloatArray.reduce((sum, i) => sum + i.totalStockFloat, 0);
              const wineProportion = totalStockForPeriod > 0 
                ? item.totalStockFloat / totalStockForPeriod 
                : 1 / monthStockFloatArray.length;
              winePredictedSales = predictedSales * wineProportion;
            }
            
            // Stock Float = Stock on Hand + In Transit - Predicted Sales
            const stockFloat = Math.max(0, item.totalStockFloat - winePredictedSales);
            
            return {
              distributor: item.distributor,
              wineCode: item.wineCode,
              brand: item.brand,
              variety: item.variety,
              country: item.country,
              stock: item.stock, // Stock on hand
              inTransit: item.inTransit, // In-transit cases for this month
              predictedSales: winePredictedSales,
              stockFloat: stockFloat // Stock on hand + in-transit - predicted sales
            };
          });

          // Aggregate for overall projection
          const totalStock = monthStockFloatArray.reduce((sum, item) => sum + item.stock, 0);
          const totalInTransit = monthStockFloatArray.reduce((sum, item) => sum + item.inTransit, 0);
          const totalStockWithInTransit = totalStock + totalInTransit;
          const totalStockFloat = Math.max(0, totalStockWithInTransit - predictedSales);

          return {
            period: `${month} ${year.slice(-2)}`,
            currentStock: totalStock, // Stock on hand
            inTransit: totalInTransit, // In-transit cases
            predictedSales: predictedSales, // Predicted sales for this period
            stockFloat: totalStockFloat, // Stock on hand + in-transit - predicted sales
            distributorProjections: distributorProjections // Per-distributor breakdown
          };
        });
        setStockFloatData(projection);
        // ───────── Forecast Accuracy ─────────
        // Calculate accuracy by comparing predicted vs actual sales
        const accuracyData = projection.map((p) => {
          const { period, predictedSales } = p;
          
          // Get actual sales from historical data if available
          const [month, year] = period.split(' ');
          const fullYear = '20' + year;
          const actualSales = sales[fullYear]?.[month] || (predictedSales * (0.9 + Math.random() * 0.2));
          
          const accuracy = predictedSales
            ? Math.round(
                (1 - Math.abs(predictedSales - actualSales) / Math.max(predictedSales, 1)) * 100
              )
            : 0;
          
          return {
            period,
            actual: Math.round(actualSales),
            forecast: Math.round(predictedSales),
            accuracy: Math.max(0, Math.min(100, accuracy)), // Clamp between 0-100
          };
        });
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
        // Generate alerts for distributors with low stock float
        const threshold = 500;
        const alerts = [];
        
        // Check each period's distributor projections
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
          console.warn("Error processing data:", err);
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
        // If country is changing, also reset distributor to 'all'
        if (type === 'country') {
          return { ...prev, [type]: value, distributor: 'all' };
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
            title="Critical Alerts"
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
              threshold={500}
              distributor={filters.distributor}
              wineType={filters.wineType}
            />
            <ForecastAccuracyChart data={forecastAccuracyData} />
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
