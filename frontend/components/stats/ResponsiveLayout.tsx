'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

// ============================================================================
// Media Query Hook
// ============================================================================

type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const breakpoints: Record<Breakpoint, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

type BreakpointType = 'mobile' | 'tablet' | 'desktop' | 'large';

interface BreakpointState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
  breakpoint: BreakpointType;
}

export function useBreakpoint(): BreakpointState {
  const [state, setState] = useState<BreakpointState>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isLargeDesktop: false,
    breakpoint: 'desktop',
  });

  useEffect(() => {
    const checkBreakpoint = () => {
      const width = window.innerWidth;
      const isMobile = width < breakpoints.md;
      const isTablet = width >= breakpoints.md && width < breakpoints.lg;
      const isDesktop = width >= breakpoints.lg && width < breakpoints.xl;
      const isLargeDesktop = width >= breakpoints.xl;

      let bp: 'mobile' | 'tablet' | 'desktop' | 'large' = 'desktop';
      if (isMobile) bp = 'mobile';
      else if (isTablet) bp = 'tablet';
      else if (isLargeDesktop) bp = 'large';

      setState({ isMobile, isTablet, isDesktop, isLargeDesktop, breakpoint: bp });
    };

    checkBreakpoint();
    window.addEventListener('resize', checkBreakpoint);
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, []);

  return state;
}

// ============================================================================
// Swipe Hook for Touch Gestures
// ============================================================================

interface SwipeState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  swiping: boolean;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
}

export function useSwipe(options: UseSwipeOptions = {}) {
  const { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold = 50 } = options;
  const [swipeState, setSwipeState] = useState<SwipeState>({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    swiping: false,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setSwipeState({
      startX: touch.clientX,
      startY: touch.clientY,
      endX: touch.clientX,
      endY: touch.clientY,
      swiping: true,
    });
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeState.swiping) return;
    const touch = e.touches[0];
    setSwipeState((prev) => ({
      ...prev,
      endX: touch.clientX,
      endY: touch.clientY,
    }));
  }, [swipeState.swiping]);

  const handleTouchEnd = useCallback(() => {
    if (!swipeState.swiping) return;

    const deltaX = swipeState.endX - swipeState.startX;
    const deltaY = swipeState.endY - swipeState.startY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Determine if horizontal or vertical swipe
    if (absDeltaX > absDeltaY && absDeltaX > threshold) {
      if (deltaX > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    } else if (absDeltaY > absDeltaX && absDeltaY > threshold) {
      if (deltaY > 0) {
        onSwipeDown?.();
      } else {
        onSwipeUp?.();
      }
    }

    setSwipeState((prev) => ({ ...prev, swiping: false }));
  }, [swipeState, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    swiping: swipeState.swiping,
    swipeOffset: swipeState.endX - swipeState.startX,
  };
}

// ============================================================================
// Swipeable Tabs Component
// ============================================================================

interface Tab {
  key: string;
  label: string;
  icon?: React.ElementType;
}

interface SwipeableTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
  className?: string;
}

export function SwipeableTabs({
  tabs,
  activeTab,
  onTabChange,
  children,
  className = '',
}: SwipeableTabsProps) {
  const { isMobile } = useBreakpoint();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndex = tabs.findIndex((t) => t.key === activeTab);

  const goToPrevTab = useCallback(() => {
    if (activeIndex > 0) {
      onTabChange(tabs[activeIndex - 1].key);
    }
  }, [activeIndex, tabs, onTabChange]);

  const goToNextTab = useCallback(() => {
    if (activeIndex < tabs.length - 1) {
      onTabChange(tabs[activeIndex + 1].key);
    }
  }, [activeIndex, tabs, onTabChange]);

  const { handlers, swiping, swipeOffset } = useSwipe({
    onSwipeLeft: goToNextTab,
    onSwipeRight: goToPrevTab,
  });

  return (
    <div className={className}>
      {/* Tab Navigation */}
      <div className="relative">
        {/* Mobile: Scrollable tabs */}
        <div
          className={`flex gap-1 mb-4 overflow-x-auto scrollbar-hide ${
            isMobile ? 'pb-2 -mx-2 px-2' : 'bg-gray-900/50 rounded-xl p-1 w-fit'
          }`}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Mobile swipe indicator */}
        {isMobile && tabs.length > 1 && (
          <div className="flex justify-center gap-1.5 mb-4">
            {tabs.map((tab, i) => (
              <div
                key={tab.key}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === activeIndex ? 'bg-pink-500' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Content with swipe support */}
      <div
        ref={containerRef}
        {...(isMobile ? handlers : {})}
        className="relative"
        style={{
          transform: swiping && isMobile ? `translateX(${swipeOffset * 0.3}px)` : undefined,
          transition: swiping ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Responsive Grid Component
// ============================================================================

interface ResponsiveGridProps {
  children: ReactNode;
  cols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    large?: number;
  };
  gap?: number | string;
  className?: string;
}

export function ResponsiveGrid({
  children,
  cols = { mobile: 1, tablet: 2, desktop: 2, large: 4 },
  gap = 4,
  className = '',
}: ResponsiveGridProps) {
  const gapClass = typeof gap === 'number' ? `gap-${gap}` : gap;

  return (
    <div
      className={`grid ${gapClass} ${className}`}
      style={{
        gridTemplateColumns: `repeat(var(--grid-cols), minmax(0, 1fr))`,
      }}
    >
      <style jsx>{`
        div {
          --grid-cols: ${cols.mobile || 1};
        }
        @media (min-width: 768px) {
          div {
            --grid-cols: ${cols.tablet || 2};
          }
        }
        @media (min-width: 1024px) {
          div {
            --grid-cols: ${cols.desktop || 2};
          }
        }
        @media (min-width: 1280px) {
          div {
            --grid-cols: ${cols.large || 4};
          }
        }
      `}</style>
      {children}
    </div>
  );
}

// ============================================================================
// Collapsible Section Component
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ElementType;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  collapsible?: boolean;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  className = '',
  headerClassName = '',
  collapsible = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const { isMobile, isTablet } = useBreakpoint();

  // Auto-collapse on mobile/tablet if collapsible
  const shouldCollapse = collapsible && (isMobile || isTablet);

  return (
    <div className={`bg-gray-900/70 rounded-2xl border border-gray-800 overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => shouldCollapse && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-4 ${
          shouldCollapse ? 'cursor-pointer hover:bg-gray-800/30' : 'cursor-default'
        } ${headerClassName}`}
        disabled={!shouldCollapse}
      >
        <h3 className="text-lg font-semibold flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-pink-500" />}
          {title}
        </h3>
        {shouldCollapse && (
          <div className="text-gray-400">
            {isOpen ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </div>
        )}
      </button>

      {/* Content */}
      <div
        ref={contentRef}
        className={`overflow-hidden transition-all duration-300 ${
          !shouldCollapse || isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-4 pt-0">{children}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Mobile Optimized Chart Wrapper
// ============================================================================

interface MobileChartWrapperProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  height?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  className?: string;
  scrollable?: boolean;
}

export function MobileChartWrapper({
  children,
  title,
  subtitle,
  height = { mobile: 250, tablet: 300, desktop: 350 },
  className = '',
  scrollable = false,
}: MobileChartWrapperProps) {
  const { breakpoint } = useBreakpoint();

  const chartHeight =
    breakpoint === 'mobile'
      ? height.mobile
      : breakpoint === 'tablet'
      ? height.tablet
      : height.desktop;

  return (
    <div className={`bg-gray-900/70 rounded-2xl p-4 border border-gray-800 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h4 className="text-sm font-medium text-white">{title}</h4>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div
        className={scrollable ? 'overflow-x-auto -mx-4 px-4' : ''}
        style={{ height: chartHeight }}
      >
        <div style={{ minWidth: scrollable ? 500 : undefined, height: '100%' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Responsive Card Stack
// ============================================================================

interface CardStackProps {
  children: ReactNode;
  className?: string;
}

export function CardStack({ children, className = '' }: CardStackProps) {
  return (
    <div className={`flex flex-col md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      {children}
    </div>
  );
}

// ============================================================================
// Touch-Friendly Button
// ============================================================================

interface TouchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ElementType;
  children?: ReactNode;
}

export function TouchButton({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  children,
  className = '',
  ...props
}: TouchButtonProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs min-h-[32px]',
    md: 'px-4 py-2 text-sm min-h-[44px]', // 44px for touch targets
    lg: 'px-6 py-3 text-base min-h-[52px]',
  };

  const variantClasses = {
    primary: 'bg-pink-600 text-white hover:bg-pink-500 active:bg-pink-700',
    secondary: 'bg-gray-800 text-gray-300 hover:bg-gray-700 active:bg-gray-600',
    ghost: 'text-gray-400 hover:text-white hover:bg-gray-800/50 active:bg-gray-800',
  };

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg font-medium
        transition-colors touch-manipulation
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      {...props}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

// ============================================================================
// Responsive Visibility Components
// ============================================================================

interface ShowOnProps {
  children: ReactNode;
  breakpoint: 'mobile' | 'tablet' | 'desktop' | 'large';
  className?: string;
}

export function ShowOnMobile({ children, className = '' }: Omit<ShowOnProps, 'breakpoint'>) {
  return <div className={`md:hidden ${className}`}>{children}</div>;
}

export function ShowOnTabletUp({ children, className = '' }: Omit<ShowOnProps, 'breakpoint'>) {
  return <div className={`hidden md:block ${className}`}>{children}</div>;
}

export function ShowOnDesktopUp({ children, className = '' }: Omit<ShowOnProps, 'breakpoint'>) {
  return <div className={`hidden lg:block ${className}`}>{children}</div>;
}

export function HideOnMobile({ children, className = '' }: Omit<ShowOnProps, 'breakpoint'>) {
  return <div className={`hidden md:block ${className}`}>{children}</div>;
}

// ============================================================================
// Responsive Context (optional, for complex apps)
// ============================================================================

interface ResponsiveContextValue {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  breakpoint: BreakpointType;
}

const ResponsiveContext = createContext<ResponsiveContextValue>({
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  breakpoint: 'desktop',
});

export function ResponsiveProvider({ children }: { children: ReactNode }) {
  const breakpointState = useBreakpoint();

  return (
    <ResponsiveContext.Provider value={breakpointState}>
      {children}
    </ResponsiveContext.Provider>
  );
}

export function useResponsive() {
  return useContext(ResponsiveContext);
}
