'use client';

import {
  ReactNode,
  useState,
  useRef,
  useEffect,
  createContext,
  useContext,
  KeyboardEvent,
  useId,
} from 'react';
import { KEYBOARD_KEYS, announceToScreenReader } from '../charts/accessibility';

/**
 * Accessible Tabs Component
 *
 * Features:
 * - Full keyboard navigation (Arrow keys, Home, End)
 * - ARIA roles and attributes
 * - Focus management
 * - Screen reader announcements
 * - Reduced motion support
 */

interface TabsContextType {
  activeTab: string;
  setActiveTab: (id: string) => void;
  registerTab: (id: string, label: string) => void;
  unregisterTab: (id: string) => void;
  tabsId: string;
  orientation: 'horizontal' | 'vertical';
}

const TabsContext = createContext<TabsContextType | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tab components must be used within a Tabs component');
  }
  return context;
}

interface TabsProps {
  children: ReactNode;
  defaultTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Tabs({
  children,
  defaultTab,
  activeTab: controlledActiveTab,
  onTabChange,
  orientation = 'horizontal',
  className = '',
}: TabsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultTab || '');
  const [tabs, setTabs] = useState<Map<string, string>>(new Map());
  const tabsId = useId();

  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;

  const setActiveTab = (id: string) => {
    if (controlledActiveTab === undefined) {
      setInternalActiveTab(id);
    }
    onTabChange?.(id);

    // Announce tab change to screen readers
    const label = tabs.get(id);
    if (label) {
      announceToScreenReader(`${label} tab selected`);
    }
  };

  const registerTab = (id: string, label: string) => {
    setTabs((prev) => new Map(prev).set(id, label));
    // Set first tab as default if no default specified
    if (!defaultTab && !internalActiveTab) {
      setInternalActiveTab(id);
    }
  };

  const unregisterTab = (id: string) => {
    setTabs((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <TabsContext.Provider
      value={{ activeTab, setActiveTab, registerTab, unregisterTab, tabsId, orientation }}
    >
      <div
        className={className}
        data-orientation={orientation}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface TabListProps {
  children: ReactNode;
  className?: string;
  label?: string;
}

export function TabList({ children, className = '', label }: TabListProps) {
  const { tabsId, orientation, activeTab, setActiveTab } = useTabsContext();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabIds, setTabIds] = useState<string[]>([]);

  // Collect tab IDs for keyboard navigation
  useEffect(() => {
    if (tabListRef.current) {
      const tabs = tabListRef.current.querySelectorAll('[role="tab"]');
      const ids = Array.from(tabs).map((tab) => tab.id.replace(`${tabsId}-tab-`, ''));
      setTabIds(ids);
    }
  }, [children, tabsId]);

  const handleKeyDown = (event: KeyboardEvent) => {
    const currentIndex = tabIds.indexOf(activeTab);
    let newIndex = currentIndex;

    const isHorizontal = orientation === 'horizontal';
    const prevKey = isHorizontal ? KEYBOARD_KEYS.ARROW_LEFT : KEYBOARD_KEYS.ARROW_UP;
    const nextKey = isHorizontal ? KEYBOARD_KEYS.ARROW_RIGHT : KEYBOARD_KEYS.ARROW_DOWN;

    switch (event.key) {
      case prevKey:
        event.preventDefault();
        newIndex = currentIndex - 1;
        if (newIndex < 0) newIndex = tabIds.length - 1;
        break;
      case nextKey:
        event.preventDefault();
        newIndex = currentIndex + 1;
        if (newIndex >= tabIds.length) newIndex = 0;
        break;
      case KEYBOARD_KEYS.HOME:
        event.preventDefault();
        newIndex = 0;
        break;
      case KEYBOARD_KEYS.END:
        event.preventDefault();
        newIndex = tabIds.length - 1;
        break;
      default:
        return;
    }

    if (newIndex !== currentIndex && tabIds[newIndex]) {
      setActiveTab(tabIds[newIndex]);
      // Focus the new tab
      const newTab = tabListRef.current?.querySelector(`#${tabsId}-tab-${tabIds[newIndex]}`);
      if (newTab instanceof HTMLElement) {
        newTab.focus();
      }
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      className={`flex ${
        orientation === 'vertical' ? 'flex-col' : 'flex-row'
      } ${className}`}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

interface TabProps {
  id: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export function Tab({ id, children, className = '', disabled = false, icon }: TabProps) {
  const { activeTab, setActiveTab, registerTab, unregisterTab, tabsId } = useTabsContext();
  const isActive = activeTab === id;
  const tabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const label = typeof children === 'string' ? children : id;
    registerTab(id, label);
    return () => unregisterTab(id);
  }, [id, children, registerTab, unregisterTab]);

  return (
    <button
      ref={tabRef}
      id={`${tabsId}-tab-${id}`}
      role="tab"
      aria-selected={isActive}
      aria-controls={`${tabsId}-panel-${id}`}
      aria-disabled={disabled}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(id)}
      className={`
        flex items-center gap-2 px-4 py-2 text-sm font-medium
        transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500
        ${
          isActive
            ? 'text-white border-b-2 border-pink-500'
            : 'text-gray-400 hover:text-gray-200 border-b-2 border-transparent'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}

interface TabPanelProps {
  id: string;
  children: ReactNode;
  className?: string;
  lazy?: boolean;
}

export function TabPanel({ id, children, className = '', lazy = false }: TabPanelProps) {
  const { activeTab, tabsId } = useTabsContext();
  const isActive = activeTab === id;
  const [hasRendered, setHasRendered] = useState(isActive);

  useEffect(() => {
    if (isActive) {
      setHasRendered(true);
    }
  }, [isActive]);

  // If lazy, don't render until first activation
  if (lazy && !hasRendered) {
    return null;
  }

  return (
    <div
      id={`${tabsId}-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`${tabsId}-tab-${id}`}
      hidden={!isActive}
      tabIndex={0}
      className={`focus:outline-none ${isActive ? '' : 'hidden'} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Accessible Stats Tab Navigation
 * Pre-styled for the stats dashboard
 */
interface StatsTabsProps {
  tabs: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
  }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function StatsTabs({ tabs, activeTab, onTabChange, className = '' }: StatsTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent) => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    let newIndex = currentIndex;

    switch (event.key) {
      case KEYBOARD_KEYS.ARROW_LEFT:
        event.preventDefault();
        newIndex = currentIndex - 1;
        if (newIndex < 0) newIndex = tabs.length - 1;
        break;
      case KEYBOARD_KEYS.ARROW_RIGHT:
        event.preventDefault();
        newIndex = currentIndex + 1;
        if (newIndex >= tabs.length) newIndex = 0;
        break;
      case KEYBOARD_KEYS.HOME:
        event.preventDefault();
        newIndex = 0;
        break;
      case KEYBOARD_KEYS.END:
        event.preventDefault();
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    if (newIndex !== currentIndex) {
      onTabChange(tabs[newIndex].id);
      announceToScreenReader(`${tabs[newIndex].label} tab selected`);

      // Focus the new tab button
      const buttons = tabListRef.current?.querySelectorAll('button');
      buttons?.[newIndex]?.focus();
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label="Statistics sections"
      className={`flex flex-wrap gap-1 p-1 bg-gray-900/50 rounded-xl ${className}`}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tab.id}-panel`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500
              ${
                isActive
                  ? 'bg-pink-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }
            `}
          >
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Accessible navigation for data grids and lists
 */
interface GridNavigationProps {
  itemCount: number;
  columns?: number;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onSelect?: (index: number) => void;
  loop?: boolean;
  children: (props: { isFocused: boolean; index: number }) => ReactNode;
  className?: string;
  itemClassName?: string;
}

export function GridNavigation({
  itemCount,
  columns = 1,
  currentIndex,
  onIndexChange,
  onSelect,
  loop = true,
  children,
  className = '',
  itemClassName = '',
}: GridNavigationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent) => {
    let newIndex = currentIndex;
    const rows = Math.ceil(itemCount / columns);
    const currentRow = Math.floor(currentIndex / columns);
    const currentCol = currentIndex % columns;

    switch (event.key) {
      case KEYBOARD_KEYS.ARROW_RIGHT:
        event.preventDefault();
        newIndex = currentIndex + 1;
        if (newIndex >= itemCount) {
          newIndex = loop ? 0 : itemCount - 1;
        }
        break;
      case KEYBOARD_KEYS.ARROW_LEFT:
        event.preventDefault();
        newIndex = currentIndex - 1;
        if (newIndex < 0) {
          newIndex = loop ? itemCount - 1 : 0;
        }
        break;
      case KEYBOARD_KEYS.ARROW_DOWN:
        event.preventDefault();
        newIndex = currentIndex + columns;
        if (newIndex >= itemCount) {
          newIndex = loop ? currentCol : currentIndex;
        }
        break;
      case KEYBOARD_KEYS.ARROW_UP:
        event.preventDefault();
        newIndex = currentIndex - columns;
        if (newIndex < 0) {
          newIndex = loop ? (rows - 1) * columns + currentCol : currentIndex;
          if (newIndex >= itemCount) newIndex = itemCount - 1;
        }
        break;
      case KEYBOARD_KEYS.HOME:
        event.preventDefault();
        newIndex = 0;
        break;
      case KEYBOARD_KEYS.END:
        event.preventDefault();
        newIndex = itemCount - 1;
        break;
      case KEYBOARD_KEYS.ENTER:
      case KEYBOARD_KEYS.SPACE:
        event.preventDefault();
        onSelect?.(currentIndex);
        return;
      default:
        return;
    }

    if (newIndex !== currentIndex) {
      onIndexChange(newIndex);
    }
  };

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-rowcount={Math.ceil(itemCount / columns)}
      aria-colcount={columns}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 rounded-lg ${className}`}
    >
      {Array.from({ length: itemCount }).map((_, index) => (
        <div
          key={index}
          role="gridcell"
          aria-selected={index === currentIndex}
          className={`${index === currentIndex ? 'ring-2 ring-pink-500' : ''} ${itemClassName}`}
          onClick={() => onIndexChange(index)}
        >
          {children({ isFocused: index === currentIndex, index })}
        </div>
      ))}
    </div>
  );
}

/**
 * Skip link for keyboard users to bypass navigation
 */
interface SkipLinkProps {
  targetId: string;
  children?: ReactNode;
}

export function SkipLink({ targetId, children = 'Skip to main content' }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="
        sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
        focus:z-50 focus:px-4 focus:py-2 focus:bg-pink-600 focus:text-white
        focus:rounded-lg focus:shadow-lg
      "
    >
      {children}
    </a>
  );
}

/**
 * Live region for dynamic announcements
 */
interface LiveRegionProps {
  message: string;
  priority?: 'polite' | 'assertive';
}

export function LiveRegion({ message, priority = 'polite' }: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
