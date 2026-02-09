# iOS Anti-Patterns Quick Reference

## Memory Issues

### 1. Retain Cycle in Closures
```swift
// 🔴 BAD: Strong reference cycle
class ViewController {
    var closure: (() -> Void)?

    func setup() {
        closure = {
            self.doSomething() // Retains self
        }
    }
}

// ✅ GOOD: Weak capture
func setup() {
    closure = { [weak self] in
        self?.doSomething()
    }
}
```

### 2. Strong Delegate
```swift
// 🔴 BAD
class MyView {
    var delegate: MyDelegate? // Strong reference
}

// ✅ GOOD
class MyView {
    weak var delegate: MyDelegate?
}
```

### 3. NotificationCenter Not Removed
```swift
// 🔴 BAD: Never removed
class ViewController {
    override func viewDidLoad() {
        NotificationCenter.default.addObserver(...)
    }
    // Missing deinit removal
}

// ✅ GOOD
deinit {
    NotificationCenter.default.removeObserver(self)
}
```

## Nil Handling

### 4. Force Unwrap
```swift
// 🔴 BAD
let name = user.name!
let cell = tableView.dequeueReusableCell(...)!

// ✅ GOOD
guard let name = user.name else { return }
guard let cell = tableView.dequeueReusableCell(...) else { return UITableViewCell() }
```

### 5. Implicitly Unwrapped Optionals Misuse
```swift
// 🔴 BAD: IUO for non-IBOutlet
var service: APIService!

// ✅ GOOD: Use proper optional or lazy
var service: APIService?
// or
lazy var service = APIService()
```

## Concurrency

### 6. Main Thread Violation
```swift
// 🔴 BAD: UI update from background
DispatchQueue.global().async {
    self.label.text = "Done" // Crash or undefined behavior
}

// ✅ GOOD
DispatchQueue.global().async {
    // Background work
    DispatchQueue.main.async {
        self.label.text = "Done"
    }
}
```

### 7. Deadlock Risk
```swift
// 🔴 BAD: Sync on main from main
DispatchQueue.main.sync { // Deadlock if already on main
    self.updateUI()
}

// ✅ GOOD
if Thread.isMainThread {
    self.updateUI()
} else {
    DispatchQueue.main.async {
        self.updateUI()
    }
}
```

## Architecture

### 8. Massive View Controller
```swift
// 🔴 BAD: VC doing everything
class ProfileViewController: UIViewController {
    // 800+ lines
    // Networking, UI, business logic, persistence all mixed
}

// ✅ GOOD: Separate concerns
class ProfileViewController: UIViewController {
    private let viewModel: ProfileViewModel
    private let coordinator: ProfileCoordinator
    // Only UI binding and lifecycle
}
```

### 9. Singleton Abuse
```swift
// 🔴 BAD: Hard dependency on singleton
class MyService {
    func doWork() {
        NetworkManager.shared.fetch(...) // Untestable
    }
}

// ✅ GOOD: Dependency injection
class MyService {
    private let network: NetworkProtocol

    init(network: NetworkProtocol = NetworkManager.shared) {
        self.network = network
    }
}
```

### 10. Layer Violation
```swift
// 🔴 BAD: ViewModel knows about UIKit
class ProfileViewModel {
    func getColor() -> UIColor { // ViewModel shouldn't return UIKit types
        return .red
    }
}

// ✅ GOOD
class ProfileViewModel {
    func getColorHex() -> String {
        return "#FF0000"
    }
}
```

## Code Duplication Patterns

### 11. Repeated Setup Code
```swift
// 🔴 BAD: Same setup in multiple VCs
class VC1 {
    func setupTableView() {
        tableView.delegate = self
        tableView.dataSource = self
        tableView.rowHeight = 60
        tableView.separatorStyle = .none
        tableView.register(...)
    }
}
class VC2 {
    func setupTableView() {
        // Same 5 lines
    }
}

// ✅ GOOD: Extract to extension or base class
extension UITableView {
    func applyStandardConfig(delegate: UITableViewDelegate & UITableViewDataSource) {
        self.delegate = delegate
        self.dataSource = delegate
        self.rowHeight = 60
        self.separatorStyle = .none
    }
}
```

### 12. Repeated API Response Handling
```swift
// 🔴 BAD: Same error handling everywhere
func fetchUser() {
    api.request(...) { result in
        switch result {
        case .success(let data):
            // ...
        case .failure(let error):
            if error.code == 401 { self.logout() }
            else if error.code == 500 { self.showServerError() }
            // Same pattern in 20 places
        }
    }
}

// ✅ GOOD: Centralized error handler
func handle(error: APIError) {
    switch error.code {
    case 401: coordinator.logout()
    case 500: showServerError()
    default: showGenericError()
    }
}
```

## Over-Fragmentation Patterns

### 13. Excessive Protocol Extraction
```swift
// 🔴 BAD: Protocol for internal-only type
protocol UserCellConfigurable {
    func configure(with user: User)
}
class UserCell: UITableViewCell, UserCellConfigurable {
    func configure(with user: User) { ... }
}
// Protocol only used by one class, never mocked

// ✅ GOOD: Just use the class directly unless you need polymorphism
class UserCell: UITableViewCell {
    func configure(with user: User) { ... }
}
```

### 14. Too Many Tiny Files
```swift
// 🔴 BAD: 5 files for simple model
// User.swift (10 lines)
// UserType.swift (5 lines)
// UserStatus.swift (5 lines)
// UserProtocol.swift (8 lines)
// UserBuilder.swift (15 lines)

// ✅ GOOD: Consolidate related types
// User.swift (40 lines)
struct User { ... }
enum UserType { ... }
enum UserStatus { ... }
```

## Quick Scan Commands

```bash
# Force unwraps
grep -rn '!\.' --include="*.swift" . | grep -v 'IBOutlet'

# Potential retain cycles (closures without weak self)
grep -rn '\{ *$' --include="*.swift" -A 5 . | grep 'self\.' | grep -v '\[weak'

# Large files (>500 lines)
wc -l **/*.swift 2>/dev/null | awk '$1 > 500' | sort -rn

# High import count
for f in **/*.swift; do
  count=$(grep -c '^import ' "$f" 2>/dev/null || echo 0)
  [ "$count" -gt 10 ] && echo "$count $f"
done | sort -rn

# TODO/FIXME debt
grep -rn 'TODO\|FIXME\|HACK\|XXX' --include="*.swift" .
```
