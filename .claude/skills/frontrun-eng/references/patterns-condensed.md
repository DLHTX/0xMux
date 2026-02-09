# Condensed Patterns Reference

## SwiftSignalKit

```swift
// Create signal
func fetch() -> Signal<T, E> {
    Signal { sub in
        // async work
        sub.putNext(value)
        sub.putCompletion()
        return ActionDisposable { /* cleanup */ }
    }
}

// Operators
signal |> map { transform($0) }
signal |> filter { condition($0) }
signal |> deliverOnMainQueue
combineLatest(s1, s2) |> map { ($0, $1) }
signal |> take(1)
signal |> distinctUntilChanged

// State
let promise = Promise<State>()
promise.set(.single(.loading))

let value = ValuePromise<T>(ignoreRepeated: true)
value.set(newValue)

// Subscribe
let disposeBag = DisposableSet()
disposeBag.add(signal.start(next: { [weak self] in self?.handle($0) }))
// Always dispose in deinit
```

## ViewController

```swift
public final class XController: ViewController {
    private let context: AccountContext
    private var controllerNode: XNode { displayNode as! XNode }

    public init(context: AccountContext) {
        self.context = context
        super.init(navigationBarPresentationData: nil)
        tabBarItem.title = "X"
        tabBarItem.image = UIImage(named: "TabX")
    }

    required init(coder: NSCoder) { fatalError() }

    override public func loadDisplayNode() {
        displayNode = XNode()
        displayNodeDidLoad()
    }
}
```

## ASDisplayNode

```swift
final class XNode: ASDisplayNode {
    private let titleNode = ASTextNode()

    override init() {
        super.init()
        addSubnode(titleNode)
    }

    override func layout() {
        super.layout()
        titleNode.frame = CGRect(x: 16, y: 16, width: bounds.width - 32, height: 24)
    }
}
```

## Theme Colors

```swift
let t = presentationData.theme
t.list.itemPrimaryTextColor    // Main text
t.list.itemSecondaryTextColor  // Subtitle
t.list.itemAccentColor         // Links, buttons
t.list.blocksBackgroundColor   // Cell background
t.list.itemDestructiveColor    // Delete actions
t.overallDarkAppearance        // Bool: dark mode
```

## BUILD Template

```python
load("@build_bazel_rules_swift//swift:swift.bzl", "swift_library")

swift_library(
    name = "FRX",
    module_name = "FRX",
    srcs = glob(["Sources/**/*.swift"]),
    copts = ["-warnings-as-errors"],
    deps = [
        "//submodules/SSignalKit/SwiftSignalKit:SwiftSignalKit",
        "//Frontrun/FRCore:FRCore",
        "//Frontrun/FRModels:FRModels",
    ],
    visibility = ["//visibility:public"],
)
```

## Keychain (Secure)

```swift
let access = SecAccessControlCreateWithFlags(
    nil,
    kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    [.privateKeyUsage, .biometryCurrentSet],
    nil
)
defer { data.resetBytes(in: 0..<data.count) }
```

## Common Deps

```python
# Telegram
"//submodules/SSignalKit/SwiftSignalKit:SwiftSignalKit",
"//submodules/AccountContext:AccountContext",
"//submodules/TelegramPresentationData:TelegramPresentationData",
"//submodules/Display:Display",
"//submodules/AsyncDisplayKit:AsyncDisplayKit",

# Frontrun
"//Frontrun/FRCore:FRCore",
"//Frontrun/FRModels:FRModels",
"//Frontrun/FRServices:FRServices",
```
