"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  RotateCcw,
  X,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FlamegraphViewerProps {
  flamegraphId: string;
  fileName: string;
  className?: string;
}

export function FlamegraphViewer({
  flamegraphId,
  fileName,
  className,
}: FlamegraphViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch signed URL and then SVG content
  useEffect(() => {
    const fetchFlamegraph = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get signed URL from API
        const urlResponse = await fetch(`/api/flamegraphs/${flamegraphId}`);
        if (!urlResponse.ok) {
          throw new Error(`Failed to get flamegraph URL: ${urlResponse.statusText}`);
        }
        const { url } = await urlResponse.json();
        setSignedUrl(url);

        // Fetch SVG content
        const svgResponse = await fetch(url);
        if (!svgResponse.ok) {
          throw new Error(`Failed to load flamegraph: ${svgResponse.statusText}`);
        }
        const text = await svgResponse.text();
        setSvgContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load flamegraph");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFlamegraph();
  }, [flamegraphId]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.25, 0.25));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(Math.max(prev * delta, 0.25), 5));
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleDownload = useCallback(() => {
    if (!signedUrl) return;
    const link = document.createElement("a");
    link.href = signedUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [signedUrl, fileName]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const viewerContent = (
    <div
      className={cn(
        "relative flex flex-col bg-background border rounded-lg overflow-hidden",
        isFullscreen && "fixed inset-0 z-50 rounded-none border-none",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/50">
        <span className="text-sm font-medium truncate px-2">{fileName}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomOut}
            title="Zoom out"
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomIn}
            title="Zoom in"
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleReset}
            title="Reset view"
          >
            <RotateCcw className="size-4" />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDownload}
            disabled={!signedUrl}
            title="Download"
          >
            <Download className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
          {isFullscreen && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsFullscreen(false)}
              title="Close"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* SVG Container */}
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden cursor-grab",
          isDragging && "cursor-grabbing",
          isFullscreen ? "flex-1" : "h-[400px]"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="text-destructive text-sm">{error}</div>
          </div>
        )}
        {svgContent && !isLoading && !error && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>

      {/* Help text */}
      <div className="text-xs text-muted-foreground p-2 border-t bg-muted/30 text-center">
        Scroll to zoom, drag to pan
      </div>
    </div>
  );

  return viewerContent;
}

interface FlamegraphListProps {
  flamegraphs: Array<{
    id: string;
    fileName: string;
    fileSize: number;
  }>;
  className?: string;
}

export function FlamegraphList({ flamegraphs, className }: FlamegraphListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (flamegraphs.length === 0) {
    return null;
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {flamegraphs.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {flamegraphs.map((fg, index) => (
            <Button
              key={fg.id}
              variant={index === selectedIndex ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedIndex(index)}
            >
              {fg.fileName}
              <span className="text-xs opacity-70 ml-1">
                ({formatFileSize(fg.fileSize)})
              </span>
            </Button>
          ))}
        </div>
      )}
      <FlamegraphViewer
        flamegraphId={flamegraphs[selectedIndex].id}
        fileName={flamegraphs[selectedIndex].fileName}
      />
    </div>
  );
}

interface FlamegraphBadgeProps {
  count: number;
  onClick?: () => void;
}

export function FlamegraphBadge({ count, onClick }: FlamegraphBadgeProps) {
  if (count === 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 gap-1 text-xs"
      onClick={onClick}
    >
      <Flame className="size-3 text-orange-500" />
      <span>{count}</span>
    </Button>
  );
}
