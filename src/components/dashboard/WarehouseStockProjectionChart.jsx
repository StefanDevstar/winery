import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WarehouseStockProjectionChart({
  data,
  onExport,
}) {
  // Transform data for chart display
  // Group by wine type (variety) and sum projected available stock
  const chartData = useMemo(() => {
    // Debug: Log incoming data
    
    if (!data || data.length === 0) return [];

    // Get all unique wine types from all periods
    const wineTypesMap = new Map();
    data.forEach(period => {
      period.wines?.forEach(wine => {
        const wineKey = wine.variety || wine.wineCode || 'Unknown';
        if (!wineTypesMap.has(wineKey)) {
          wineTypesMap.set(wineKey, {
            name: wineKey,
            color: getColorForWineType(wineKey)
          });
        }
      });
    });
    
    // Build chart data - one entry per period
    return data.map(period => {
      const periodData = {
        period: period.period,
        predictedSales: period.predictedSales || 0, // Include predicted sales for tooltip display
      };

      // Sum projected available stock by wine type
      // This shows what stock we will have available at future dates
      // IMPORTANT: Use "projectedAvailable" field (from Available field in warehouse stock data)
      wineTypesMap.forEach((wineType, wineKey) => {
        const winesOfType = period.wines?.filter(w => 
          (w.variety || w.wineCode || 'Unknown') === wineKey
        ) || [];
        
        // Use projectedAvailable (what we will have available) - this is from Available field
        // IMPORTANT: Always use projectedAvailable if it exists (even if 0), as it represents the stock after subtracting predicted sales
        const totalProjectedAvailable = winesOfType.reduce(
          (sum, w) => {
            // For forward predictions, use projectedAvailable (stock after subtracting predicted sales)
            // For historical view, use available (current stock)
            const value = w.projectedAvailable !== undefined ? w.projectedAvailable : (w.currentAvailable !== undefined ? w.currentAvailable : (w.available || 0));
            return sum + value;
          },
          0
        );
        
        periodData[wineKey] = Math.round(totalProjectedAvailable);
      });

      return periodData;
    });
  }, [data]);
  

  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);
      // Get predicted sales from the data (stored in period data)
      const periodData = payload[0]?.payload;
      const predictedSales = periodData?.predictedSales || 0;
      
      return (
        <div className="bg-white p-3 border rounded-lg shadow-md text-sm">
          <p className="font-semibold mb-2">{label}</p>
          <div className="space-y-1 text-xs">
            {payload.map((entry, index) => (
              entry.value > 0 && (
                <p key={index} style={{ color: entry.color }} className="mb-1">
                  {entry.name}: {entry.value?.toLocaleString()} cases
                </p>
              )
            ))}
            <p className="border-t pt-1 mt-1">
              <span className="font-medium">Total Available:</span> {total.toLocaleString()} cases
            </p>
            <p className="mt-1">
              <span className="font-medium">Projected Sales:</span> {predictedSales?.toLocaleString() || 0} cases
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Get all wine types for legend
  const wineTypes = useMemo(() => {
    if (!data || data.length === 0) return [];
    const types = new Set();
    data.forEach(period => {
      period.wines?.forEach(wine => {
        const wineKey = wine.variety || wine.wineCode || 'Unknown';
        types.add(wineKey);
      });
    });
    return Array.from(types);
  }, [data]);

  // Generate colors for wine types
  function getColorForWineType(wineType) {
    const colors = {
      'Sauvignon Blanc': '#22543d',
      'Pinot Noir': '#c9a96e',
      'Chardonnay': '#d69e2e',
      'Pinot Gris': '#9f7aea',
      'Riesling': '#4299e1',
      'Rose': '#ed64a6',
    };
    
    const lowerType = wineType.toLowerCase();
    for (const [key, color] of Object.entries(colors)) {
      if (lowerType.includes(key.toLowerCase())) {
        return color;
      }
    }
    
    // Default color palette
    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return defaultColors[wineType.length % defaultColors.length];
  }

  // Early return AFTER all hooks
  if (!data || data.length === 0) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Warehouse Stock Projection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-slate-500">
            <p>No warehouse stock data available. Please upload Stock on Hand data.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-effect">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-slate-700" />
          <CardTitle className="text-lg font-semibold text-slate-900">
            Warehouse Stock Projection
          </CardTitle>
        </div>
        {onExport && (
          <Button variant="outline" size="sm" onClick={() => onExport('warehouse_stock')}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="period" 
                stroke="#64748b"
                fontSize={12}
              />
              <YAxis 
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(value) => `${value}`}
                label={{ value: 'Cases', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={customTooltip} />
              <Legend />
              {wineTypes.map((wineType, index) => (
                <Area
                  key={wineType}
                  type="monotone"
                  dataKey={wineType}
                  stackId="1"
                  stroke={getColorForWineType(wineType)}
                  fill={getColorForWineType(wineType)}
                  fillOpacity={0.6}
                  name={wineType}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 text-xs text-slate-500 border-t pt-2">
          <p className="mb-1">
            <strong>Formula:</strong> Projected Available = Current Available - Projected Sales (per month)
          </p>
          <p>
            Shows the projection of stock we will have available at future dates, based on current warehouse available inventory (Available field) minus predicted sales over time. Stock is grouped by distributor (AdditionalAttribute2) and wine type.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
