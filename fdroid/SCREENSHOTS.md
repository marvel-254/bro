# Screenshots — F-Droid Submission

This document describes the screenshot requirements for BRO's F-Droid
listing, the current capture status, and instructions for generating
screenshots from the development build.

F-Droid displays screenshots on each app's page (e.g.,
`https://f-droid.org/packages/app.bro/`). Screenshots help users understand
the app's interface before installing.

---

## Required Screenshots

F-Droid expects at least:

| Device type   | Minimum | Recommended |
|---------------|---------|-------------|
| Phone         | 2       | 3–5         |
| Tablet 7"     | 1       | 2–3         |
| Tablet 10"    | 0       | 1 (optional)|

### Phone screenshots (at least 2 required)

1. **Pulse screen** — The main discovery view showing active conversations,
   live conversations, and recommended activity.
2. **Conversations list** — The direct and group conversations inbox.
3. **Conversation detail** — A message thread with avatars, bubbles, and
   the composer (optional but recommended).

### Tablet screenshots (at least 1 required)

1. **Pulse screen (tablet)** — The same Pulse view rendered on a 7-inch
   tablet layout.

### 10-inch tablet (optional)

1. **Space view** — A Space containing conversations and channels.

---

## Size and Format Requirements

| Property         | Requirement                          |
|------------------|--------------------------------------|
| Format           | PNG (preferred) or JPG               |
| Transparency     | Not allowed (flatten the background) |
| Watermark        | None                                 |
| Text scaling     | 100% (default) — do not zoom          |
| Phone resolution  | At least 1080 x 1920 (portrait)     |
| Tablet 7"        | 1080 x 1920 or 1200 x 1920            |
| Tablet 10"       | 1440 x 2560 or 1920 x 2560            |
| File size        | Under 1 MB each                      |

### Naming convention

Screenshots should be named descriptively:

```
phone-pulse.png
phone-conversations.png
phone-conversation-detail.png
tablet-pulse.png
tablet-space.png
```

---

## Current Status

| # | Screenshot                 | Device   | Status     |
|---|----------------------------|----------|------------|
| 1 | Pulse screen               | Phone    | Not yet captured |
| 2 | Conversations list         | Phone    | Not yet captured |
| 3 | Conversation detail        | Phone    | Not yet captured |
| 4 | Pulse screen               | Tablet 7"| Not yet captured |
| 5 | Space view                 | Tablet 10" | Not yet captured |

**Overall status:** Screenshots have **not yet been captured**.

### How to capture

Screenshots can be captured from the Expo dev client or a development build:

```bash
# Start the dev server
npm start

# In a separate terminal, capture the device screen
npx expo screenshot --output fdroid/screenshots/phone-pulse.png
```

Alternatively, on Android (requires USB debugging):

```bash
# Install the debug build
cd android && ./gradlew assembleDebug && adb install app/build/outputs/apk/debug/app-debug.apk

# Capture a screenshot
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png
```

> Note: Screenshots must show the app with **realistic but placeholder**
> content. Do not include personal data, test messages with internal
> information, or anything that could leak user privacy.

---

## Submission Checklist

- [ ] 2 phone screenshots captured (PNG, 1080x1920+)
- [ ] 1 tablet 7" screenshot captured (PNG, 1080x1920+)
- [ ] 1 tablet 10" screenshot captured (optional but recommended)
- [ ] No transparency in any screenshot
- [ ] No watermarks
- [ ] No personal or sensitive data visible
- [ ] Screenshots uploaded to the F-Droid data repository alongside metadata

---

## References

- F-Droid screenshot guidelines: https://f-droid.org/docs/All_about_descriptions/
- F-Droid media metadata: https://f-droid.org/docs/Build_Metadata_Reference/
