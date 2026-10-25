# Graph Report - frontend  (2026-10-25)

## Corpus Check
- 275 files · ~117,089 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: .example 1, (none) 1, .ico 1)

## Summary
- 1514 nodes · 4726 edges · 72 communities (62 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.81)
- Token cost: 235,296 input · 0 output

## Community Hubs (Navigation)
- Generated API Types
- Generated SDK Endpoints
- Problem Wording & Errors
- Generated SDK Client Core
- Signed-in Shell & Typing
- Message View & Timeline
- History Sync & Settings
- Motion Skill Docs
- History Windows & Catch-up
- API Client Config Types
- App Pages & Landing
- Password Reset Forms
- Message Actions & Rows
- Menu Keys & Search Panel
- Avatars & Image Recovery
- Realtime Event Reducer
- Request Serializers
- Dropdown & Conversation Menu
- Form Fields & Group Form
- Auth e2e Helpers
- Edit/Delete e2e
- Reactions UI
- Generated Client Runtime
- Notices, Buttons, Availability
- Landing Live Demos
- Conversation Index
- Realtime e2e
- Design Sample Pages
- Version Tracking (ADR-0003)
- Conversation Settings e2e
- Sign-in/Sign-up Pages
- Presence & Availability Line
- TypeScript Config
- Theme Switching
- Sign-up & Verify Forms
- Composer
- Server Problems in Forms
- Buttons & Image Files
- Screen-reader Announcements
- Session & Token Renewal
- Conversation Pane
- Conversations e2e
- Landing Hero
- Presence & Landing e2e
- Client Params Builder
- Dev Dependencies
- Runtime Dependencies
- Pane Header & Start Direct
- Package Metadata
- Auth Card Pages
- Root Layout & Fonts
- Reactions e2e
- Theme Contrast e2e
- Dev Screenshot (Dark)
- Receipts e2e
- Conversation Ordering
- Package Scripts
- Landing Screenshot
- Outbox Queue
- Typing Sender
- Search Snippets
- Interceptors
- Query Key Serializer
- ESLint Config
- Conversations Frame
- MCP Servers
- OpenAPI Codegen
- Agent Rules & README
- Next/Vercel Logos
- File Icon
- Globe Icon
- Window Icon

## God Nodes (most connected - your core abstractions)
1. `react` - 64 edges
2. `Button()` - 53 edges
3. `toProblem()` - 51 edges
4. `vitest` - 50 edges
5. `next` - 39 edges
6. `MessageView()` - 38 edges
7. `Notice()` - 35 edges
8. `messageFor()` - 35 edges
9. `@tanstack/react-query` - 34 edges
10. `ApiProblem` - 30 edges

## Surprising Connections (you probably didn't know these)
- `NewGroupPage()` --calls--> `CreateGroupForm()`  [EXTRACTED]
  app/app/(conversations)/new/group/page.tsx → features/groups/create-group-form.tsx
- `NewConversationPage()` --calls--> `StartDirectForm()`  [EXTRACTED]
  app/app/(conversations)/new/page.tsx → features/conversations/start-direct-form.tsx
- `SettingsPage()` --calls--> `SettingsView()`  [EXTRACTED]
  app/app/settings/page.tsx → features/session/settings-view.tsx
- `ConversationPage()` --calls--> `ConversationPane()`  [EXTRACTED]
  app/app/(conversations)/c/[id]/page.tsx → features/conversations/conversation-pane.tsx
- `SignedInLayout()` --calls--> `SignedInShell()`  [EXTRACTED]
  app/app/layout.tsx → components/signed-in-shell.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Motion skill entry points** — _claude_skills_motion_skill, _claude_skills_motion_best_practices_index, _claude_skills_motion_codex_index, _claude_skills_motion_css_spring_index, _claude_skills_motion_performance_audit_index, _claude_skills_motion_transition_preview_index [EXTRACTED 1.00]
- **Motion access tiers** — _claude_skills_motion_skill_motion_tiers, _claude_skills_motion_skill_motion_plus, _claude_skills_motion_skill_motion_mcp_server, _claude_skills_motion_codex_index_search_motion_source, _claude_skills_motion_transition_preview_index_open_transition_editor, _claude_skills_motion_performance_audit_index_motionscore [INFERRED 0.85]
- **React Motion rules** — _claude_skills_motion_best_practices_react, _claude_skills_motion_best_practices_react_animatepresence, _claude_skills_motion_best_practices_react_layout_animations, _claude_skills_motion_best_practices_react_motionconfig_reduced_motion, _claude_skills_motion_best_practices_react_usetransform, _claude_skills_motion_best_practices_react_motionvalue_rules [EXTRACTED 1.00]
- **create-next-app default public SVG assets** — public_file_file_icon, public_globe_globe_icon, public_next_next_js_logo, public_vercel_vercel_logo, public_window_window_icon [INFERRED 0.75]
- **Sidebar, header and thread form the two-pane layout** — public_screenshot_2026_10_19_at_22_00_55_conversation___messenger_conversation_list, public_screenshot_2026_10_19_at_22_00_55_conversation___messenger_conversation_header, public_screenshot_2026_10_19_at_22_00_55_conversation___messenger_message_thread [EXTRACTED 1.00]

## Communities (72 total, 10 thin omitted)

### Community 0 - "Generated API Types"
Cohesion: 0.04
Nodes (88): create(), deleteForEveryone(), logout(), promote(), removeAvatar(), AddParticipantRequest, AddParticipantResponses, AttachmentResponse (+80 more)

### Community 1 - "Generated SDK Endpoints"
Cohesion: 0.03
Nodes (84): addParticipant(), block(), blocks(), file(), get(), hide(), history_(), leave() (+76 more)

### Community 2 - "Problem Wording & Errors"
Cohesion: 0.07
Nodes (52): RFC-9457, codeMessageFor(), refusedCodeMessage(), signInMessageFor(), problem(), afterWrongCode(), NO_WRONG_TRIES, WRONG_CODE_LIMIT (+44 more)

### Community 3 - "Generated SDK Client Core"
Cohesion: 0.04
Nodes (52): client, edit(), forgotPassword(), me(), Options, react(), rename(), resetPassword() (+44 more)

### Community 4 - "Signed-in Shell & Typing"
Cohesion: 0.08
Nodes (34): SignedInLayout(), useConversations(), createTypingTracker(), arm(), changed(), sweep(), NOBODY, Options (+26 more)

### Community 5 - "Message View & Timeline"
Cohesion: 0.10
Nodes (30): firstCharacters(), glimpse(), distanceFromBottom(), firstPageFor(), MessageView(), scrolled(), startReply(), Props (+22 more)

### Community 6 - "History Sync & Settings"
Cohesion: 0.13
Nodes (34): direct(), useUpdateSettings(), catchUpHistory(), addMessageToHistory(), messagesKey(), reactionTimesKey(), useProfileRefresh(), applyAvailability() (+26 more)

### Community 7 - "Motion Skill Docs"
Cohesion: 0.09
Nodes (33): motion-reviewer agent, Base UI best practices, Base UI exit animations, Base UI render prop, CSS or Motion guide, Animation best practices index, Vanilla JS Motion rules, Vanilla animate() syntaxes (+25 more)

### Community 8 - "History Windows & Catch-up"
Cohesion: 0.14
Nodes (28): refreshHistory(), History, latestSeq(), linksLapsed(), markDeleted(), oldestSeq(), removeById(), removeMessage() (+20 more)

### Community 9 - "API Client Config Types"
Cohesion: 0.12
Nodes (29): CreateClientConfig, BuildUrlFn, Client, ClientOptions, Config, CreateClientConfig, MethodFn, OmitKeys (+21 more)

### Community 10 - "App Pages & Landing"
Cohesion: 0.10
Nodes (21): instant, metadata, NewGroupPage(), instant, metadata, NewConversationPage(), instant, metadata (+13 more)

### Community 11 - "Password Reset Forms"
Cohesion: 0.10
Nodes (27): defaultValues, FIELDS, resetEmail, defaultValues, FIELDS, ResetPasswordForm(), codePoints(), codeSchema (+19 more)

### Community 12 - "Message Actions & Rows"
Cohesion: 0.10
Nodes (25): messageActions, MessageItem, MessageRow(), Props, ReceiptMark(), STATUS_WORDS, Row(), markDeletedInHistory() (+17 more)

### Community 13 - "Menu Keys & Search Panel"
Cohesion: 0.11
Nodes (20): keyDown(), nextMenuIndex(), MessageMenu(), keyDown(), groupResults(), ResultGroup, conversations, checkSearchQuery() (+12 more)

### Community 14 - "Avatars & Image Recovery"
Cohesion: 0.14
Nodes (21): ADR-0005, ImageAction, ImageState, initialImageState, nextImageState(), run(), ImageViewer(), MessageImage() (+13 more)

### Community 15 - "Realtime Event Reducer"
Cohesion: 0.14
Nodes (21): directWith(), clearReactionsOf(), replaceMessage(), history(), updateReactions(), withMessage(), mergeVersion(), applyProfileChanges() (+13 more)

### Community 16 - "Request Serializers"
Cohesion: 0.13
Nodes (23): createQuerySerializer(), formDataBodySerializer, QuerySerializer, QuerySerializerOptionsObject, urlSearchParamsBodySerializer, ArraySeparatorStyle, ArrayStyle, MatrixStyle (+15 more)

### Community 17 - "Dropdown & Conversation Menu"
Cohesion: 0.18
Nodes (21): CloseMenu, DotsIcon(), DropdownMenu(), MenuItem(), Props, useCloseMenu(), ADR-0006, BlockedNotice() (+13 more)

### Community 18 - "Form Fields & Group Form"
Cohesion: 0.19
Nodes (19): Field(), FieldProps, ForgotPasswordForm(), AddAddressField(), CreateGroupForm(), addAddress(), setPeople(), FIELDS (+11 more)

### Community 19 - "Auth e2e Helpers"
Cohesion: 0.22
Nodes (21): MAILPIT_URL, codeFor(), enterCode(), fillSignUp(), info(), newAccount, otherThan(), problem() (+13 more)

### Community 20 - "Edit/Delete e2e"
Cohesion: 0.13
Nodes (14): live(), messages(), openActions(), openAs(), optionsOf(), rowOf(), BACKEND_URL, FRONTEND_URL (+6 more)

### Community 21 - "Reactions UI"
Cohesion: 0.17
Nodes (22): setReactionsInHistory(), Choices(), ReactionChips(), ReactMenu(), SmileIcon(), summary(), Target, useChooseReaction() (+14 more)

### Community 22 - "Generated Client Runtime"
Cohesion: 0.16
Nodes (21): createClient(), ReqInit, buildUrl(), checkForExistence(), createConfig(), createInterceptors(), defaultHeaders, defaultQuerySerializer (+13 more)

### Community 23 - "Notices, Buttons, Availability"
Cohesion: 0.25
Nodes (17): Button(), Notice(), AvailabilityChooser(), CHOICES, AvatarChooser(), Chosen, BlockedUserRow(), BlockedUsersSection() (+9 more)

### Community 24 - "Landing Live Demos"
Cohesion: 0.19
Nodes (17): Caption(), Dot(), GroupRoles(), Line(), LiveDemos(), PresenceAndTyping(), Receipts(), SWAP (+9 more)

### Community 25 - "Conversation Index"
Cohesion: 0.26
Nodes (19): ConversationIndex(), MuteIcon(), PinIcon(), calendarDay(), conversationAvatar(), conversationTitle(), dayNumber(), formatClock() (+11 more)

### Community 26 - "Realtime e2e"
Cohesion: 0.16
Nodes (15): index(), rowFor(), deleteMessageVia(), deliveredUpToVia(), editMessageVia(), forgotPasswordVia(), post(), put() (+7 more)

### Community 27 - "Design Sample Pages"
Cohesion: 0.17
Nodes (13): DesignSample(), INDEX, LINES, metadata, ResetPasswordPage(), metadata, VerifyPage(), AppShell() (+5 more)

### Community 28 - "Version Tracking (ADR-0003)"
Cohesion: 0.14
Nodes (12): ADR-0003, at(), isNewerVersion(), base, focusAfterRemoval(), grace, linus, withoutBlockedUser() (+4 more)

### Community 29 - "Conversation Settings e2e"
Cohesion: 0.17
Nodes (12): choose(), item(), optionsButton(), aGroup(), live(), openGroup(), summary(), conversationVia() (+4 more)

### Community 30 - "Sign-in/Sign-up Pages"
Cohesion: 0.20
Nodes (11): metadata, SignInPage(), metadata, SignUpPage(), SignInRedirect(), RedirectIfSignedIn(), RequireSession(), LOADING (+3 more)

### Community 31 - "Presence & Availability Line"
Cohesion: 0.24
Nodes (12): AvailabilityLine(), DirectAvailabilityLine(), OnlineDot(), ParticipantList(), PresenceLine(), AVAILABILITY_NAMES, availabilityNotice(), presenceText() (+4 more)

### Community 32 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 33 - "Theme Switching"
Cohesion: 0.23
Nodes (15): LABELS, savedTheme(), subscribe(), themeOnServer(), ThemeSwitch(), choose(), applyTheme(), parseTheme() (+7 more)

### Community 34 - "Sign-up & Verify Forms"
Cohesion: 0.16
Nodes (13): verificationEmail, SignUpValues, VerifyValues, defaultValues, FIELDS, SignUpForm(), defaultValues, FIELDS (+5 more)

### Community 35 - "Composer"
Cohesion: 0.18
Nodes (15): Composer(), choose(), discard(), drop(), keyDown(), paste(), removeImage(), send() (+7 more)

### Community 36 - "Server Problems in Forms"
Cohesion: 0.21
Nodes (13): SignInValues, firstMessage(), shownError(), useServerProblems(), defaultValues, FIELDS, SignInForm(), FIELDS (+5 more)

### Community 37 - "Buttons & Image Files"
Cohesion: 0.17
Nodes (11): ButtonProps, STYLES, Variant, ChosenImage, ACCEPT, ACCEPTED_TYPES, checkImageFile(), chooseImage() (+3 more)

### Community 38 - "Screen-reader Announcements"
Cohesion: 0.33
Nodes (12): announcementOf(), announcementsFor(), changeAnnouncements(), changedMessages(), LONGEST_SPOKEN, SpokenLine, spokenText(), unannounced() (+4 more)

### Community 39 - "Session & Token Renewal"
Cohesion: 0.19
Nodes (8): createSession(), publish(), signedIn(), renewalDelayMs(), Session, SessionSnapshot, Tokens, singleFlight()

### Community 40 - "Conversation Pane"
Cohesion: 0.23
Nodes (10): ConversationPage(), instant, metadata, ConversationPane(), SettingsLine(), ConversationList, useConversationList(), focusMessageRow() (+2 more)

### Community 41 - "Conversations e2e"
Cohesion: 0.26
Nodes (8): withConversations(), twoPeople(), aConversation(), twoPeople(), createVerifiedAccount(), sendMessageVia(), signIn(), startDirectVia()

### Community 42 - "Landing Hero"
Cohesion: 0.24
Nodes (10): AccountLinks(), Closing(), Hero(), LINES, Receipt(), STEPS, TypingDots(), minute() (+2 more)

### Community 44 - "Client Params Builder"
Cohesion: 0.18
Nodes (11): buildClientParams(), buildKeyMap(), extraPrefixes, extraPrefixesMap, Field, Fields, FieldsConfig, KeyMap (+3 more)

### Community 45 - "Dev Dependencies"
Cohesion: 0.15
Nodes (13): devDependencies, @axe-core/playwright@^4.14.0, @playwright/test@^1.64.1, tailwindcss@^4, @tailwindcss/turbopack@^4, @types/node@^20, @types/react@^19, vitest@^5.0.5 (+5 more)

### Community 46 - "Runtime Dependencies"
Cohesion: 0.17
Nodes (12): dependencies, motion@^14.3.0, next@16.4.2, react@19.3.0, react-dom@19.3.0, @stomp/stompjs@^7.5.0, @tanstack/react-form@^1.33.5, @tanstack/react-query@^5.104.4 (+4 more)

### Community 47 - "Pane Header & Start Direct"
Cohesion: 0.31
Nodes (7): PaneHeader(), FIELDS, StartDirectForm(), SelfConversationError, startDirectOutcome, useMe(), meOptions()

### Community 48 - "Package Metadata"
Cohesion: 0.18
Nodes (10): @types/react-dom@^19, typescript@^5, ignoreScripts, name, packageManager, private, trustedDependencies, version (+2 more)

### Community 49 - "Auth Card Pages"
Cohesion: 0.40
Nodes (6): ForgotPasswordPage(), metadata, buttonStyles(), AuthCard(), PasswordChangedView(), VerifiedView()

### Community 50 - "Root Layout & Fonts"
Cohesion: 0.27
Nodes (7): fraunces, geistMono, geistSans, metadata, RootLayout(), SessionProvider(), QueryProvider()

### Community 51 - "Reactions e2e"
Cohesion: 0.27
Nodes (6): live(), messages(), openAs(), react(), reactButton(), rowOf()

### Community 52 - "Theme Contrast e2e"
Cohesion: 0.38
Nodes (9): bodyBackground(), colourOf(), contrast(), isDark(), isLight(), luminance(), parse(), Rgb (+1 more)

### Community 53 - "Dev Screenshot (Dark)"
Cohesion: 0.27
Nodes (8): Message composer with Send button, Open Conversation header with name and presence, Conversations sidebar, Two-pane Conversation screen, Message thread with day divider and timestamps, Next.js dev indicator badge, System/Light/Dark theme switch, Top bar with brand and settings

### Community 54 - "Receipts e2e"
Cohesion: 0.28
Nodes (4): index(), mark(), messages(), rowFor()

### Community 55 - "Conversation Ordering"
Cohesion: 0.39
Nodes (6): activityOf(), orderConversations(), same(), NOW, withSettings(), ConversationSettings

### Community 56 - "Package Scripts"
Cohesion: 0.22
Nodes (9): scripts, api, build, dev, e2e, lint, start, test (+1 more)

### Community 57 - "Landing Screenshot"
Cohesion: 0.36
Nodes (6): Rubric Conversation Screenshot, Message Composer, Conversation Header with Presence, Conversations Sidebar, Message Timeline, Top Bar with Theme Switch

### Community 58 - "Outbox Queue"
Cohesion: 0.39
Nodes (6): createOutbox(), enqueue(), run(), update(), setup(), stored()

### Community 59 - "Typing Sender"
Cohesion: 0.32
Nodes (5): createTypingSender(), remind(), Options, setup(), TypingSender

### Community 60 - "Search Snippets"
Cohesion: 0.43
Nodes (4): MATCH_END, MATCH_START, parseSnippet(), SnippetPart

### Community 62 - "Query Key Serializer"
Cohesion: 0.48
Nodes (6): isPlainObject(), JsonValue, queryKeyJsonReplacer(), serializeQueryKeyValue(), serializeSearchParams(), stringifyToJsonValue()

### Community 63 - "ESLint Config"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.4.2, eslint, eslint-config-next

## Ambiguous Edges - Review These
- `Two-pane Conversation screen` → `Next.js dev indicator badge`  [AMBIGUOUS]
  public/Screenshot 2026-10-19 at 22-00-55 Conversation · Messenger.png · relation: conceptually_related_to
- `Own and Other Sender Markers` → `Message Composer`  [AMBIGUOUS]
  public/landing/conversation-rubric.png · relation: conceptually_related_to

## Knowledge Gaps
- **17 isolated node(s):** `ADR-0006`, `ADR-0003`, `RFC-9457`, `ADR-0005`, `CSS or Motion guide` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 279 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@playwright/test` connect `Edit/Delete e2e` to `Conversations e2e`, `Presence & Landing e2e`, `Dev Dependencies`, `Package Metadata`, `Reactions e2e`, `Auth e2e Helpers`, `Theme Contrast e2e`, `Receipts e2e`, `Realtime e2e`, `Conversation Settings e2e`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **What connects `ADR-0006`, `ADR-0003`, `RFC-9457` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Generated API Types` be split into smaller, more focused modules?**
  _Cohesion score 0.04294631710362047 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Form Fields & Group Form` to `Problem Wording & Errors`, `Signed-in Shell & Typing`, `Message View & Timeline`, `History Sync & Settings`, `App Pages & Landing`, `Password Reset Forms`, `Message Actions & Rows`, `Menu Keys & Search Panel`, `Avatars & Image Recovery`, `Dropdown & Conversation Menu`, `Reactions UI`, `Notices, Buttons, Availability`, `Landing Live Demos`, `Conversation Index`, `Design Sample Pages`, `Sign-in/Sign-up Pages`, `Presence & Availability Line`, `Theme Switching`, `Sign-up & Verify Forms`, `Server Problems in Forms`, `Buttons & Image Files`, `Screen-reader Announcements`, `Conversation Pane`, `Landing Hero`, `Runtime Dependencies`, `Pane Header & Start Direct`, `Package Metadata`, `Auth Card Pages`, `Root Layout & Fonts`, `Conversations Frame`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Should `Generated SDK Endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.032492997198879554 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Two-pane Conversation screen` and `Next.js dev indicator badge`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Own and Other Sender Markers` and `Message Composer`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._