---
name: frontrun-design
description: This skill should be used when building UI components, screens, or visual elements in the Frontrun iOS app (Telegram fork). It provides Telegram-consistent design patterns including theme colors, typography, layout spacing, animation conventions, and component architecture for Swift/iOS development.
---

This skill guides creation of UI components and screens in the Frontrun iOS app that are visually consistent with Telegram's iOS design language. All UI code must follow Telegram's established patterns for colors, typography, spacing, animations, and component architecture.

## Design Principles

Before implementing UI, consider:
- **Consistency**: Match Telegram's existing visual language. New screens should feel native to the app.
- **Theme-awareness**: Every color and font size must come from `presentationData`. Support light/dark themes automatically.
- **Pixel precision**: Use `floorToScreenPixels()` and `UIScreenPixel` for hairline separators and sub-pixel alignment.
- **Performance**: Prefer async layout calculations. Avoid blocking the main thread with complex view hierarchies.

## Color System

**NEVER hardcode colors.** Access all colors through the `presentationData.theme` hierarchy.

### Theme Namespaces

```swift
// List items and settings screens
theme.list.itemPrimaryTextColor       // Main text
theme.list.itemSecondaryTextColor     // Subtitle/secondary text
theme.list.itemAccentColor            // Interactive/tappable elements
theme.list.itemDestructiveColor       // Delete/destructive actions
theme.list.itemDisabledTextColor      // Disabled state
theme.list.blocksBackgroundColor      // Grouped section background
theme.list.plainBackgroundColor       // Plain list background
theme.list.itemBlocksBackgroundColor  // Individual block background
theme.list.itemHighlightedBackgroundColor // Tap highlight
theme.list.sectionHeaderTextColor     // Section header labels
theme.list.itemSwitchColors           // Toggle switch colors

// Navigation and tab bar
theme.rootController.navigationBar.buttonColor        // Nav bar buttons
theme.rootController.navigationBar.primaryTextColor    // Nav bar title
theme.rootController.navigationBar.accentTextColor     // Nav bar accent
theme.rootController.navigationBar.blurredBackgroundColor
theme.rootController.tabBar.backgroundColor
theme.rootController.tabBar.separatorColor
theme.rootController.tabBar.iconColor
theme.rootController.tabBar.selectedIconColor

// Chat screens
theme.chat.message.incoming.bubble.withWallpaper.fill
theme.chat.message.outgoing.bubble.withWallpaper.fill
theme.chat.inputPanel.panelBackgroundColor
theme.chat.inputPanel.primaryTextColor

// Action sheets and context menus
theme.actionSheet.primaryTextColor
theme.actionSheet.secondaryTextColor
theme.actionSheet.controlAccentColor

// Chat list
theme.chatList.titleColor
theme.chatList.messageTextColor
theme.chatList.dateTextColor
```

### Badge and Accent Colors

```swift
theme.rootController.tabBar.badgeBackgroundColor
theme.rootController.tabBar.badgeTextColor
theme.list.itemCheckColors.fillColor   // Checkmark fill
theme.list.itemCheckColors.strokeColor // Checkmark stroke
```

## Typography

Use system fonts only (SF Pro). Access via the `Font` helper and scaled sizes from `presentationData.fontSize`.

### Font Weights

```swift
Font.regular(_ size: CGFloat)  // System regular
Font.medium(_ size: CGFloat)   // System medium
Font.semibold(_ size: CGFloat) // System semibold
Font.bold(_ size: CGFloat)     // System bold
```

### Scaled Font Sizes

```swift
// Body text (17pt default, scales with accessibility)
presentationData.fontSize.itemListBaseFontSize

// Section headers (~13pt scaled)
presentationData.fontSize.itemListBaseHeaderFontSize

// Labels/secondary text (~14pt scaled)
presentationData.fontSize.itemListBaseLabelFontSize
```

### Common Patterns

```swift
// Primary body text
Font.regular(presentationData.fontSize.itemListBaseFontSize)

// Bold title
Font.semibold(presentationData.fontSize.itemListBaseFontSize)

// Section header
Font.regular(presentationData.fontSize.itemListBaseHeaderFontSize)

// Small label
Font.regular(presentationData.fontSize.itemListBaseLabelFontSize)

// Fixed-size text (use sparingly; prefer scaled sizes)
Font.medium(15.0)
```

## Layout Conventions

All layout is **manual frame-based** (not Auto Layout). Calculate frames explicitly using `CGRect`.

### Standard Spacing

| Element | Value |
|---|---|
| Horizontal inset (content padding) | 15–16pt |
| Section spacing (grouped, full) | 35pt |
| Section spacing (grouped, reduced) | 16pt |
| Section spacing (rounded layout) | 24pt |
| Item vertical padding | 7–8pt |
| Tab bar height | 40–48pt |
| Separator thickness | `UIScreenPixel` (1px) |

### Pixel-Perfect Helpers

```swift
UIScreenPixel                    // 1 physical pixel at current scale
floorToScreenPixels(value)       // Round down to nearest pixel
```

### Corner Radius Patterns

```swift
// Pill shapes (badges, tags)
cornerRadius = height / 2.0

// Rounded sections (when width >= 350pt)
if itemListHasRoundedBlockLayout(params) {
    // Use rounded corners on section blocks
}
```

### Layout Calculation Pattern

```swift
let leftInset: CGFloat = 16.0 + params.leftInset
let rightInset: CGFloat = 16.0 + params.rightInset
let contentWidth = params.width - leftInset - rightInset

let titleFrame = CGRect(
    x: leftInset,
    y: 8.0,
    width: contentWidth,
    height: floorToScreenPixels(titleLayout.size.height)
)
```

## Component Architecture

Two UI patterns coexist. Prefer the Component pattern for new Frontrun code.

### Component Protocol (Modern — Preferred)

```swift
final class MyComponent: Component {
    let title: String
    let theme: PresentationTheme

    func makeView() -> View {
        return View(frame: .zero)
    }

    func update(view: View, availableSize: CGSize, state: EmptyComponentState, environment: Environment<Empty>, transition: ComponentTransition) -> CGSize {
        // Layout and update subviews
        // Return computed size
        return CGSize(width: availableSize.width, height: computedHeight)
    }

    final class View: UIView {
        // Subviews declared here
    }
}
```

### ASDisplayNode (Legacy — Still Prevalent)

```swift
final class MyItemNode: ListViewItemNode {
    private let titleNode: TextNode

    func asyncLayout() -> (_ item: MyItem, _ params: ListViewItemLayoutParams, _ neighbors: ItemListNeighbors) -> (ListViewItemNodeLayout, () -> Void) {
        let makeTitleLayout = TextNode.asyncLayout(self.titleNode)

        return { item, params, neighbors in
            // Calculate all sizes and positions
            let (titleLayout, titleApply) = makeTitleLayout(/* ... */)

            let contentHeight: CGFloat = titleLayout.size.height + 16.0
            let insets = itemListNeighborsGroupedInsets(neighbors, params)
            let layout = ListViewItemNodeLayout(contentSize: CGSize(width: params.width, height: contentHeight), insets: insets)

            return (layout, {
                // Apply layouts to nodes
                titleApply()
                self.titleNode.frame = CGRect(/* ... */)
            })
        }
    }
}
```

### ItemList Pattern (Settings/List Screens)

```swift
// Item definition
enum MySection: Int32 {
    case main
}

struct MyItem: ItemListItem {
    let sectionId: ItemListSectionId = MySection.main.rawValue
    let title: String

    func node(async: @escaping () -> Bool) -> ListViewItemNode {
        return MyItemNode()
    }
}
```

## Animation System

Use `ContainedViewLayoutTransition` for all animations.

### Transition Types

```swift
// No animation
ContainedViewLayoutTransition.immediate

// Standard animation
ContainedViewLayoutTransition.animated(duration: 0.3, curve: .easeInOut)

// Spring animation
ContainedViewLayoutTransition.animated(duration: 0.4, curve: .spring)

// Custom spring
ContainedViewLayoutTransition.animated(duration: 0.5, curve: .customSpring(damping: 88.0, initialVelocity: 0.0))

// Slide curve (ease-out)
ContainedViewLayoutTransition.animated(duration: 0.3, curve: .slide)
```

### Applying Transitions

```swift
transition.updateFrame(node: myNode, frame: newFrame)
transition.updateBounds(node: myNode, bounds: newBounds)
transition.updatePosition(node: myNode, position: newPosition)
transition.updateAlpha(node: myNode, alpha: targetAlpha)
transition.updateTransformScale(node: myNode, scale: 1.0)
```

### Standard Durations

| Context | Duration | Curve |
|---|---|---|
| Quick state change | 0.2s | `.easeInOut` |
| Standard transition | 0.3s | `.easeInOut` |
| Content insertion | 0.4s | `.easeInOut` |
| Spring bounce | 0.4–0.5s | `.spring` or `.customSpring` |
| Slide transition | 0.3s | `.slide` |

## Theme Updates

Every view/node that uses theme colors must implement theme update handling:

```swift
func updatePresentationData(_ presentationData: PresentationData) {
    self.presentationData = presentationData
    // Re-apply all colors from the new theme
    self.titleNode.attributedText = NSAttributedString(
        string: self.title,
        font: Font.regular(presentationData.fontSize.itemListBaseFontSize),
        textColor: presentationData.theme.list.itemPrimaryTextColor
    )
    self.backgroundColor = presentationData.theme.list.blocksBackgroundColor
}
```

## Frontrun-Specific Patterns

### Module Organization

- Place all UI code in `Frontrun/FR*UI/` modules
- Shared components go in `Frontrun/FRShared/`
- Never modify files in `submodules/` directly
- Use `#if FRONTRUN` conditionals when touching Telegram code paths

### Data Loading

Use SwiftSignalKit `Signal` for all async data:

```swift
let signal: Signal<[Item], NoError> = fetchItems()
self.disposable.set(signal.start(next: { [weak self] items in
    self?.updateItems(items)
}))
```

## Checklist

Before finalizing any UI implementation, verify:

- [ ] All colors sourced from `presentationData.theme` (zero hardcoded colors)
- [ ] Font sizes use `presentationData.fontSize` scaled values
- [ ] Layout uses manual frames with `floorToScreenPixels()` for alignment
- [ ] Separators use `UIScreenPixel` thickness
- [ ] `updatePresentationData` implemented for theme changes
- [ ] Animations use `ContainedViewLayoutTransition`
- [ ] Standard spacing values match Telegram conventions (15–16pt insets, 35pt sections)
- [ ] New code placed in `Frontrun/` directory, not `submodules/`
