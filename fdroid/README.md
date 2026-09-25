# BRO — F-Droid Build Instructions

## Build Command

```bash
cd android && ./gradlew assembleDebug
```

## Dependencies

All dependencies are open-source. See `package.json` for the full list:

| Dependency | License |
|---|---|
| expo (~52.0.0) | MIT |
| react-native (0.76.3) | MIT |
| react (18.3.1) | MIT |
| @expo/vector-icons (^14.0.0) | MIT |
| @react-navigation/native (^6.1.18) | MIT |
| @react-navigation/bottom-tabs (^6.5.20) | MIT |
| @react-navigation/stack (^6.4.1) | MIT |
| expo-router (~4.0.0) | MIT |
| expo-secure-store (~13.0.0) | MIT |
| expo-splash-screen (~0.30.0) | MIT |
| expo-status-bar (~2.0.0) | MIT |
| expo-linear-gradient (~13.0.0) | MIT |
| react-native-gesture-handler (~2.20.0) | MIT |
| react-native-reanimated (~3.13.0) | MIT |
| react-native-safe-area-context (4.12.0) | MIT |
| react-native-svg (15.2.0) | MIT |
| @clerk/clerk-expo (^2.20.0) | MIT |

## Third-Party Services

BRO uses the following third-party services. These are **not** bundled into the app binary but are used at runtime:

| Service | Purpose | Privacy Policy |
|---|---|---|
| Clerk (https://clerk.com) | Authentication and user management | https://clerk.com/legal/privacy |
| Convex (https://convex.dev) | Database, real-time sync, and hosting | https://convex.dev/legal/privacy |

## Required Permissions

- `INTERNET` — Required for network connectivity (messages, authentication, data sync)

No other permissions are requested.

## Tracking & Analytics

BRO does **not** include any tracking, analytics, or advertising SDKs. No user data is collected for analytics purposes.

## Source Code

https://github.com/marvel-254/bro

## License

GPL-3.0-or-later — See [LICENSE](https://github.com/marvel-254/bro/blob/main/LICENSE) in the repository.
