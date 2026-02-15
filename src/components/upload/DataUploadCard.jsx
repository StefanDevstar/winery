import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Lock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function DataUploadCard({
  title,
  description,
  subtitle,
  Icon,
  onFileUpload,
  processingStatus,
  acceptFileTypes = ".csv",
  lastUpdated = null,
  onReset = null,
  disabled = false,
  uploadedStatus = 'ready',
}) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, [disabled]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileUpload(e.dataTransfer.files[0]);
    }
  }, [onFileUpload, disabled]);

  const handleFileSelect = (e) => {
    if (disabled) return;
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleTryAgain = () => {
    if (onReset) {
      onReset();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const statusContent = () => {
    if (disabled && uploadedStatus === 'uploaded') {
      return (
        <div className="text-center space-y-2 py-4">
          <div className="relative">
            <Lock className="w-12 h-12 mx-auto text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">Month locked - data uploaded</p>
          <Badge className="bg-green-100 text-green-700 border-green-300">
            Uploaded
          </Badge>
        </div>
      );
    }

    switch (processingStatus.status) {
      case 'processing':
        return (
          <div className="text-center space-y-2">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-500" />
            <p className="text-sm text-slate-600 font-medium">{processingStatus.message}</p>
            <Progress value={processingStatus.progress} className="w-full" />
          </div>
        );
      case 'success':
        return (
          <div className="text-center space-y-2 py-4">
            <div className="relative">
              <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 bg-green-100 rounded-full animate-ping opacity-25"></div>
              </div>
            </div>
            <p className="text-sm text-green-600 font-semibold">{processingStatus.message}</p>
            <Badge className="bg-green-100 text-green-700 border-green-300">
              Upload Complete
            </Badge>
          </div>
        );
      case 'error':
        return (
          <div className="text-center space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
            <p className="text-sm text-red-600 font-medium">{processingStatus.message}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTryAgain}
              className="mt-2"
            >
              Try Again
            </Button>
          </div>
        );
      case 'idle':
      default:
        return (
          <div
            className={`p-4 sm:p-8 border-2 border-dashed rounded-lg transition-all ${
              disabled
                ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                : dragActive 
                ? "border-blue-400 bg-blue-50 scale-105" 
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragEnter={handleDrag} 
            onDragOver={handleDrag} 
            onDragLeave={handleDrag} 
            onDrop={handleDrop}
          >
            <div className="text-center">
              <Upload className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-slate-400 mb-2 sm:mb-3" />
              <p className="text-xs sm:text-sm text-slate-600 mb-1 font-medium">
                {disabled ? 'Month is locked' : acceptFileTypes.includes('.xlsx') ? 'Drag and drop' : 'Drop CSV file here'}
              </p>
              <p className="text-xs text-slate-400 mb-2 sm:mb-3">
                {disabled ? '' : `or click "Choose file" — allowed: ${acceptFileTypes}`}
              </p>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => !disabled && fileInputRef.current?.click()}
                className="text-xs sm:text-sm w-full sm:w-auto"
                disabled={disabled}
              >
                Choose file
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <Card className={`glass-effect shadow-lg transition-all duration-300 ${
      processingStatus.status === 'success' ? 'border-green-300 border-2' : 
      disabled && uploadedStatus === 'uploaded' ? 'border-green-200 border' : ''
    }`}>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptFileTypes}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${
              processingStatus.status === 'success' || (disabled && uploadedStatus === 'uploaded')
                ? 'bg-green-500' 
                : 'gold-accent'
            }`}>
              {processingStatus.status === 'success' || (disabled && uploadedStatus === 'uploaded') ? (
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              ) : (
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm sm:text-base font-semibold">{title}</CardTitle>
              <p className="text-xs text-slate-500 line-clamp-2">{description}</p>
              {subtitle && (
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{subtitle}</p>
              )}
              {lastUpdated && (
                <p className="text-xs text-slate-400 mt-1">Last updated: {lastUpdated}</p>
              )}
            </div>
          </div>
          <Badge variant={uploadedStatus === 'uploaded' ? 'default' : 'outline'} className="text-xs shrink-0">
            {disabled && uploadedStatus === 'uploaded' ? (
              <><Lock className="w-3 h-3 mr-1" /> Locked</>
            ) : uploadedStatus === 'uploaded' ? (
              <><CheckCircle className="w-3 h-3 mr-1" /> Done</>
            ) : (
              <><Upload className="w-3 h-3 mr-1" /> Ready</>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {statusContent()}
      </CardContent>
    </Card>
  );
}
