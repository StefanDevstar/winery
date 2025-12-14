import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SalesChart({ data, comparisonData, comparisonPeriod, onExport }) {
  const calculateGrowth = () => {
    if (!data || !comparisonData || data.length === 0 || comparisonData.length === 0) return 0;
    
    const currentTotal = data.reduce((sum, item) => sum + (item.actual || 0), 0);
    const previousTotal = comparisonData.reduce((sum, item) => sum + (item.actual || 0), 0);
    
    return previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal * 100).toFixed(1) : 0;
  };

  const growth = calculateGrowth();
  const isPositiveGrowth = growth > 0;

  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value?.toLocaleString()} cases
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass-effect">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Sales vs Forecast
          </CardTitle>
          {growth !== 0 && (
            <Badge variant={isPositiveGrowth ? "default" : "destructive"} className="flex items-center gap-1">
              {isPositiveGrowth ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(growth)}% vs {comparisonPeriod.replace('_', ' ')}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => onExport('sales')}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="month" 
                stroke="#64748b"
                fontSize={12}
              />
              <YAxis 
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(value) => `${value}k`}
              />
              <Tooltip content={customTooltip} />
              <Legend />
              
              {/* Current Period Lines */}
              <Line 
                type="monotone" 
                dataKey="actual" 
                stroke="#22543d" 
                strokeWidth={3}
                name="Current Actual"
                dot={{ fill: '#22543d', strokeWidth: 2, r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="forecast" 
                stroke="#c9a96e" 
                strokeWidth={3}
                strokeDasharray="5 5"
                name="Current Forecast"
                dot={{ fill: '#c9a96e', strokeWidth: 2, r: 4 }}
              />
              
              {/* Comparison Period Lines (if available) */}
              {comparisonData && comparisonData.length > 0 && (
                <>
                  <Line 
                    type="monotone" 
                    dataKey="previousActual" 
                    stroke="#94a3b8" 
                    strokeWidth={2}
                    strokeDasharray="2 2"
                    name={`${comparisonPeriod.replace('_', ' ')} Actual`}
                    dot={{ fill: '#94a3b8', strokeWidth: 1, r: 2 }}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 text-xs text-slate-500 border-t pt-2">
          <div className="flex justify-between">
            <span>Current period total: {data?.reduce((sum, item) => sum + (item.actual || 0), 0).toLocaleString()} cases</span>
            {comparisonData && (
              <span>{comparisonPeriod.replace('_', ' ')} total: {comparisonData.reduce((sum, item) => sum + (item.actual || 0), 0).toLocaleString()} cases</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}