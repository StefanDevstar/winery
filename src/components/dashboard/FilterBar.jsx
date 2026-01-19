import React, { useMemo, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeCountryCode } from "@/lib/utils";

export default function FilterBar({ filters, onFilterChange }) {
  const [dateRange, setDateRange] = React.useState({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date()
  });
  
  const [viewMode, setViewMode] = React.useState("historical");
  
  // Update dateRange when year filter changes
  useEffect(() => {
    if (filters.year && filters.year !== "all") {
      const selectedYear = parseInt(filters.year);
      if (!isNaN(selectedYear)) {
        const newDateRange = {
          from: new Date(selectedYear, 0, 1), // January 1st
          to: new Date(selectedYear, 11, 31) // December 31st
        };
        setDateRange(newDateRange);
        onFilterChange('dateRange', newDateRange);
      }
    }
  }, [filters.year]); // Only depend on filters.year

  // Extract available countries, distributors/states and wine types from data
  const filterOptions = useMemo(() => {
    try {
      const distributorRaw = localStorage.getItem("vc_distributor_stock_on_hand_data");
      const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_on_hand_metadata");
      const salesMetadataRaw = localStorage.getItem("vc_salesmetadata");
      
      let distributorStock = [];
      let salesData = [];
      let metadata = null;
      
      if (distributorRaw) {
        distributorStock = JSON.parse(distributorRaw);
        if (!Array.isArray(distributorStock)) {
          distributorStock = [];
        }
      }
      
      if (distributorMetadataRaw) {
        metadata = JSON.parse(distributorMetadataRaw);
      }
      
      // Also load sales data to extract states for USA
      if (salesMetadataRaw) {
        try {
          const salesMetadata = JSON.parse(salesMetadataRaw);
          if (salesMetadata && salesMetadata.sheetNames && Array.isArray(salesMetadata.sheetNames)) {
            salesMetadata.sheetNames.forEach(sheetName => {
              if (sheetName.toUpperCase().includes('USA')) {
                const salesKey = `vc_sales_data_${sheetName}`;
                const salesSheetData = localStorage.getItem(salesKey);
                if (salesSheetData) {
                  try {
                    const parsed = JSON.parse(salesSheetData);
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
      
      if (distributorStock.length === 0 && salesData.length === 0) {
        return { countries: [], distributors: [], states: [], wineTypes: [] };
      }

      // Extract countries from metadata sheet names (this is the source of truth)
      // Sheet names directly map to countries: NZL → nzl, AU-B → au-b, USA → usa, IRE → ire
      const countrySet = new Set();
      
      // Country code to display name mapping
      const countryDisplayNames = {
        'usa': 'USA',
        'au-b': 'AU-B',
        'au-c': 'AU-C',
        'nzl': 'New Zealand',
        'ire': 'Ireland'
      };
      
      // Map sheet names to country codes
      const sheetNameToCountryCode = {
        'NZ': 'nzl',
        'NZL': 'nzl',
        'AUB': 'au-b',
        'AU-B': 'au-b',
        'AUC': 'au-c',
        'AU-C': 'au-c',
        'USA': 'usa',
        'IRE': 'ire'
      };
      
      // Extract countries from metadata sheet names
      if (metadata && metadata.sheetNames && Array.isArray(metadata.sheetNames)) {
        metadata.sheetNames.forEach(sheetName => {
          const normalizedSheetName = sheetName.toUpperCase().trim();
          // Map sheet name to country code
          const countryCode = sheetNameToCountryCode[normalizedSheetName];
          if (countryCode) {
            countrySet.add(countryCode);
          } else {
            // Fallback: try to normalize sheet name directly
            let fallbackCode = normalizedSheetName.toLowerCase();
            // Convert NZ to nzl if it includes NZ
            if (fallbackCode.includes('nz') && !fallbackCode.includes('nzl')) {
              fallbackCode = fallbackCode.replace(/nz/g, 'nzl');
            }
            if (fallbackCode) {
              countrySet.add(fallbackCode);
            }
          }
        });
      }
      
      // Fallback: if no metadata, extract from actual data (for backward compatibility)
      if (countrySet.size === 0) {
        distributorStock.forEach(r => {
          const rawCountryCode = (r.AdditionalAttribute2 || "");
          const countryCode = normalizeCountryCode(rawCountryCode).toLowerCase();
          if (countryCode) {
            countrySet.add(countryCode);
          }
        });
      }
      
      // Convert to sorted array with display names
      // Priority order: USA, AU-B, AU-C, NZL, IRE
      const priorityCountries = ['usa', 'au-b', 'au-c', 'nzl', 'ire'];
      const countries = Array.from(countrySet)
        .map(code => ({
          code: code,
          name: countryDisplayNames[code] || code.toUpperCase()
        }))
        .sort((a, b) => {
          const aPriority = priorityCountries.indexOf(a.code);
          const bPriority = priorityCountries.indexOf(b.code);
          
          // If both are in priority list, sort by priority
          if (aPriority >= 0 && bPriority >= 0) {
            return aPriority - bPriority;
          }
          // If only one is in priority list, prioritize it
          if (aPriority >= 0) return -1;
          if (bPriority >= 0) return 1;
          // Otherwise sort alphabetically
          return a.name.localeCompare(b.name);
        });

      const countryFilter = filters.country === "all" ? null : filters.country.toLowerCase();

      // Combine distributor stock and sales data for state extraction (for USA)
      const allData = [...distributorStock, ...salesData];
      
      // Filter data by country if a country is selected
      const countryFilteredData = countryFilter
        ? allData.filter(r => {
            const rawCountryCode = (r.AdditionalAttribute2 || "");
            // Use normalizeCountryCode to normalize country codes to "nzl" for New Zealand
            const countryCode = normalizeCountryCode(rawCountryCode).toLowerCase();
            const normalizedFilter = normalizeCountryCode(countryFilter).toLowerCase();
            return countryCode === normalizedFilter;
          })
        : allData;

      // Extract unique distributors/states
      const locationSet = new Set();
      const stateSet = new Set(); // For USA states
      const wineTypeMap = new Map(); // Map to store wine code -> display name
      const wineNameToCodeMap = new Map(); // Reverse map: wine name -> code (to prevent duplicates by name)

      countryFilteredData.forEach(r => {
        let location = (r.Location || "").trim();
        if (location && location !== "Unknown") {
          // For USA, Location field contains state name
          if (countryFilter === 'usa') {
            // Location is the state name for USA data
            // Filter out invalid entries like "Dist. STATE" or entries that don't look like state names
            // Valid state names are typically 2-letter abbreviations or full state names
            const upperLocation = location.toUpperCase();
            // Skip entries that contain "DIST" or "STATE" as separate words (like "Dist. STATE")
            if (upperLocation.includes('DIST') || (upperLocation.includes('STATE') && !upperLocation.match(/^[A-Z]{2}$/))) {
              return; // Skip this entry
            }
            // Only add valid state names (2-letter codes or proper state names)
            // Common invalid patterns: "Dist. STATE", "STATE", etc.
            if (location.length >= 2 && !location.match(/^(dist|state|district)/i)) {
              stateSet.add(location);
            }
          } else {
            // For other countries, Location is distributor name
            // Location no longer has country code prefix (removed at source), but keep fallback for other data sources
            // Strip country code prefix if present (fallback for other data sources that might still have it)
            let cleanedLocation = location.replace(/^[A-Z]{2,3}\s*-\s*/i, "").trim();
            if (!cleanedLocation || cleanedLocation === location) {
              cleanedLocation = location.replace(/^[A-Z]{2,3}\s+/i, "").trim();
            }
            // If still no change, use original location (no prefix was present)
            if (!cleanedLocation || cleanedLocation === location) {
              cleanedLocation = location;
            }
            locationSet.add(cleanedLocation);
          }
        }

        // Extract wine type from multiple possible fields
        const wineCode = (r.AdditionalAttribute3 || "").toUpperCase().trim();
        const productName = (r.ProductName || "").trim();
        const variety = (r.Variety || "").trim();
        
        // Map codes to display names
        const wineNameMap = {
          'SAB': 'Sauvignon Blanc',
          'PIN': 'Pinot Noir',
          'CHR': 'Chardonnay',
          'ROS': 'Rose',
          'PIG': 'Pinot Gris',
          'GRU': 'Gruner Veltliner',
          'LHS': 'Late Harvest Sauvignon',
          'RIESLING': 'Riesling'
        };
        
        // Try to extract wine type code (e.g., SAB, PIN, CHR, etc.)
        if (wineCode) {
          // Extract variety code from wine code (format: BRAND_VARIETY_YEAR or similar)
          const parts = wineCode.split('_');
          const varietyCode = parts.find(p => {
            const upper = p.toUpperCase();
            return ['SAB', 'PIN', 'CHR', 'ROS', 'PIG', 'GRU', 'LHS', 'RIESLING', 'CHARDONNAY'].includes(upper);
          });
          
          if (varietyCode) {
            const code = varietyCode.toUpperCase();
            // Normalize codes - map CHARDONNAY to CHR to avoid duplicates
            const normalizedCode = code === 'CHARDONNAY' ? 'CHR' : code;
            const wineName = wineNameMap[normalizedCode] || code;
            
            // Only add if we don't already have this wine name, or if this code is shorter
            if (!wineNameToCodeMap.has(wineName)) {
              wineNameToCodeMap.set(wineName, normalizedCode);
              wineTypeMap.set(normalizedCode, wineName);
            } else {
              // If we already have this wine name, only update if this code is shorter
              const existingCode = wineNameToCodeMap.get(wineName);
              if (normalizedCode.length < existingCode.length) {
                wineTypeMap.delete(existingCode);
                wineNameToCodeMap.set(wineName, normalizedCode);
                wineTypeMap.set(normalizedCode, wineName);
              }
            }
          }
        }
        
        // Also check product name and variety fields - but only if we haven't found this wine type yet
        const checkAndAddWineType = (code, name) => {
          if (!wineNameToCodeMap.has(name)) {
            wineNameToCodeMap.set(name, code);
            wineTypeMap.set(code, name);
          }
        };
        
        if (productName) {
          const lowerName = productName.toLowerCase();
          if (lowerName.includes('sauvignon blanc') || lowerName.includes('sauvignon')) {
            checkAndAddWineType('SAB', 'Sauvignon Blanc');
          } else if (lowerName.includes('pinot noir')) {
            checkAndAddWineType('PIN', 'Pinot Noir');
          } else if (lowerName.includes('chardonnay')) {
            checkAndAddWineType('CHR', 'Chardonnay');
          } else if (lowerName.includes('pinot gris') || lowerName.includes('pinot grigio')) {
            checkAndAddWineType('PIG', 'Pinot Gris');
          } else if (lowerName.includes('rose') || lowerName.includes('rosé')) {
            checkAndAddWineType('ROS', 'Rose');
          } else if (lowerName.includes('gruner veltliner') || lowerName.includes('gruner')) {
            checkAndAddWineType('GRU', 'Gruner Veltliner');
          } else if (lowerName.includes('late harvest sauvignon') || lowerName.includes('late harvest')) {
            checkAndAddWineType('LHS', 'Late Harvest Sauvignon');
          } else if (lowerName.includes('riesling')) {
            checkAndAddWineType('RIESLING', 'Riesling');
          }
        }
        
        if (variety) {
          const lowerVariety = variety.toLowerCase();
          if (lowerVariety.includes('sauvignon blanc') || lowerVariety.includes('sauvignon')) {
            checkAndAddWineType('SAB', 'Sauvignon Blanc');
          } else if (lowerVariety.includes('pinot noir')) {
            checkAndAddWineType('PIN', 'Pinot Noir');
          } else if (lowerVariety.includes('chardonnay')) {
            checkAndAddWineType('CHR', 'Chardonnay');
          } else if (lowerVariety.includes('pinot gris') || lowerVariety.includes('pinot grigio')) {
            checkAndAddWineType('PIG', 'Pinot Gris');
          } else if (lowerVariety.includes('rose') || lowerVariety.includes('rosé')) {
            checkAndAddWineType('ROS', 'Rose');
          } else if (lowerVariety.includes('gruner veltliner') || lowerVariety.includes('gruner')) {
            checkAndAddWineType('GRU', 'Gruner Veltliner');
          } else if (lowerVariety.includes('late harvest sauvignon') || lowerVariety.includes('late harvest')) {
            checkAndAddWineType('LHS', 'Late Harvest Sauvignon');
          } else if (lowerVariety.includes('riesling')) {
            checkAndAddWineType('RIESLING', 'Riesling');
          }
        }
      });

      // Convert sets to sorted arrays
      // Distributors are already cleaned (country code prefix removed)
      const distributors = Array.from(locationSet)
        .filter(loc => loc && loc !== "Unknown")
        .sort();
      
      // States for USA
      const states = Array.from(stateSet)
        .filter(state => state && state !== "Unknown")
        .sort();
      
      // Convert wine type map to array - duplicates already prevented by wineNameToCodeMap
      const wineTypes = Array.from(wineTypeMap.entries())
        .map(([code, name]) => ({ code: code.toLowerCase(), name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { countries, distributors, states, wineTypes };
    } catch (err) {
      return { countries: [], distributors: [], wineTypes: [] };
    }
  }, [filters.country]);

  const handleDateRangeChange = (range) => {
    setDateRange(range);
    onFilterChange('dateRange', range);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    onFilterChange('viewMode', mode);
  };

  const handleForwardLookingChange = (months) => {
    onFilterChange('forwardLookingMonths', months);
  };

  return (
    <div className="glass-effect rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 space-y-3 sm:space-y-4">
      {/* View Mode Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 border-b pb-3 sm:pb-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">View:</span>
        </div>
        
        <Tabs value={viewMode} onValueChange={handleViewModeChange} className="w-full sm:w-auto">
          <TabsList className="bg-slate-100 w-full sm:w-auto">
            <TabsTrigger value="historical" className="flex-1 sm:flex-none text-xs sm:text-sm">Historical Data</TabsTrigger>
            <TabsTrigger value="forward" className="flex-1 sm:flex-none text-xs sm:text-sm">
              <TrendingUp className="w-3 h-3 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Forward Predictions</span>
              <span className="sm:hidden">Forward</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Primary Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
          <Select value={filters.country || "nzl"} onValueChange={(value) => {
            onFilterChange('country', value);
          }}>
            <SelectTrigger className="w-full sm:w-40 text-sm">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.countries.length > 0 ? (
                filterOptions.countries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))
              ) : (
                // Fallback options if no data is available
                <>
              <SelectItem value="usa">USA</SelectItem>
                  <SelectItem value="au-b">AU-B</SelectItem>
                  <SelectItem value="au-c">AU-C</SelectItem>
              <SelectItem value="nzl">New Zealand</SelectItem>
                  <SelectItem value="ire">Ireland</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          {/* State filter for USA only */}
          {filters.country === "usa" && (
            <Select value={filters.state || "all"} onValueChange={(value) => onFilterChange('state', value)}>
              <SelectTrigger className="w-full sm:w-48 text-sm">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {filterOptions.states && filterOptions.states.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filters.wineType} onValueChange={(value) => onFilterChange('wineType', value)}>
            <SelectTrigger className="w-full sm:w-48 text-sm">
              <SelectValue placeholder="Wine Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Wine Types</SelectItem>
              {filterOptions.wineTypes.length > 0 ? (
                filterOptions.wineTypes.map((wine, index) => (
                  <SelectItem key={`${wine.code}-${index}`} value={wine.code}>
                    {wine.name}
                  </SelectItem>
                ))
              ) : (
                // Fallback options if no data is available
                <>
                  <SelectItem value="sab">Sauvignon Blanc</SelectItem>
                  <SelectItem value="pin">Pinot Noir</SelectItem>
                  <SelectItem value="chardonnay">Chardonnay</SelectItem>
                  <SelectItem value="pig">Pinot Gris</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          <Select value={filters.year || "all"} onValueChange={(value) => onFilterChange('year', value)}>
            <SelectTrigger className="w-full sm:w-32 text-sm">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {Array.from({ length: 10 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date/Prediction Range Filters */}
      <div className="border-t pt-3 sm:pt-4">
        {viewMode === "historical" ? (
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarIcon className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Historical Period:</span>
              </div>
              {/* Last Update Date */}
              {(() => {
                try {
                  const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_on_hand_metadata");
                  const distributorRaw = localStorage.getItem("vc_distributor_stock_on_hand_data");
                  let lastUpdate = null;
                  
                  if (distributorMetadataRaw) {
                    const metadata = JSON.parse(distributorMetadataRaw);
                    if (metadata.lastUpdate) {
                      lastUpdate = new Date(metadata.lastUpdate);
                    }
                  }
                  
                  // Fallback: use data timestamp if available
                  if (!lastUpdate && distributorRaw) {
                    const data = JSON.parse(distributorRaw);
                    if (data && data.length > 0 && data[0]._timestamp) {
                      lastUpdate = new Date(data[0]._timestamp);
                    }
                  }
                  
                  return lastUpdate ? (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <span>Last updated: {format(lastUpdate, "MMM d, yyyy")}</span>
                      <span className="text-yellow-600 font-medium">⚠</span>
                      <span className="text-xs">Not all data aligned with dates</span>
                    </div>
                  ) : null;
                } catch (err) {
                  return null;
                }
              })()}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="text-xs w-full sm:w-auto justify-start">
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          <span className="hidden sm:inline">{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</span>
                          <span className="sm:hidden">{format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}</span>
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      "Select Date Range"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={handleDateRangeChange}
                    numberOfMonths={1}
                    className="sm:block"
                  />
                </PopoverContent>
              </Popover>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const now = new Date();
                    const from = new Date(now.getFullYear(), now.getMonth() - 12, 1);
                    handleDateRangeChange({ from, to: now });
                  }}
                  className="text-xs flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">Last 12 Months</span>
                  <span className="sm:hidden">12M</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const now = new Date();
                    const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
                    handleDateRangeChange({ from, to: now });
                  }}
                  className="text-xs flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">Last 6 Months</span>
                  <span className="sm:hidden">6M</span>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-slate-600">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Prediction Range:</span>
            </div>
            
            <div className="grid grid-cols-3 sm:flex gap-2">
              {[1, 2, 3, 6, 12].map(months => (
                <Button
                  key={months}
                  variant={filters.forwardLookingMonths === months ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleForwardLookingChange(months)}
                  className="text-xs"
                >
                  {months} {months === 1 ? 'M' : 'M'}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}