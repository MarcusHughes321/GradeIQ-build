---
name: Installing Expo modules Expo-Go-safe via the npm package tool
description: How to add an Expo/native module through the npm-based package tool without breaking Expo Go (no `expo install` available).
---

# Pin Expo native modules to the bundledNativeModules version

**Rule:** The package-management tool installs via plain `npm` (no `expo install` resolution), and `npx expo install` is forbidden by the expo skill. So when adding an Expo module or any native module, first read the SDK-correct version from `node_modules/expo/bundledNativeModules.json` and install that exact range (e.g. `expo-network@~8.0.8`). A module is Expo Go compatible **iff** it appears in `bundledNativeModules.json` (Expo Go bundles those native sides).

**Why:** Installing `latest` can pull a version ahead of the installed Expo SDK, causing a native/JS mismatch that crashes or silently no-ops in Expo Go. Third-party native modules NOT listed in `bundledNativeModules.json` are not in Expo Go at all and will crash on the QR-code preview the user tests with.

**How to apply:** `rg "<name>" node_modules/expo/bundledNativeModules.json` → if present, install that pinned range through the package tool; if absent, it is not Expo-Go-safe, pick a listed alternative. After install, `npx expo start`'s "packages should be updated" warning will NOT list your module if you matched the pin. (Both `expo-network` and `@react-native-community/netinfo` are listed → both Expo Go safe; prefer the `expo-` one.)
