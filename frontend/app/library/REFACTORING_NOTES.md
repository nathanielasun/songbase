# Library Page Refactoring Notes

## Completed Work

### 1. All Panels Made Collapsible ✓

#### Downloads Tab (5 panels):
- ✓ Acquisition Backend (default: collapsed)
- ✓ Sources.jsonl (default: collapsed)
- ✓ Run Pipeline (default: expanded)
- ✓ Queue Status (default: collapsed)
- ✓ Recent Activity (default: collapsed)

#### Stats Tab (6 panels):
- ✓ Database Overview
- ✓ Queue Breakdown
- ✓ Song Metadata
- ✓ Metadata Verification
- ✓ Image & Artist Sync
- ✓ Link Unassigned Songs

### 2. Reusable Components Created ✓

Created two new components in `/app/library/components/`:

1. **CollapsibleSection.tsx** - Downloads tab style
   - Clickable header with icon, title, and chevron
   - Optional headerRight prop for additional content
   - Configurable padding

2. **CollapsiblePanel.tsx** - Stats tab style
   - Icon and title on left
   - Separate chevron button on right
   - Cleaner separation of concerns

### 3. Examples Refactored ✓

Demonstrated refactoring with:
- Recent Activity panel → CollapsibleSection
- Database Overview panel → CollapsiblePanel

## Current State Variables

The following state variables control panel collapse states:

### Downloads Tab:
- `isBackendCollapsed`
- `isSourcesCollapsed`
- `isPipelineCollapsed`
- `isQueueCollapsed`
- `isRecentActivityCollapsed`

### Stats Tab:
- `statsCollapsed`
- `queueBreakdownCollapsed`
- `songMetadataCollapsed`
- `metadataVerificationCollapsed`
- `imageSyncCollapsed`
- `linkUnassignedCollapsed`

## Next Steps (Optional)

### Phase 1: Complete Component Migration
Refactor remaining panels to use CollapsibleSection/CollapsiblePanel:

**Downloads Tab:**
- Acquisition Backend
- Sources.jsonl
- Run Pipeline
- Queue Status

**Stats Tab:**
- Queue Breakdown
- Song Metadata
- Metadata Verification
- Image & Artist Sync
- Link Unassigned Songs

### Phase 2: Extract Tab Components
Create separate files for each tab:
- `components/tabs/DownloadsTab.tsx`
- `components/tabs/StatsTab.tsx`
- `components/tabs/ManageTab.tsx`

### Phase 3: Extract Complex Sections
Break out large sections into their own components:
- `components/sections/MetadataVerification.tsx`
- `components/sections/SongMetadata.tsx`
- `components/sections/QueueStatus.tsx`

### Phase 4: Create Shared UI Components
- `components/ui/StatusBadge.tsx`
- `components/ui/DataTable.tsx`
- `components/ui/FormInput.tsx`

## Benefits

1. **Reduced Code Duplication**: Collapsible logic centralized
2. **Easier Maintenance**: Changes to collapse behavior in one place
3. **Improved Readability**: Cleaner JSX with less boilerplate
4. **Type Safety**: Props validated at component boundaries
5. **Testability**: Components can be tested in isolation

## File Structure

```
frontend/app/library/
├── page.tsx (main page, still ~3200 lines)
├── components/
│   ├── CollapsibleSection.tsx
│   ├── CollapsiblePanel.tsx
│   └── README.md
├── REFACTORING_NOTES.md (this file)
└── [future: tabs/, sections/, ui/]
```
