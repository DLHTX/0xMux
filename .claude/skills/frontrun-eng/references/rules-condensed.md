# Rules (Condensed)

## File Locations

| OK | NOT OK |
|---|---|
| `Frontrun/FRX/Sources/*.swift` | `submodules/X/` |
| `Frontrun/FRIntegration/` | `submodules/TelegramUI/Sources/Frontrun*.swift` |

## Telegram Touchpoints (ONLY these)

1. `TelegramUI/BUILD` → add deps
2. `TelegramRootController.swift` → tab hook (`#if FRONTRUN`)
3. `ChatController.swift` → token detection (`#if FRONTRUN`)

## Module Dependencies

```
FRIntegration → FR*UI
FR*UI → FRServices, FRShared
FRServices → FRModels, FRNetworking, FRCore
FRModels → SwiftSignalKit only
```

**Forbidden:**
- UI → UI (use FRShared)
- Services → UI
- Non-Integration → TelegramUI
- FRModels → other FR modules

## Naming

| Type | Pattern |
|---|---|
| Module | `FRX`, `FRXUI` |
| Service | `XService: XServiceProtocol` |
| Controller | `XController: ViewController` |
| Node | `XNode: ASDisplayNode` |

## Security (Wallet/Trading)

**Keychain required:** private keys, seed phrases
**Biometric required:** signing, viewing seed, export, delete wallet
**Validation required:** token addresses, amounts, price freshness

**Never:** log keys, store in UserDefaults, keep in memory

## Token Safety

| Level | Action |
|---|---|
| safe | Green badge |
| unknown | Yellow warning |
| warning | Orange + confirm dialog |
| danger | Red, block trade |

## Checklist

- [ ] Code in `Frontrun/`
- [ ] `FR*` prefix
- [ ] Protocol first (services)
- [ ] `Signal<T,E>` for async
- [ ] Theme colors via `presentationData.theme`
- [ ] Feature flag if user-facing
- [ ] Security if wallet/trading
- [ ] BUILD deps correct
- [ ] `UPSTREAM_MODIFICATIONS.md` updated if Telegram touched
