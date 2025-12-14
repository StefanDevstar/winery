import React, { useMemo } from "react";
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

  // Extract available distributors/states and wine types based on selected country
  const filterOptions = useMemo(() => {
    try {
      const distributorRaw = localStorage.getItem("vc_distributor_stock_data");
      if (!distributorRaw) {
        return { distributors: [], wineTypes: [] };
      }

      const distributorStock = JSON.parse(distributorRaw);
      if (!Array.isArray(distributorStock) || distributorStock.length === 0) {
        return { distributors: [], wineTypes: [] };
      }

      const countryFilter = filters.country === "all" ? null : filters.country.toLowerCase();
      const isUSA = countryFilter === "usa";

      // Filter data by country if a country is selected
      const countryFilteredData = countryFilter
        ? distributorStock.filter(r => {
            const countryCode = (r.AdditionalAttribute2 || "").toLowerCase().trim();
            return countryCode === countryFilter;
          })
        : distributorStock;

      // Extract unique distributors/states
      const locationSet = new Set();
      const wineTypeSet = new Set();
      const wineTypeMap = new Map(); // Map to store wine code -> display name

      countryFilteredData.forEach(r => {
        const location = (r.Location || "").trim();
        if (location && location !== "Unknown") {
          locationSet.add(location);
        }

        // Extract wine type from multiple possible fields
        const wineCode = (r.AdditionalAttribute3 || "").toUpperCase().trim();
        const productName = (r.ProductName || "").trim();
        const variety = (r.Variety || "").trim();
        
        // Try to extract wine type code (e.g., SAB, PIN, CHR, etc.)
        if (wineCode) {
          // Extract variety code from wine code (format: BRAND_VARIETY_YEAR or similar)
          const parts = wineCode.split('_');
          const varietyCode = parts.find(p => 
            ['SAB', 'PIN', 'CHR', 'ROSE', 'PIG', 'GRU', 'LHS', 'RIESLING', 'CHARDONNAY'].includes(p.toUpperCase())
          );
          
          if (varietyCode) {
            const code = varietyCode.toUpperCase();
            // Map codes to display names
            const wineNameMap = {
              'SAB': 'Sauvignon Blanc',
              'PIN': 'Pinot Noir',
              'CHR': 'Chardonnay',
              'ROSE': 'Rose',
              'PIG': 'Pinot Gris',
              'GRU': 'Gruner Veltliner',
              'LHS': 'Late Harvest Sauvignon',
              'RIESLING': 'Riesling',
              'CHARDONNAY': 'Chardonnay'
            };
            wineTypeMap.set(code, wineNameMap[code] || code);
          }
        }
        
        // Also check product name and variety fields
        if (productName) {
          const lowerName = productName.toLowerCase();
          if (lowerName.includes('sauvignon blanc') || lowerName.includes('sauvignon')) {
            wineTypeMap.set('SAB', 'Sauvignon Blanc');
          } else if (lowerName.includes('pinot noir')) {
            wineTypeMap.set('PIN', 'Pinot Noir');
          } else if (lowerName.includes('chardonnay')) {
            wineTypeMap.set('CHR', 'Chardonnay');
          } else if (lowerName.includes('pinot gris') || lowerName.includes('pinot grigio')) {
            wineTypeMap.set('PIG', 'Pinot Gris');
          } else if (lowerName.includes('riesling')) {
            wineTypeMap.set('RIESLING', 'Riesling');
          } else if (lowerName.includes('rose')) {
            wineTypeMap.set('ROSE', 'Rose');
          }
        }
        
        if (variety) {
          const lowerVariety = variety.toLowerCase();
          if (lowerVariety.includes('sauvignon blanc') || lowerVariety.includes('sauvignon')) {
            wineTypeMap.set('SAB', 'Sauvignon Blanc');
          } else if (lowerVariety.includes('pinot noir')) {
            wineTypeMap.set('PIN', 'Pinot Noir');
          } else if (lowerVariety.includes('chardonnay')) {
            wineTypeMap.set('CHR', 'Chardonnay');
          } else if (lowerVariety.includes('pinot gris') || lowerVariety.includes('pinot grigio')) {
            wineTypeMap.set('PIG', 'Pinot Gris');
          } else if (lowerVariety.includes('riesling')) {
            wineTypeMap.set('RIESLING', 'Riesling');
          } else if (lowerVariety.includes('rose')) {
            wineTypeMap.set('ROSE', 'Rose');
          }
        }
      });

      // Convert sets to sorted arrays
      const distributors = Array.from(locationSet).sort();
      const wineTypes = Array.from(wineTypeMap.entries())
        .map(([code, name]) => ({ code: code.toLowerCase(), name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { distributors, wineTypes };
    } catch (err) {
      console.warn("Error extracting filter options:", err);
      return { distributors: [], wineTypes: [] };
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
    <div className="glass-effect rounded-lg p-4 mb-6 space-y-4">
      {/* View Mode Selector */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">View:</span>
        </div>
        
        <Tabs value={viewMode} onValueChange={handleViewModeChange}>
          <TabsList className="bg-slate-100">
            <TabsTrigger value="historical">Historical Data</TabsTrigger>
            <TabsTrigger value="forward">
              <TrendingUp className="w-3 h-3 mr-2" />
              Forward Predictions
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Primary Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-3">
          <Select value={filters.country || "nzl"} onValueChange={(value) => {
            onFilterChange('country', value);
          }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usa">USA</SelectItem>
              <SelectItem value="au">Australia</SelectItem>
              <SelectItem value="nzl">New Zealand</SelectItem>
              <SelectItem value="jap">Japan</SelectItem>
              <SelectItem value="den">Denmark</SelectItem>
              <SelectItem value="pol">Poland</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.distributor} onValueChange={(value) => onFilterChange('distributor', value)}>
            <SelectTrigger className="w-48">
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
          </Select>

          <Select value={filters.wineType} onValueChange={(value) => onFilterChange('wineType', value)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Wine Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Wine Types</SelectItem>
              {filterOptions.wineTypes.length > 0 ? (
                filterOptions.wineTypes.map((wine) => (
                  <SelectItem key={wine.code} value={wine.code}>
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
            <SelectTrigger className="w-32">
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
      <div className="border-t pt-4">
        {viewMode === "historical" ? (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Historical Period:</span>
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="text-xs">
                  <CalendarIcon className="mr-2 h-3 w-3" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
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
                  numberOfMonths={2}
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
                className="text-xs"
              >
                Last 12 Months
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  const now = new Date();
                  const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
                  handleDateRangeChange({ from, to: now });
                }}
                className="text-xs"
              >
                Last 6 Months
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-slate-600">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">Prediction Range:</span>
            </div>
            
            <div className="flex gap-2">
              {[1, 2, 3, 6, 12].map(months => (
                <Button
                  key={months}
                  variant={filters.forwardLookingMonths === months ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleForwardLookingChange(months)}
                  className="text-xs"
                >
                  {months} {months === 1 ? 'Month' : 'Months'}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}