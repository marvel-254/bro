# F-Droid Submission Guide for BRO

## Overview
This guide explains how to submit BRO to F-Droid, the open-source Android app repository.

## Prerequisites
1. GitLab account (for https://gitlab.com/fdroid/fdroid-data)
2. Basic Git knowledge
3. The BRO app source code (this repository)

## Step 1: Fork F-Droid Data Repository
1. Go to https://gitlab.com/fdroid/fdroid-data
2. Click "Fork" to fork the repository to your GitLab account
3. Clone your fork:
   ```bash
   git clone https://gitlab.com/<your-username>/fdroid-data.git
   cd fdroid-data
   ```

## Step 2: Add BRO Metadata
1. Copy the metadata file to the appropriate location:
   ```bash
   cp /path/to/bro/fdroid/app.bro.yml metadata/
   ```
   Replace `/path/to/bro/` with the actual path to the BRO repository.

2. Verify the file is in the correct location:
   ```bash
   ls metadata/app.bro.yml
   ```

## Step 3: Test Locally (Optional)
Before submitting, you can test the metadata locally:
```bash
fdroid readmeta
fdroid lint app.bro
fdroid build -v -l app.bro
```
Note: You need to have F-Droid tools installed (`fdroidserver` package).

## Step 4: Commit and Push
```bash
git add metadata/app.bro.yml
git commit -m "Add BRO app"
git push origin main
```

## Step 5: Create Merge Request
1. Go to your fork on GitLab: https://gitlab.com/<your-username>/fdroid-data
2. Click "Merge Requests" → "New Merge Request"
3. Set source branch to your fork's main
4. Set target branch to fdroid-data's main
5. Fill in the merge request details:
   - Title: "Add BRO - A living communication environment"
   - Description: Provide a brief description of the app
6. Submit the merge request

## Step 6: Wait for Review
F-Droid maintainers will review your submission and may:
- Ask for changes or clarifications
- Approve and merge the request
- Request additional information

## Metadata File Contents
The `fdroid/app.bro.yml` file contains:
- App name: BRO
- Package ID: app.bro
- License: GPL-3.0-or-later
- Website: https://marvel-254.github.io/bro/
- Source: https://github.com/marvel-254/bro
- Maintainer contact: privacy@bro.app
- Build instructions using Gradle
- Version information

## Verification Checks
Before submitting, ensure:
1. ✅ Repository is public and accessible
2. ✅ LICENSE file exists (GPL v3)
3. ✅ PRIVACY.md exists and is hosted at https://marvel-254.github.io/bro/
4. ✅ No tracking/ads/proprietary SDKs included
5. ✅ Only INTERNET permission requested
6. ✅ usesCleartextTraffic: false set
7. ✅ No signing keys in repository
8. ✅ No hardcoded API keys in source code

## Troubleshooting

### Build Issues
If you encounter build issues:
1. Ensure you have JDK 17+ installed
2. Ensure Android SDK is available
3. Try running: `cd android && ./gradlew assembleDebug`
4. Check that Node.js and npm are available for `expo prebuild`

### Metadata Validation
Use `fdroid lint app.bro` to check for metadata errors before submitting.

## After Submission
Once merged into fdroid-data:
1. F-Droid's build servers will automatically build the app
2. The app will appear in F-Droid repository after successful build
3. Updates can be made by modifying the metadata and creating new merge requests

## References
- F-Droid Submission Guidelines: https://f-droid.org/en/docs/All_About_F-Droid/
- Metadata Reference: https://f-droid.org/en/docs/Metadata_Reference/
- Build Metadata Reference: https://f-droid.org/en/docs/Build_Metadata_Reference/
