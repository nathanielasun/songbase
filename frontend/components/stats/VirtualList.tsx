'use client';

/**
 * VirtualList Component
 *
 * A performant virtualized list that only renders visible items.
 * Significantly improves performance for long lists (100+ items).
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
  CSSProperties,
} from 'react';

interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  /** Height of the container (viewport) */
  height: number;
  /** Optional: Number of items to render outside visible area (buffer) */
  overscan?: number;
  /** Optional: Custom className for container */
  className?: string;
  /** Optional: Empty state to show when no items */
  emptyState?: ReactNode;
  /** Optional: Loading state */
  loading?: boolean;
  /** Optional: Loading skeleton */
  loadingSkeleton?: ReactNode;
  /** Optional: Key extractor for items */
  getItemKey?: (item: T, index: number) => string | number;
  /** Optional: Callback when scroll position changes */
  onScroll?: (scrollTop: number) => void;
  /** Optional: Callback when nearing end of list */
  onEndReached?: () => void;
  /** Optional: Threshold for onEndReached (in pixels from bottom) */
  endReachedThreshold?: number;
}

export default function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  height,
  overscan = 3,
  className = '',
  emptyState,
  loading = false,
  loadingSkeleton,
  getItemKey,
  onScroll,
  onEndReached,
  endReachedThreshold = 200,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const hasCalledEndReached = useRef(false);

  // Calculate visible range
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(height / itemHeight) + 2 * overscan;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);

      // Check if near end
      const scrollHeight = e.currentTarget.scrollHeight;
      const clientHeight = e.currentTarget.clientHeight;
      const distanceFromBottom = scrollHeight - newScrollTop - clientHeight;

      if (distanceFromBottom < endReachedThreshold && !hasCalledEndReached.current) {
        hasCalledEndReached.current = true;
        onEndReached?.();
      } else if (distanceFromBottom >= endReachedThreshold) {
        hasCalledEndReached.current = false;
      }
    },
    [onScroll, onEndReached, endReachedThreshold]
  );

  // Reset end reached flag when items change
  useEffect(() => {
    hasCalledEndReached.current = false;
  }, [items.length]);

  // Memoize visible items
  const visibleItems = useMemo(() => {
    const result: ReactNode[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      const style: CSSProperties = {
        position: 'absolute',
        top: i * itemHeight,
        left: 0,
        right: 0,
        height: itemHeight,
      };
      const key = getItemKey ? getItemKey(item, i) : i;
      result.push(
        <div key={key} style={style}>
          {renderItem(item, i, style)}
        </div>
      );
    }
    return result;
  }, [items, startIndex, endIndex, itemHeight, renderItem, getItemKey]);

  // Handle loading state
  if (loading && loadingSkeleton) {
    return <div className={className}>{loadingSkeleton}</div>;
  }

  // Handle empty state
  if (items.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height, position: 'relative' }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems}
      </div>
    </div>
  );
}

/**
 * Simple virtualized list item wrapper with hover effects
 */
interface VirtualListItemProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function VirtualListItem({
  children,
  onClick,
  className = '',
  style,
}: VirtualListItemProps) {
  return (
    <div
      className={`flex items-center px-4 hover:bg-gray-800/50 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * Hook for windowed list rendering without a container
 * Useful when you need more control over the container
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  scrollTop = 0,
  overscan = 3,
}: {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  scrollTop?: number;
  overscan?: number;
}) {
  return useMemo(() => {
    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + 2 * overscan;
    const endIndex = Math.min(items.length, startIndex + visibleCount);

    const visibleItems: { item: T; index: number; style: CSSProperties }[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      visibleItems.push({
        item: items[i],
        index: i,
        style: {
          position: 'absolute',
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
        },
      });
    }

    return {
      visibleItems,
      totalHeight,
      startIndex,
      endIndex,
    };
  }, [items, itemHeight, containerHeight, scrollTop, overscan]);
}

/**
 * Infinite scroll wrapper for VirtualList
 */
interface InfiniteVirtualListProps<T> extends VirtualListProps<T> {
  /** Whether more items are being loaded */
  loadingMore?: boolean;
  /** Whether there are more items to load */
  hasMore?: boolean;
  /** Callback to load more items */
  loadMore: () => void;
}

export function InfiniteVirtualList<T>({
  loadingMore = false,
  hasMore = true,
  loadMore,
  ...props
}: InfiniteVirtualListProps<T>) {
  const handleEndReached = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadMore();
    }
  }, [loadingMore, hasMore, loadMore]);

  return (
    <VirtualList
      {...props}
      onEndReached={handleEndReached}
    />
  );
}

/**
 * Grouped virtual list for sectioned data
 */
interface GroupedVirtualListProps<T, G> {
  /** Groups with their items */
  groups: { group: G; items: T[] }[];
  /** Height of each item */
  itemHeight: number;
  /** Height of group headers */
  headerHeight: number;
  /** Render function for items */
  renderItem: (item: T, index: number, groupIndex: number) => ReactNode;
  /** Render function for group headers */
  renderHeader: (group: G, groupIndex: number) => ReactNode;
  /** Container height */
  height: number;
  /** Optional className */
  className?: string;
  /** Empty state */
  emptyState?: ReactNode;
}

export function GroupedVirtualList<T, G>({
  groups,
  itemHeight,
  headerHeight,
  renderItem,
  renderHeader,
  height,
  className = '',
  emptyState,
}: GroupedVirtualListProps<T, G>) {
  // Flatten groups into a single array with position info
  const flatItems = useMemo(() => {
    const items: {
      type: 'header' | 'item';
      data: T | G;
      groupIndex: number;
      itemIndex?: number;
      offset: number;
      height: number;
    }[] = [];

    let offset = 0;
    groups.forEach((group, groupIndex) => {
      // Add header
      items.push({
        type: 'header',
        data: group.group,
        groupIndex,
        offset,
        height: headerHeight,
      });
      offset += headerHeight;

      // Add items
      group.items.forEach((item, itemIndex) => {
        items.push({
          type: 'item',
          data: item,
          groupIndex,
          itemIndex,
          offset,
          height: itemHeight,
        });
        offset += itemHeight;
      });
    });

    return items;
  }, [groups, itemHeight, headerHeight]);

  const totalHeight = flatItems.reduce((sum, item) => sum + item.height, 0);

  if (flatItems.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <VirtualList
      items={flatItems}
      itemHeight={itemHeight} // Approximate, actual height varies
      height={height}
      className={className}
      renderItem={(item, index, style) => {
        const actualStyle = {
          ...style,
          top: item.offset,
          height: item.height,
        };

        if (item.type === 'header') {
          return (
            <div style={actualStyle} className="sticky top-0 z-10 bg-gray-900">
              {renderHeader(item.data as G, item.groupIndex)}
            </div>
          );
        }

        return (
          <div style={actualStyle}>
            {renderItem(item.data as T, item.itemIndex!, item.groupIndex)}
          </div>
        );
      }}
      getItemKey={(item, index) => `${item.type}-${item.groupIndex}-${item.itemIndex ?? 0}`}
    />
  );
}
