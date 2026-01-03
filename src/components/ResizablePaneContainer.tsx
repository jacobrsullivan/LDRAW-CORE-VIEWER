import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ResizablePaneContainerProps {
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  initialSplitPercent?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
}

export const ResizablePaneContainer: React.FC<ResizablePaneContainerProps> = ({
  leftPane,
  rightPane,
  initialSplitPercent = 50,
  minLeftWidth = 200,
  minRightWidth = 200
}) => {
  const [leftWidthPercent, setLeftWidthPercent] = useState(initialSplitPercent);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const newLeftWidth = e.clientX - containerRect.left;
    const newLeftPercent = (newLeftWidth / containerWidth) * 100;

    // Apply constraints
    const minLeftPercent = (minLeftWidth / containerWidth) * 100;
    const minRightPercent = (minRightWidth / containerWidth) * 100;
    const maxLeftPercent = 100 - minRightPercent;

    const constrainedPercent = Math.max(
      minLeftPercent,
      Math.min(maxLeftPercent, newLeftPercent)
    );

    setLeftWidthPercent(constrainedPercent);
  }, [isDragging, minLeftWidth, minRightWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={containerRef}
      className="resizable-container"
      style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {/* Left Pane */}
      <div 
        className="resizable-pane-left"
        style={{
          width: `${leftWidthPercent}%`,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {leftPane}
      </div>

      {/* Drag Handle */}
      <div 
        className={`drag-handle ${isDragging ? 'dragging' : ''}`}
        style={{
          width: '4px',
          background: isDragging ? '#007bff' : '#ccc',
          cursor: 'col-resize',
          userSelect: 'none',
          borderLeft: '1px solid #999',
          borderRight: '1px solid #999',
          transition: isDragging ? 'none' : 'background 0.2s ease'
        }}
        onMouseDown={handleMouseDown}
      />

      {/* Right Pane */}
      <div 
        className="resizable-pane-right"
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {rightPane}
      </div>
    </div>
  );
};
