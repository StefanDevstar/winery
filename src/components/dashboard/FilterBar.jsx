import React, { useMemo, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      const distributorRaw = localStorage.getItem("vc_distributor_stock_data");
      const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_metadata");
      
      let distributorStock = [];
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
      
      if (distributorStock.length === 0) {
        return { countries: [], distributors: [], wineTypes: [] };
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
            const fallbackCode = normalizedSheetName.toLowerCase();
            if (fallbackCode) {
              countrySet.add(fallbackCode);
            }
          }
        });
      }
      
      // Fallback: if no metadata, extract from actual data (for backward compatibility)
      if (countrySet.size === 0) {
        distributorStock.forEach(r => {
          const countryCode = (r.AdditionalAttribute2 || "").toLowerCase().trim();
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

      // Filter data by country if a country is selected
      const countryFilteredData = countryFilter
        ? distributorStock.filter(r => {
            const countryCode = (r.AdditionalAttribute2 || "").toLowerCase().trim();
            return countryCode === countryFilter;
          })
        : distributorStock;

      // Extract unique distributors/states
      const locationSet = new Set();
      const wineTypeMap = new Map(); // Map to store wine code -> display name
      const wineNameToCodeMap = new Map(); // Reverse map: wine name -> code (to prevent duplicates by name)

      countryFilteredData.forEach(r => {
        let location = (r.Location || "").trim();
        if (location && location !== "Unknown") {
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
          } else if (lowerName.includes('riesling')) {
            checkAndAddWineType('RIESLING', 'Riesling');
          } else if (lowerName.includes('rose')) {
            checkAndAddWineType('ROS', 'Rose');
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
          } else if (lowerVariety.includes('riesling')) {
            checkAndAddWineType('RIESLING', 'Riesling');
          } else if (lowerVariety.includes('rose')) {
            checkAndAddWineType('ROS', 'Rose');
          }
        }
      });

      // Convert sets to sorted arrays
      // Distributors are already cleaned (country code prefix removed)
      const distributors = Array.from(locationSet)
        .filter(loc => loc && loc !== "Unknown")
        .sort();
      
      // Convert wine type map to array - duplicates already prevented by wineNameToCodeMap
      const wineTypes = Array.from(wineTypeMap.entries())
        .map(([code, name]) => ({ code: code.toLowerCase(), name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { countries, distributors, wineTypes };
    } catch (err) {
      console.warn("Error extracting filter options:", err);
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

          {/* <Select value={filters.distributor} onValueChange={(value) => onFilterChange('distributor', value)}>
            <SelectTrigger className="w-full sm:w-48 text-sm">
              <SelectValue placeholder={filters.country === "usa" ? "State" : "Distributor"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {filters.country === "usa" ? "All States" : "All Distributors"}
              </SelectItem>
              {filterOptions.distributors.map((distributor) => (
                <SelectItem key={distributor} value={distributor}>
                  {distributor.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select> */}

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
                  <SelectItem value="riesling">Riesling</SelectItem>
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
                  const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_metadata");
                  const distributorRaw = localStorage.getItem("vc_distributor_stock_data");
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