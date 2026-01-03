import React, { useState, useEffect } from 'react';

export interface FileNameModalProps {
  isOpen: boolean;
  title: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (fileName: string) => void;
  onCancel: () => void;
}

export const FileNameModal: React.FC<FileNameModalProps> = ({
  isOpen,
  title,
  defaultValue = '',
  placeholder = 'Enter filename',
  onConfirm,
  onCancel
}) => {
  const [fileName, setFileName] = useState(defaultValue);

  // Reset filename when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFileName(defaultValue);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fileName.trim()) {
      onConfirm(fileName.trim());
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div 
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        className="modal-content"
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          minWidth: '400px',
          maxWidth: '500px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          border: '1px solid #ddd'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{
          margin: '0 0 16px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#333'
        }}>
          {title}
        </h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder={placeholder}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              marginBottom: '24px',
              boxSizing: 'border-box'
            }}
          />
          
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#666',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              Cancel
            </button>
            
            <button
              type="submit"
              disabled={!fileName.trim()}
              style={{
                padding: '8px 16px',
                border: '1px solid #007bff',
                borderRadius: '4px',
                backgroundColor: fileName.trim() ? '#007bff' : '#ccc',
                color: 'white',
                fontSize: '14px',
                cursor: fileName.trim() ? 'pointer' : 'not-allowed',
                fontWeight: '500'
              }}
              onMouseOver={(e) => {
                if (fileName.trim()) {
                  e.currentTarget.style.backgroundColor = '#0056b3';
                }
              }}
              onMouseOut={(e) => {
                if (fileName.trim()) {
                  e.currentTarget.style.backgroundColor = '#007bff';
                }
              }}
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
