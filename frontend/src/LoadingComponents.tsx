import React from 'react';

// --- BUTTON SPINNER ---
interface ButtonSpinnerProps {
  loading?: boolean;
  label: string;
  loadingLabel?: string;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}

export const PremiumButton: React.FC<ButtonSpinnerProps> = ({
  loading = false,
  label,
  loadingLabel = 'Processing...',
  className = 'hex-blueprint-btn',
  onClick,
  disabled = false,
  style,
  type = 'button',
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${className} ${loading ? 'loading-state' : ''}`}
      style={{
        ...style,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled || loading ? 0.65 : 1,
        transition: 'all 0.25s ease',
      }}
    >
      {loading && <span className="spinner-inline" />}
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
};

// --- SKELETON BASE ---
interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return <div className={`skeleton ${className}`} style={style} />;
};

export const SkeletonText: React.FC<SkeletonProps & { lines?: number }> = ({ className = '', style, lines = 1 }) => {
  return (
    <div style={{ width: '100%' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`skeleton-text ${className}`}
          style={{
            ...style,
            width: i === lines - 1 && lines > 1 ? '70%' : '100%',
          }}
        />
      ))}
    </div>
  );
};

export const SkeletonTitle: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return <Skeleton className={`skeleton-title ${className}`} style={style} />;
};

export const SkeletonCircle: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return <Skeleton className={`skeleton-circle ${className}`} style={style} />;
};

// --- PREMIUM CARD SKELETON ---
export const SkeletonCard: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
  return (
    <div className="skeleton-card animate-fade-in-up">
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <SkeletonCircle />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <Skeleton style={{ height: '14px', width: '50%' }} />
          <Skeleton style={{ height: '10px', width: '30%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="skeleton-text" style={{ width: `${100 - i * 12}%` }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <Skeleton style={{ height: '32px', width: '80px', borderRadius: '4px' }} />
        <Skeleton style={{ height: '32px', width: '80px', borderRadius: '4px' }} />
      </div>
    </div>
  );
};

// --- PREMIUM TABLE SKELETON ---
interface SkeletonTableProps {
  cols?: number;
  rows?: number;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({ cols = 4, rows = 4 }) => {
  return (
    <div className="glass-panel animate-fade-in-up" style={{ padding: '1.25rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '40%' }}>
          <Skeleton style={{ height: '1.25rem', width: '60%' }} />
          <Skeleton style={{ height: '0.75rem', width: '90%' }} />
        </div>
        <Skeleton style={{ height: '36px', width: '120px', borderRadius: '6px' }} />
      </div>
      
      <div className="screening-table-container">
        <table className="screening-table">
          <thead>
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} style={{ padding: '0.75rem 0.5rem' }}>
                  <Skeleton style={{ height: '12px', width: '70%' }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c} style={{ padding: '1rem 0.5rem' }}>
                    <Skeleton
                      style={{
                        height: '10px',
                        width: c === 0 ? '40%' : c === 1 ? '90%' : c === 2 ? '60%' : '75%',
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- PROGRESS BAR / INDICATOR ---
interface ProgressBarProps {
  progress: number; // 0 to 100
  statusText?: string;
  showPct?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, statusText, showPct = true }) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{statusText || 'Processing operation...'}</span>
        {showPct && <span style={{ color: 'var(--accent-pink)' }}>{Math.round(clampedProgress)}%</span>}
      </div>
      <div className="progress-bar-bg" style={{ height: '6px' }}>
        <div 
          className="progress-bar-fill" 
          style={{ 
            width: `${clampedProgress}%`,
            transition: 'width 0.4s cubic-bezier(0.1, 0.8, 0.2, 1)'
          }}
        />
      </div>
    </div>
  );
};

// --- IMAGE PLACEHOLDER SKELETON ---
export const SkeletonImage: React.FC<{ aspectRatio?: string; className?: string }> = ({
  aspectRatio = '16/9',
  className = '',
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: '100%',
        aspectRatio,
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    </div>
  );
};

// --- PAGE TRANSITION OVERLAY OR CONTAINER ---
interface PageTransitionProps {
  children: React.ReactNode;
  activeKey: string;
  loading?: boolean;
}

export const PageTransitionWrapper: React.FC<PageTransitionProps> = ({ children, activeKey, loading = false }) => {
  const [showSkeleton, setShowSkeleton] = React.useState(false);

  React.useEffect(() => {
    if (loading) {
      setShowSkeleton(true);
      return;
    }
    // Simulate brief loading transition to look premium
    setShowSkeleton(true);
    const timer = setTimeout(() => {
      setShowSkeleton(false);
    }, 380); // sleek, sub-500ms transition
    return () => clearTimeout(timer);
  }, [activeKey, loading]);

  if (showSkeleton) {
    return (
      <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
        <div style={{ display: 'flex', gap: '1.5rem', width: '100%' }}>
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <SkeletonTable cols={4} rows={3} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <SkeletonCard rows={2} />
            <SkeletonCard rows={3} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div key={activeKey} className="animate-fade-in-up" style={{ width: '100%' }}>
      {children}
    </div>
  );
};

// --- SEARCH & FILTER SKELETON ---
export const SearchFilterLoader: React.FC = () => {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', width: '100%' }} className="pulse-light">
      <Skeleton style={{ height: '38px', flex: 1, borderRadius: '6px' }} />
      <Skeleton style={{ height: '38px', width: '100px', borderRadius: '6px' }} />
      <Skeleton style={{ height: '38px', width: '100px', borderRadius: '6px' }} />
    </div>
  );
};

// --- INFINITE SCROLL / PAGINATION SPINNER ---
export const ListLoadMoreSpinner: React.FC = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem', width: '100%' }} className="pulse-light">
      <span className="spinner-inline spinner-lg" style={{ color: 'var(--accent-pink)' }} />
      <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginLeft: '0.5rem', alignSelf: 'center' }}>
        Syncing transactions...
      </span>
    </div>
  );
};

// --- FILE PROGRESS INDICATOR ---
export const FileUploadProgress: React.FC<{ fileName: string; progress: number; onCancel?: () => void }> = ({
  fileName,
  progress,
  onCancel,
}) => {
  return (
    <div className="glass-panel" style={{ padding: '1rem', borderStyle: 'dashed', borderColor: 'var(--accent-pink-glow)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-pink)' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{fileName}</span>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="console-clear-btn" style={{ margin: 0 }}>
            Cancel
          </button>
        )}
      </div>
      <ProgressBar progress={progress} statusText={progress < 100 ? 'Uploading deliverable...' : 'Upload completed'} />
    </div>
  );
};
