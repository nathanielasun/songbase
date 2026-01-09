# Library Components

This directory contains reusable components for the library page.

## CollapsibleSection

A collapsible section with a clickable header (downloads tab style).

**Usage:**
```tsx
<CollapsibleSection
  title="Recent Activity"
  icon={<QueueListIcon className="h-5 w-5 text-gray-300" />}
  isCollapsed={isRecentActivityCollapsed}
  onToggle={() => setIsRecentActivityCollapsed(!isRecentActivityCollapsed)}
  headerRight={<button>Optional Right Content</button>}
>
  <div>Your content here</div>
</CollapsibleSection>
```

**Props:**
- `title` (string): Section title
- `icon` (ReactNode, optional): Icon to display next to title
- `isCollapsed` (boolean): Collapsed state
- `onToggle` (function): Toggle handler
- `children` (ReactNode): Section content
- `headerRight` (ReactNode, optional): Content to display on the right side of the header
- `defaultPadding` (boolean, default: true): Whether to add default margin-top to children

## CollapsiblePanel

A collapsible panel with icon+title on left, chevron button on right (stats tab style).

**Usage:**
```tsx
<CollapsiblePanel
  title="Database Overview"
  icon={<ChartBarIcon className="h-5 w-5 text-gray-300" />}
  isCollapsed={statsCollapsed}
  onToggle={() => setStatsCollapsed(!statsCollapsed)}
>
  <p className="text-sm text-gray-400 mt-2">
    Your content here
  </p>
</CollapsiblePanel>
```

**Props:**
- `title` (string): Panel title
- `icon` (ReactNode, optional): Icon to display next to title
- `isCollapsed` (boolean): Collapsed state
- `onToggle` (function): Toggle handler
- `children` (ReactNode): Panel content

## Migration Guide

### Before (manual implementation):
```tsx
<section className="rounded-2xl bg-gray-900/70 p-6 border border-gray-800">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <ChartBarIcon className="h-5 w-5 text-gray-300" />
      <h2 className="text-xl font-semibold">Database Overview</h2>
    </div>
    <button
      onClick={() => setStatsCollapsed(!statsCollapsed)}
      className="rounded-full p-1 text-gray-400 hover:text-white"
      title={statsCollapsed ? "Expand" : "Collapse"}
    >
      {statsCollapsed ? (
        <ChevronDownIcon className="h-5 w-5" />
      ) : (
        <ChevronUpIcon className="h-5 w-5" />
      )}
    </button>
  </div>
  {!statsCollapsed && (
    <>
      <p className="text-sm text-gray-400 mt-2">Content</p>
    </>
  )}
</section>
```

### After (using CollapsiblePanel):
```tsx
<CollapsiblePanel
  title="Database Overview"
  icon={<ChartBarIcon className="h-5 w-5 text-gray-300" />}
  isCollapsed={statsCollapsed}
  onToggle={() => setStatsCollapsed(!statsCollapsed)}
>
  <p className="text-sm text-gray-400 mt-2">Content</p>
</CollapsiblePanel>
```

## Future Improvements

Consider creating additional components for:
- Individual tab sections (DownloadsTab, StatsTab, ManageTab)
- Common table layouts
- Status badges and indicators
- Form input groups
