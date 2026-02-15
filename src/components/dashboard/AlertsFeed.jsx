import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, TrendingDown, Truck, CheckCircle, Package, X } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AlertsFeed({ alerts, onAlertClick, onDismiss }) {
  const [dismissTarget, setDismissTarget] = useState(null);

  const alertIcons = {
    stockout: <AlertTriangle className="w-4 h-4" />,
    low_stock_float: <Package className="w-4 h-4" />,
    shipment_delay: <Truck className="w-4 h-4" />,
    forecast_variance: <TrendingDown className="w-4 h-4" />,
    quality: <Clock className="w-4 h-4" />
  };

  const severityColors = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800", 
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800"
  };

  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const handleDismissConfirm = () => {
    if (dismissTarget !== null && onDismiss) {
      onDismiss(dismissTarget);
    }
    setDismissTarget(null);
  };

  return (
    <>
      <Card className="glass-effect h-fit lg:sticky lg:top-6">
        <CardHeader className="pb-3 sm:pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold text-slate-900">
              Active Alerts
            </CardTitle>
            <Badge variant="destructive" className="text-xs">
              {alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">Stock float warnings and recommendations</p>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 max-h-[400px] sm:max-h-[600px] overflow-y-auto">
          {sortedAlerts.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm">All stock levels healthy</p>
            </div>
          ) : (
            sortedAlerts.map((alert, index) => (
              <div 
                key={alert._id || index} 
                className={`relative border-l-4 ${
                  alert.severity === 'critical' ? 'border-red-500' :
                  alert.severity === 'high' ? 'border-orange-500' :
                  alert.severity === 'medium' ? 'border-yellow-500' :
                  'border-blue-500'
                } bg-white p-2 sm:p-3 rounded-r-lg shadow-sm hover:shadow-md transition-shadow`}
              >
                {/* Dismiss button */}
                {onDismiss && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissTarget(alert._id || index);
                    }}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Dismiss alert"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                <div 
                  className="cursor-pointer"
                  onClick={() => onAlertClick && onAlertClick(alert)}
                >
                  <div className="flex items-start justify-between mb-1 sm:mb-2 gap-2 pr-5">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className="mt-0.5">{alertIcons[alert.type]}</div>
                      <h4 className="font-medium text-xs sm:text-sm break-words">{alert.title}</h4>
                    </div>
                    <Badge className={`${severityColors[alert.severity]} text-xs shrink-0`}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 mb-1 sm:mb-2">
                    {alert.description}
                  </p>
                  <div className="space-y-1 text-xs text-slate-700">
                    {alert.wine_type && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Wine:</span>
                        <span className="text-slate-600">{alert.wine_type}</span>
                      </div>
                    )}
                    {alert.distributor && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Distributor:</span>
                        <span className="text-slate-600">{alert.distributor}</span>
                      </div>
                    )}
                    {alert.current_stock_float !== undefined && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Current Float:</span>
                        <span className="text-red-600 font-semibold">{alert.current_stock_float} cases</span>
                        <span className="text-slate-500">(threshold: {alert.threshold})</span>
                      </div>
                    )}
                    {alert.recommended_order_quantity && (
                      <div className="mt-2 pt-2 border-t">
                        <span className="font-medium text-green-600">Recommended Order: {alert.recommended_order_quantity} cases</span>
                      </div>
                    )}
                  </div>
                  {alert.predicted_stockout_date && (
                    <div className="mt-2 pt-2 border-t text-xs">
                      <span className="text-red-600 font-medium">
                        Predicted stockout: {format(new Date(alert.predicted_stockout_date), 'MMM d, yyyy')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Dismiss confirmation dialog */}
      <AlertDialog open={dismissTarget !== null} onOpenChange={(open) => { if (!open) setDismissTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss Alert?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to dismiss this alert? This action will remove it from the active alerts list. 
              The alert will reappear if conditions are still met after the next data refresh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDismissConfirm} className="bg-red-600 hover:bg-red-700">
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
