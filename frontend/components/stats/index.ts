// Stats components barrel export

export { default as ShareCard, fetchShareCardData, ShareCardButton } from './ShareCard';
export type { ShareCardType } from './ShareCard';
export { default as StatCard, HeroStatCard, MiniStatCard, InsightItem } from './StatCard';
export { default as OverviewTab } from './OverviewTab';
export { default as LibraryTab } from './LibraryTab';
export { default as ListeningTab } from './ListeningTab';
export { default as AudioTab } from './AudioTab';
export { default as DiscoveriesTab } from './DiscoveriesTab';
export { default as InsightsTab } from './InsightsTab';

// Filtering components
export {
  default as FilterBar,
  useStatsFilters,
  defaultFilters,
} from './FilterBar';
export type { StatsFilters } from './FilterBar';

// Real-time components
export {
  default as AnimatedCounter,
  AnimatedDuration,
  PulsingDot,
  LiveIndicator,
  StatCardWithAnimation,
} from './AnimatedCounter';
export { default as LiveActivityFeed } from './LiveActivityFeed';

// Drill-down navigation components
export {
  DrillDownProvider,
  useDrillDown,
  BreadcrumbTrail,
  ActiveDrillDowns,
  ClickableDrillDown,
} from './DrillDown';
export type { DrillDownItem } from './DrillDown';

// Detail modal components
export {
  default as DetailModal,
  ExpandButton,
  useDetailModal,
} from './DetailModal';

// Export components
export {
  default as ExportButton,
  QuickExportButton,
  ExportHistoryButton,
} from './ExportButton';

// Responsive layout components
export {
  useMediaQuery,
  useBreakpoint,
  useSwipe,
  SwipeableTabs,
  ResponsiveGrid,
  CollapsibleSection,
  MobileChartWrapper,
  CardStack,
  TouchButton,
  ShowOnMobile,
  ShowOnTabletUp,
  ShowOnDesktopUp,
  HideOnMobile,
  ResponsiveProvider,
  useResponsive,
} from './ResponsiveLayout';

// Empty state components
export {
  default as EmptyState,
  InlineEmptyState,
  Skeleton,
  StatCardSkeleton,
  ListSkeleton,
} from './EmptyState';

// Animation/transition components
export {
  ReducedMotionProvider,
  useReducedMotion,
  useAnimationContext,
  FadeIn,
  SlideIn,
  ScaleIn,
  Stagger,
  Collapse,
  TabTransition,
  AnimatedPresence,
  NumberTransition,
  Pulse,
  useInView,
  AnimateOnView,
  ANIMATION_STYLES,
} from './Transitions';

// Accessibility components
export {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  StatsTabs,
  GridNavigation,
  SkipLink,
  LiveRegion,
} from './AccessibleTabs';

// Virtual list for performance
export {
  default as VirtualList,
  VirtualListItem,
  useVirtualList,
  InfiniteVirtualList,
  GroupedVirtualList,
} from './VirtualList';
