import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip, Line, ComposedChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ForecastAccuracyChart({ data, onExport }) {
  const averageAccuracy = data.length > 0 
    ? (data.reduce((sum, d) => sum + d.accuracy, 0) / data.length).toFixed(1)
    : 0;

  const trend = data.length >= 2 
    ? data[data.length - 1].accuracy - data[0].accuracy
    : 0;

  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <p style={{ color: '#22543d' }}>
              Actual: {dataPoint.actual?.toLocaleString()} cases
            </p>
            <p style={{ color: '#c9a96e' }}>
              Forecast: {dataPoint.forecast?.toLocaleString()} cases
            </p>
            <p className={`font-semibold pt-1 border-t ${dataPoint.accuracy >= 90 ? 'text-green-600' : dataPoint.accuracy >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
              Accuracy: {dataPoint.accuracy}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass-effect">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold text-slate-900">
            Forecast Accuracy & Sales Performance
          </CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            Compare predicted vs actual sales to improve forecasting
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={averageAccuracy >= 85 ? "default" : "secondary"} className="flex items-center gap-1">
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {averageAccuracy}% Avg Accuracy
          </Badge>
          <Button variant="outline" size="sm" onClick={() => onExport('forecast_accuracy')}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="period" 
                stroke="#64748b"
                fontSize={12}
              />
              <YAxis 
                yAxisId="left"
                stroke="#64748b"
                fontSize={12}
                label={{ value: 'Cases', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#64748b"
                fontSize={12}
                domain={[0, 100]}
                label={{ value: 'Accuracy %', angle: 90, position: 'insideRight', style: { fontSize: 12 } }}
              />
              <Tooltip content={customTooltip} />
              <Legend />
              
              <Bar 
                yAxisId="left"
                dataKey="actual" 
                fill="#22543d" 
                name="Actual Sales"
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                yAxisId="left"
                dataKey="forecast" 
                fill="#c9a96e" 
                name="Forecast"
                radius={[4, 4, 0, 0]}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="accuracy" 
                stroke="#6366f1" 
                strokeWidth={3}
                name="Accuracy %"
                dot={{ fill: '#6366f1', strokeWidth: 2, r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 grid grid-cols-3 gap-4 text-xs border-t pt-4">
          <div>
            <p className="text-slate-500">Average Accuracy</p>
            <p className="font-semibold text-lg text-slate-900">
              {averageAccuracy}%
            </p>
          </div>
          <div>
            <p className="text-slate-500">Total Actual Sales</p>
            <p className="font-semibold text-lg text-green-600">
              {data.reduce((sum, d) => sum + d.actual, 0).toLocaleString()} cases
            </p>
          </div>
          <div>
            <p className="text-slate-500">Accuracy Trend</p>
            <p className={`font-semibold text-lg ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}