---
name: frontrun-eng
description: Engineering best practices for Frontrun iOS development. This skill should be used when implementing features, creating modules, writing Swift code, or making architectural decisions in the Frontrun iOS codebase. It enforces isolation from Telegram upstream, Signal-based async patterns, security requirements for wallet features, and proper module organization.
---

# Frontrun iOS Engineering

Enforces engineering best practices for the Frontrun iOS app (Telegram fork with crypto trading).

## Quick Rules

1. **All code in `Frontrun/`** - Never modify `submodules/`
2. **Extension over modification** - Extend Telegram classes, don't edit them
3. **`Signal<T, E>` for async** - Not Combine, not async/await
4. **Theme from `presentationData`** - Never hardcode colors
5. **Protocol-first services** - Define protocol before implementation
6. **Feature flags** - Every user-facing feature toggleable

## Module Structure

```
Frontrun/
├── FRCore/          # DI, flags, hooks
├── FRModels/        # Data models (no FR deps)
├── FRServices/      # Business logic
├── FRNetworking/    # API clients
├── FR*UI/           # UI modules
├── FRShared/        # Shared UI components
└── FRIntegration/   # Telegram bridge (only this imports TelegramUI)
```

## Allowed Telegram Modifications

| File | Change |
|---|---|
| `TelegramUI/BUILD` | Add Frontrun deps |
| `TelegramRootController.swift` | `#if FRONTRUN` tab hook |
| `ChatController.swift` | `#if FRONTRUN` token detection |

Track in `docs/guidelines/UPSTREAM_MODIFICATIONS.md`.

## Creating a Module

```bash
mkdir -p Frontrun/FRNewFeature/Sources
```

**BUILD:**
```python
load("@build_bazel_rules_swift//swift:swift.bzl", "swift_library")

swift_library(
    name = "FRNewFeature",
    module_name = "FRNewFeature",
    srcs = glob(["Sources/**/*.swift"]),
    copts = ["-warnings-as-errors"],
    deps = [
        "//submodules/SSignalKit/SwiftSignalKit:SwiftSignalKit",
        "//Frontrun/FRCore:FRCore",
    ],
    visibility = ["//visibility:public"],
)
```

## Security (Wallet/Trading Features)

- Keys → Keychain + Secure Enclave only
- Zero key data after use: `defer { data.resetBytes(in: 0..<data.count) }`
- Biometric required: signing, viewing seed, export, delete wallet
- Validate: token addresses, amounts, price freshness
- Never: log keys, UserDefaults for keys, keep keys in memory

## Pre-Implementation

1. Search codebase for similar implementations
2. Check `docs/guidelines/` for patterns
3. Identify minimal Telegram touchpoints
4. Plan module location and dependencies

## Checklist

- [ ] Code in `Frontrun/`
- [ ] `FR*` prefix for module
- [ ] Protocol defined first (services)
- [ ] `Signal<T,E>` for async
- [ ] Theme colors via `presentationData.theme`
- [ ] Feature flag if user-facing
- [ ] Security requirements if wallet/trading
- [ ] BUILD deps correct
- [ ] Added to `TelegramUI/BUILD` if needed
- [ ] Test: `bazel build Telegram/Telegram -c dbg --ios_multi_cpus=sim_arm64`

## Reference Files

**Detailed patterns:** `references/patterns-condensed.md`
**Rules summary:** `references/rules-condensed.md`
**Human docs:** `docs/guidelines/` (verbose, for human understanding)
**Design tokens:** Use `frontrun-design-system` skill
