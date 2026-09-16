# BRO — AGENTS.md

## Project Identity

**Project:** BRO

**Type:** Next-generation social communication platform

**Platform:** Android APK

**Primary goal:** Build a production-quality mobile communication application that introduces a new interaction model instead of cloning existing messaging applications.

**Tagline:**

> TALK. CONNECT. EXIST.

BRO is not intended to be another WhatsApp, Telegram, Discord, Messenger, or Slack clone.

The application is centered around:

* Pulse
* People
* Conversations
* Conversation branches
* Spaces
* Presence
* Discovery
* Activity

The central product principle is:

> **BRO is a living communication environment rather than a list of chats.**

---

# 1. AGENT ROLE

You are the primary autonomous software engineering agent responsible for implementing BRO.

You are expected to operate as a senior:

* Android engineer
* React Native engineer
* TypeScript engineer
* backend engineer
* UI/UX engineer
* DevOps engineer
* QA engineer
* security engineer

You are responsible for taking the product specification, wireframes, and repository state and turning them into a functioning application.

Do not merely create mock screens.

Build the actual product.

---

# 2. DEVELOPMENT PHILOSOPHY

Follow these principles:

1. Understand before changing.
2. Inspect the repository before creating architecture.
3. Prefer simple architecture.
4. Avoid unnecessary dependencies.
5. Build reusable components.
6. Keep business logic separate from UI.
7. Make the application production-oriented from the beginning.
8. Never knowingly introduce broken functionality.
9. Test every major feature.
10. Verify builds before considering work complete.
11. Keep the application lightweight.
12. Prefer boring, reliable technology over unnecessary complexity.

Do not prematurely introduce:

* microservices
* Kubernetes
* complex message brokers
* unnecessary caching infrastructure
* multiple databases
* complicated state-management systems
* infrastructure that the MVP does not require

---

# 3. CRITICAL RESOURCE CONSTRAINT

## DO NOT PERFORM HEAVY BUILDS LOCALLY

The development machine has limited local resources.

The project MUST use **GitHub Actions / GitHub Workflows** as the primary build and CI environment.

Do not assume the local machine should perform:

* production Android builds
* large Gradle builds
* release APK generation
* emulator execution
* expensive test suites
* dependency-heavy compilation
* resource-intensive static analysis

Local development should remain lightweight.

Use GitHub Actions for expensive operations.

---

# 4. GITHUB-FIRST BUILD ARCHITECTURE

The intended workflow is:

```text
LOCAL MACHINE
     │
     │ git
     ▼
GITHUB REPOSITORY
     │
     ├── GitHub Actions
     │       │
     │       ├── Install dependencies
     │       ├── Lint
     │       ├── Typecheck
     │       ├── Unit tests
     │       ├── Build Android
     │       ├── Package APK
     │       └── Upload artifact
     │
     └── GitHub
             │
             ▼
          APK artifact
```

The local machine should primarily be used for:

* editing
* Git operations
* lightweight inspection
* lightweight tests where practical
* running the application only when absolutely necessary
* reviewing logs
* reviewing GitHub Actions results

---

# 5. REQUIRED GITHUB WORKFLOWS

Create a `.github/workflows/` directory.

At minimum implement:

```text
.github/
└── workflows/
    ├── ci.yml
    ├── android-build.yml
    └── release.yml
```

Additional workflows may be created when justified.

---

# 6. CI WORKFLOW

`ci.yml` should run on:

* pull requests
* pushes to the main development branch

It should perform:

```text
Checkout
   ↓
Setup Node
   ↓
Install dependencies
   ↓
Typecheck
   ↓
Lint
   ↓
Unit tests
   ↓
Build validation
```

Do not make CI dependent on the developer's local environment.

Pin important tool versions where appropriate.

---

# 7. ANDROID BUILD WORKFLOW

`android-build.yml` should:

```text
Checkout repository
       ↓
Setup Node
       ↓
Install dependencies
       ↓
Setup Java
       ↓
Restore Gradle cache
       ↓
Build Android application
       ↓
Run tests
       ↓
Generate APK
       ↓
Upload APK as GitHub Actions artifact
```

The workflow must produce a downloadable APK artifact.

The exact build command should be determined from the selected Android framework and package manager.

Do not invent commands before inspecting the project.

---

# 8. RELEASE WORKFLOW

`release.yml` should eventually support:

```text
Git tag
   ↓
GitHub Actions
   ↓
Validate
   ↓
Build release APK
   ↓
Generate release artifacts
   ↓
Create GitHub Release
   ↓
Attach APK
```

Do not automatically publish to Google Play until explicit product approval exists.

---

# 9. BUILD ARTIFACTS

GitHub Actions should preserve useful artifacts such as:

```text
BRO-debug.apk
BRO-release.apk
test-results
lint-results
coverage
build logs
```

Do not commit generated APKs or build directories into Git.

---

# 10. TECHNOLOGY STACK

Use the simplest viable production stack.

Preferred frontend:

**React Native + Expo + TypeScript**

Backend:

**Convex**

Authentication:

**Convex Auth or Clerk**

Database:

**Convex**

Realtime:

**Convex**

Storage:

**Convex Storage**

Source control:

**GitHub**

CI/CD:

**GitHub Actions**

The agent may deviate only when there is a concrete technical reason.

If changing the stack, document the decision.

---

# 11. TYPE SAFETY

The project must use TypeScript.

Avoid:

```typescript
any
```

unless genuinely unavoidable.

Prefer:

* interfaces
* types
* discriminated unions
* typed API boundaries
* typed navigation
* typed database access

Do not silence TypeScript errors simply to make CI pass.

---

# 12. PROJECT STRUCTURE

Use a maintainable structure similar to:

```text
src/
├── app/
├── components/
├── features/
│   ├── auth/
│   ├── pulse/
│   ├── people/
│   ├── conversations/
│   ├── spaces/
│   ├── activity/
│   ├── search/
│   └── profile/
│
├── navigation/
├── hooks/
├── lib/
├── services/
├── stores/
├── types/
├── constants/
└── utils/
```

Adapt the exact structure to the framework actually used.

Do not create enormous monolithic files.

---

# 13. CORE DOMAIN MODEL

The core entities are:

```text
User
Conversation
ConversationMember
Message
MessageReaction
ConversationBranch
Space
SpaceMember
SpaceChannel
Activity
Notification
Attachment
SavedMessage
BlockedUser
```

The exact schema should evolve based on implementation requirements.

---

# 14. CONVERSATION IS THE CORE ENTITY

Do not architect BRO around a traditional "chat list."

The fundamental interaction is:

```text
Conversation
     │
     ├── participants
     ├── messages
     ├── branches
     ├── reactions
     ├── attachments
     └── activity
```

Conversations can exist:

* privately
* in groups
* inside Spaces
* as live public conversations

---

# 15. PULSE

Pulse is the main BRO experience.

It must not become a traditional social media feed.

Pulse should surface:

* active people
* active conversations
* live conversations
* recommended conversations
* Spaces
* recent activity

The question Pulse answers is:

> **What's happening in my communication world right now?**

---

# 16. PEOPLE

People discovery should support:

* search
* suggested users
* active users
* mutual Spaces
* following
* messaging
* profile discovery

Do not turn People into a generic social-media follower system.

Communication remains the priority.

---

# 17. SPACES

Communities are called:

**Spaces**

Spaces should organize conversations without becoming a Discord clone.

A Space may contain:

```text
Space
├── Overview
├── Conversations
├── Channels
├── Members
├── Events
└── Moderation
```

Channels are secondary.

Conversations are primary.

---

# 18. CONVERSATION BRANCHES

Conversation branching is one of BRO's signature features.

A message can have:

```text
message
   ↓
12 replies
   ↓
conversation branch
```

Branches must preserve context.

The user should always understand:

* what message started the branch
* who is participating
* where the branch belongs

Do not implement branches as an unrelated forum system.

---

# 19. REALTIME

Realtime behavior is essential.

The application should support:

* live messages
* typing indicators
* online presence
* message delivery states
* reactions
* conversation activity

Avoid polling when Convex realtime functionality can handle the requirement.

---

# 20. MESSAGE STATES

Support:

```text
pending
sending
sent
delivered
seen
failed
```

Failed messages must provide a retry action.

---

# 21. OFFLINE-FIRST CONSIDERATIONS

BRO is a mobile application.

Assume users may have:

* poor connectivity
* intermittent connectivity
* expensive data
* temporary network loss

At minimum:

* preserve local UI state
* queue outgoing messages where practical
* clearly show pending messages
* retry failed operations
* preserve cached conversation content where practical

Do not create a massive offline synchronization system for MVP unless required.

---

# 22. MEDIA

MVP should support:

* images
* files
* profile pictures

Architect media handling so future support can include:

* video
* audio
* voice messages
* documents

Validate:

* file size
* MIME type
* upload state
* failed uploads

Never trust client-provided MIME types alone for security-sensitive processing.

---

# 23. PUSH NOTIFICATIONS

Notifications should deep-link into context.

For example:

```text
Sarah replied to your conversation
```

should open:

```text
Conversation
    ↓
Relevant branch
    ↓
Relevant message
```

Do not simply open the generic home screen.

---

# 24. ANDROID BACK BUTTON

Back navigation must be explicitly designed.

Examples:

```text
Conversation
   ↓ back
previous context

Branch
   ↓ back
Conversation

Space
   ↓ back
Spaces

Modal
   ↓ back
close modal
```

Avoid navigation dead ends.

---

# 25. DEEP LINKING

Design deep links for:

```text
BRO user
BRO conversation
BRO branch
BRO Space
BRO message
```

Examples conceptually:

```text
bro://user/...
bro://conversation/...
bro://space/...
bro://message/...
```

Use the actual routing strategy appropriate to the selected framework.

---

# 26. AUTHENTICATION

Authentication must support secure session handling.

Do not store:

* passwords
* access tokens
* secrets
* API keys

in source code.

Use secure storage and the authentication provider's recommended mechanisms.

---

# 27. SECURITY

Never commit:

```text
.env
API keys
private keys
signing keys
service credentials
tokens
secrets
```

Use:

* GitHub Actions secrets
* environment variables
* Convex environment configuration
* secure Android storage

Review `.gitignore` before the first production commit.

---

# 28. DATABASE SECURITY

All backend mutations must validate authorization.

Never assume:

```text
if user can call mutation
then user owns resource
```

Explicitly verify:

* conversation membership
* Space membership
* ownership
* moderator permissions
* message ownership
* administrative privileges

---

# 29. INPUT VALIDATION

Validate all external input.

Examples:

* usernames
* messages
* Space names
* file uploads
* IDs
* profile fields

Do not rely exclusively on frontend validation.

Backend validation is mandatory.

---

# 30. MODERATION

MVP must provide:

* block user
* report user
* report message
* Space moderation foundation

Do not build an enormous moderation platform initially.

Build the correct authorization foundation so it can expand later.

---

# 31. UI IMPLEMENTATION

The Stitch prototype is the visual reference.

Do not blindly reproduce generated UI code.

Use the prototype as the source of:

* layout
* hierarchy
* navigation
* interaction concepts
* visual direction

Translate it into maintainable production components.

---

# 32. COMPONENT PRINCIPLE

Create reusable components.

Examples:

```text
Avatar
AvatarGroup
Button
IconButton
ConversationCard
MessageBubble
MessageGroup
BranchIndicator
SpaceCard
PersonCard
ActivityItem
SearchResult
BottomSheet
Composer
ReactionPicker
AttachmentPreview
PresenceIndicator
```

Avoid duplicating UI logic across screens.

---

# 33. ACCESSIBILITY

Every important interaction must consider:

* readable text
* touch target sizes
* contrast
* screen readers
* dynamic font scaling
* reduced motion
* semantic labels

Do not sacrifice usability for visual effects.

---

# 34. PERFORMANCE

BRO should remain lightweight.

Avoid:

* unnecessary dependencies
* huge image payloads
* unbounded message rendering
* expensive animations
* unnecessary rerenders
* large client-side state trees

Use:

* pagination
* virtualization
* lazy loading
* image optimization
* memoization where useful
* efficient subscriptions

Measure before optimizing.

---

# 35. LOCAL DEVELOPMENT

The local machine is NOT the primary build server.

Before running expensive commands locally, ask:

> Can this be performed through GitHub Actions instead?

Prefer:

```text
git push
   ↓
GitHub Actions
   ↓
build/test
   ↓
artifact/log
```

over:

```text
local machine
   ↓
large build
   ↓
resource exhaustion
```

Do not install unnecessary global development tooling.

---

# 36. GIT WORKFLOW

Use feature branches.

Example:

```text
main
 │
 ├── feature/auth
 ├── feature/pulse
 ├── feature/conversations
 ├── feature/spaces
 └── feature/search
```

Do not develop everything directly on `main`.

Commit messages should be meaningful.

Prefer:

```text
feat: implement Pulse conversation discovery
feat: add conversation branches
fix: retry failed message sends
test: add conversation authorization tests
chore: configure Android CI
```

Avoid:

```text
update
fix
stuff
changes
```

---

# 37. PULL REQUEST PRINCIPLE

Every significant feature should ideally have:

* implementation
* tests
* documentation where needed
* CI verification

PRs should remain reviewable.

Do not create enormous unreviewable commits if the feature can reasonably be divided.

---

# 38. IMPLEMENTATION ORDER

Build BRO in this order.

## PHASE 0 — Repository

1. Inspect repository
2. Establish architecture
3. Configure TypeScript
4. Configure linting
5. Configure formatting
6. Configure Git
7. Configure environment handling
8. Configure GitHub Actions
9. Verify CI

Do this before implementing product features.

---

## PHASE 1 — Application Shell

Build:

* navigation
* theme
* design tokens
* reusable components
* loading states
* error handling

Then implement:

```text
Home
People
Spaces
Create
You
```

---

## PHASE 2 — Authentication

Implement:

* sign up
* sign in
* verification
* session persistence
* logout
* profile setup

---

## PHASE 3 — Profiles

Implement:

* profile
* edit profile
* avatar
* bio
* username
* interests

---

## PHASE 4 — Pulse

Implement:

* active users
* live conversations
* recommendations
* recent activity
* conversation cards

Pulse should become the first genuinely useful BRO screen.

---

## PHASE 5 — Conversations

Implement:

* direct conversations
* groups
* realtime messages
* reactions
* replies
* message states
* typing indicators
* presence

---

## PHASE 6 — Conversation Branches

Implement the signature BRO interaction.

Requirements:

* branch creation
* branch participants
* branch messages
* branch counts
* branch navigation
* deep links
* notifications

---

## PHASE 7 — Spaces

Implement:

* Space creation
* Space discovery
* joining/leaving
* members
* conversations
* channels
* basic moderation

---

## PHASE 8 — Search

Implement global search:

```text
People
Spaces
Conversations
Messages
Media
```

---

## PHASE 9 — Activity

Implement:

* replies
* mentions
* reactions
* follows
* Space invitations
* deep links

---

## PHASE 10 — Media

Implement:

* image upload
* image display
* file uploads
* attachment previews

---

## PHASE 11 — Production Hardening

Perform:

* security audit
* authorization review
* performance review
* error handling review
* offline behavior review
* accessibility review
* notification review
* database indexing review
* Android build review

---

# 39. TESTING STRATEGY

Tests should exist at multiple levels.

## Unit

Test:

* utilities
* validation
* state logic
* business rules

## Integration

Test:

* authentication
* conversations
* messages
* branches
* Spaces
* authorization

## UI

Test critical flows:

```text
Sign up
Login
Open Pulse
Start conversation
Send message
Create branch
Join Space
Search
Open notification
```

---

# 40. DEFINITION OF DONE

A feature is NOT complete merely because the screen exists.

A feature is complete when:

```text
UI
+
Navigation
+
Business Logic
+
Backend
+
Validation
+
Error Handling
+
Loading State
+
Empty State
+
Tests
+
CI
```

are implemented as appropriate.

---

# 41. QUALITY GATE

Before declaring a milestone complete, verify:

```text
[ ] TypeScript passes
[ ] Lint passes
[ ] Tests pass
[ ] Android build passes
[ ] GitHub Actions passes
[ ] No secrets committed
[ ] No obvious authorization vulnerabilities
[ ] Loading states exist
[ ] Error states exist
[ ] Empty states exist
[ ] Navigation works
[ ] Back navigation works
[ ] Critical flows work
```

---

# 42. GITHUB ACTIONS IS THE SOURCE OF BUILD TRUTH

A successful local command does NOT constitute production validation.

The authoritative build is:

```text
GitHub Actions
```

The agent must verify the GitHub Actions result before claiming that the Android build is healthy.

If CI fails:

1. inspect logs
2. identify root cause
3. fix
4. push
5. rerun
6. verify
7. document persistent issues

Do not simply rerun failed workflows without understanding the failure.

---

# 43. RESOURCE-AWARE DEVELOPMENT

The local environment has limited resources.

Therefore:

Prefer:

```text
GitHub Actions
```

for:

* Android builds
* release builds
* large test suites
* CI
* APK generation

Prefer local execution only for:

* code inspection
* formatting
* lightweight type checking
* lightweight unit tests
* Git operations
* small development tasks

If a task can reasonably be moved to GitHub Actions, move it there.

---

# 44. AUTONOMOUS OPERATION

You are expected to solve routine engineering problems autonomously.

When encountering an issue:

```text
IDENTIFY
   ↓
DIAGNOSE
   ↓
FIX
   ↓
TEST
   ↓
VERIFY
   ↓
CONTINUE
```

Do not stop at the first error.

Do not hide errors.

Do not bypass tests simply to make CI green.

---

# 45. WHEN UNCERTAIN

Do not invent APIs, framework behavior, package capabilities, or backend behavior.

Instead:

1. inspect documentation
2. inspect installed package versions
3. inspect existing implementation
4. test the assumption
5. choose the simplest verified solution

Document architectural decisions when uncertainty has long-term consequences.

---

# 46. DOCUMENTATION

Maintain:

```text
README.md
ARCHITECTURE.md
CONTRIBUTING.md
```

Where appropriate also maintain:

```text
docs/
├── architecture/
├── api/
├── product/
└── deployment/
```

Do not create documentation that merely repeats obvious code.

Document decisions and operational knowledge.

---

# 47. ARCHITECTURAL DECISIONS

For important architectural changes create an ADR.

Example:

```text
docs/architecture/
ADR-001-react-native-expo.md
ADR-002-convex-backend.md
ADR-003-conversation-branches.md
ADR-004-github-actions-builds.md
```

An ADR should explain:

* context
* decision
* alternatives
* consequences

---

# 48. MVP BOUNDARY

The MVP must prioritize:

```text
Authentication
Profile
Pulse
People
Direct conversations
Group conversations
Conversation branches
Spaces
Search
Activity
Notifications
Presence
Media
```

Do NOT allow scope creep into:

* marketplace
* payments
* complex AI
* livestreaming
* advanced video conferencing
* developer marketplace
* bots platform
* extensive creator monetization

unless explicitly requested.

---

# 49. FUTURE ARCHITECTURE

Build the MVP so that future features can be added without rewriting the foundation.

Potential future capabilities:

```text
AI assistants
Bots
Voice rooms
Video calls
Events
Creator tools
Payments
Marketplace
Mini apps
Automation
Public APIs
Developer platform
```

Do not implement them now.

Prepare clean extension points where appropriate.

---

# 50. PRODUCT NORTH STAR

Every implementation decision should be evaluated against this question:

> **Does this make BRO feel like a new communication environment, or are we simply rebuilding an existing chat application?**

If the latter, reconsider the implementation.

BRO should feel:

* alive
* contextual
* social
* immediate
* lightweight
* futuristic
* discoverable
* personal

---

# 51. FINAL ENGINEERING PRINCIPLE

Build the smallest system capable of delivering the BRO experience correctly.

Do not optimize for:

> "How many features can we build?"

Optimize for:

> **"How good can the core communication experience become?"**

The primary loop is:

```text
PULSE
  ↓
DISCOVER
  ↓
CONVERSATION
  ↓
BRANCH
  ↓
SPACE
  ↓
ACTIVITY
  ↓
PULSE
```

Make that loop exceptional before expanding the platform.

---

# 52. FIRST TASK

When beginning work on BRO:

1. Inspect the repository.
2. Determine whether a project already exists.
3. Identify the current framework and package manager.
4. Inspect all existing source files.
5. Do not overwrite existing work blindly.
6. Create a technical implementation plan.
7. Establish the project structure.
8. Configure GitHub Actions.
9. Establish CI.
10. Verify the first GitHub Actions run.
11. Implement the application shell.
12. Begin the MVP implementation phase-by-phase.

Do not immediately generate hundreds of files.

Build the foundation first.

---

# 53. COMPLETION STANDARD

BRO is considered production-ready only when:

```text
Application
      +
Backend
      +
Realtime
      +
Authentication
      +
Security
      +
Testing
      +
Android Build
      +
GitHub CI/CD
      +
Error Handling
      +
Performance
      +
Accessibility
```

have all reached an acceptable production standard.

The final Android APK must be reproducibly buildable through GitHub Actions.

**GitHub Actions is the primary build environment because of local resource constraints.**

The local machine must not become a required build server.

Build BRO carefully, incrementally, and verify every major milestone.

---

# 54. CLI INFRASTRUCTURE RULE

Use the existing authenticated CLIs for all infrastructure and service configuration. **Do not manually recreate or duplicate credentials, and do not reinstall tools that are already available.**

Use:

* `clerk` → authentication and user management
* `ably` → realtime, channels, presence, messaging
* `turso` → database and schema management
* `wrangler` → Cloudflare Workers, R2, and infrastructure
* `gh` → GitHub repositories, secrets, Actions, releases, and workflows
* `expo` → Mobile development tooling
* `eas` → Expo Application Services (cloud builds, store submission)

Before implementing anything, verify each CLI with its help/version/status command and inspect the existing project configuration.

Prefer CLI-driven setup and automation over dashboard configuration.

**Never expose, commit, or hardcode credentials, API keys, tokens, or secrets.**

For CI/CD, configure required secrets through GitHub CLI and use GitHub Actions for builds, tests, deployments, and other resource-intensive operations. Avoid heavy builds locally.

Use each service according to its architectural responsibility:

**Clerk = identity/auth**
**Turso = persistent data**
**Ably = realtime**
**Cloudflare = Workers/R2/infrastructure**
**GitHub = source control + CI/CD**

If a CLI command fails, diagnose the installed CLI/version and fix the underlying issue rather than bypassing the CLI with ad-hoc configuration.
