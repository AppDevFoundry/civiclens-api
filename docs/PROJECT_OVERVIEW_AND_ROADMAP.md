# CivicLens – Project Overview & Roadmap

## 1. Product Vision

**Working name:** CivicLens  
**Foundation:** Multi-platform RealWorld codebase (web, iOS, Android, Node/TS API)

CivicLens is an open-source, multi-platform app that helps people **understand what Congress is doing** in a clear, neutral, and approachable way.

It turns raw legislative data (from the **Congress.gov API** and related sources) into:

- Browseable feeds of **bills and actions**,
- **Plain-language summaries** of complex legislation,
- Topic-based **views and watchlists**,
- Cross-platform access (web, iOS, Android) backed by a shared API.

CivicLens is:

- A **real-world playground** for experimenting with coding agents on a complex, multi-repo project.
- A **flagship example** for AppDevFoundry content: “How to work with agents on a full-stack, multi-platform app.”
- A **public-good tool** that remains open-source and free to explore.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Provide a **clear, neutral interface** to legislative activity:
  - Focus on *what* bills do and *where* they are in the process.
  - Avoid persuasion; emphasize understanding and transparency.

- Showcase a **complex, realistic codebase** for:
  - Multi-platform development (web + SwiftUI + Android).
  - External API integration (Congress.gov, possibly others).
  - Use with coding agents (refactors, feature work, tests).

- Serve as an **AppDevFoundry teaching project**:
  - Cleanly documented architecture.
  - Incremental, well-defined features and phases.
  - Examples of agent-assisted coding workflows.

### 2.2 Non-Goals (for now)

- No hot-take commentary or partisan rating of bills.
- Not a full-blown activism platform (petitions, campaigns, etc.).
- Not intended to replace official legislative resources; instead, it **layers clarity and UX** on top of them.

---

## 3. Target Users & Use Cases

### 3.1 Primary Users

1. **Curious citizens**
   - Want to understand what Congress is working on, without legalese.
   - Interested in specific topics (e.g. privacy, healthcare, education).

2. **Students and educators**
   - Use the app to study the legislative process.
   - Need approachable explanations and structured information.

3. **Developers & learners (AppDevFoundry audience)**
   - Want a complex, realistic repo to explore:
     - Full-stack patterns.
     - Multi-client architecture.
     - Coding with agents on a real project.

### 3.2 Key Use Cases

1. **“What’s going on in Congress this week?”**
   - View a feed of recently introduced or updated bills.
   - Filter by chamber, topic, or status.

2. **“Help me understand this bill.”**
   - View a bill’s overview:
     - Official summary + plain-language summary.
     - Key provisions, stakeholders, and timeline.

3. **“Track the bills I care about.”**
   - Add bills to a watchlist.
   - Receive updates as they move through the process.

4. **“Explore my representatives’ activity.”**
   - View member profiles:
     - Sponsored/co-sponsored bills.
     - Committees they serve on.

---

## 4. Domain Mapping from RealWorld → CivicLens

The RealWorld Medium-style app maps naturally onto CivicLens:

- **Article → BillBrief**
  - Represents a bill (or a bill-focused “brief” entry in our system).
  - Exposes title, summary, status, topics, and related metadata.

- **Tag → Topic / Policy Area**
  - “Privacy”, “Healthcare”, “Education”, “Defense”, “Technology”, etc.

- **User Profile → Member Profile / CivicLens User**
  - Two types:
    - **Member of Congress profile view** (data from Congress.gov).
    - **CivicLens user profile** (preferences, watchlist, discussion posts).

- **Favorite → Watchlist / Follow**
  - Users can favorite:
    - Bills (watchlist).
    - Topics.
    - Members.

- **Comment → Discussion / Notes**
  - Users can ask questions, link sources, or keep their own notes on a bill page.
  - Emphasis on civil, informative discussion.

---

## 5. Core Concepts & High-Level Data Model

These concepts map to backend models (e.g., Prisma) and are shared across platforms.

- **User**
  - Authenticated CivicLens user.
  - Has preferences, watchlist, and participation in discussions.

- **Bill**
  - Core legislative item, synced from Congress.gov.
  - Key fields (high-level):
    - `congress` (number, e.g. 118)
    - `billType` (H.R., S., H.Res., S.Res., etc.)
    - `billNumber`
    - `title`
    - `introducedDate`
    - `currentStatus`
    - `policyAreas` / `subjects`
    - `sponsorMemberId`
    - `cosponsorMemberIds`
    - `officialSummary` (short & long)
    - `sourceLinks` (Congress.gov URL, PDF, etc.)

- **BillBrief**
  - CivicLens-owned representation of a bill’s “readable summary”.
  - Includes:
    - `plainLanguageSummary`
    - `keyPoints` (list)
    - `potentialImpacts` (bullet points)
    - `dataSources` (links back to official docs)
    - Timestamps (createdAt/updatedAt)

  Depending on design, `Bill` and `BillBrief` may be merged or kept as separate but linked models.

- **Member**
  - Member of Congress.
  - Fields:
    - `memberId`
    - `name`, `party`, `state`, `district`
    - `chamber` (House/Senate)
    - `termStart`, `termEnd`
    - `committees`
    - `imageUrl` (if available)

- **Action / Event**
  - Timeline entries for a bill:
    - Introduced, committee actions, floor votes, etc.
  - Used to show “where is this bill in the process?”

- **Topic**
  - Tags for bills and briefs.
  - Derived from legislative subject terms and/or manual/AI tagging.
  - Used for filtering and topic feeds.

- **Comment / DiscussionThread**
  - User-authored comments on bills or briefs.
  - Optional threading for more structured discussion.

- **WatchlistItem**
  - `(userId, billId)` mapping.
  - Used for notifications and “My Bills” view.

---

## 6. Product Walkthrough (v1 CivicLens)

### 6.1 Landing & Feed

- **Landing page**
  - Short explanation of CivicLens.
  - “Latest activity” feed with:
    - Recently introduced bills.
    - Recently updated bills.
    - Filters for chamber and topic.

- **Main feed**
  - Infinite-scroll or paginated list of BillBriefs.
  - Options to view:
    - “Recent”
    - “Trending” (most watched / most discussed)
    - “By topic” (e.g. privacy, education).

### 6.2 Bill Detail Page

For each bill:

- **Bill header**
  - Title, identifier (e.g. “H.R. 1234”).
  - Congress number, sponsor info, chamber.

- **Status & timeline**
  - Current status (e.g., “Passed House, in Senate committee”).
  - List of key actions with dates.

- **Summaries**
  - Official summary (shortened as needed).
  - CivicLens “Plain-Language Summary” (AI-assisted but clearly labeled).
  - Key points / bullet list.

- **Topics & related bills**
  - Topics/tags.
  - “Related bills” based on subjects, sponsor, or co-sponsors.

- **Discussion**
  - User comments.
  - Guidelines emphasizing civility and sources.

- **Watch / unwatch**
  - Button to add/remove from the user’s watchlist.

### 6.3 Member Pages

For each member of Congress:

- Overview:
  - Name, party, state/district, chamber.
  - Committee memberships.

- Activity:
  - Bills sponsored/co-sponsored.
  - Recently active bills.

- Aggregated topics:
  - Which topics are most common in their sponsored bills.

### 6.4 Watchlist & Notifications (basic v1)

- **Watchlist page**
  - List of bills the user is watching.
  - Highlight recent changes (status updates) since last visit.

- **Notifications (v1)**
  - In-app indicators (badge, list of “recent updates”).
  - Email notifications in later phases.

---

## 7. Roadmap & Phases

### Phase 1 – MVP: Read-Only Congress Explorer

**Objective:** Replace the default RealWorld article feed with a **bill feed**, and create a usable read-only explorer.

**Key Deliverables:**

1. **Backend Congress sync (basic)**
   - Integrate with Congress.gov API for:
     - Bills (recently introduced/updated).
   - Design `Bill` model.
   - Implement a sync job (manual or scheduled) to:
     - Fetch a subset of bills (e.g. last 7–30 days).
     - Store core bill data and status.

2. **Bill feed (web app)**
   - Adapt RealWorld feed UI to list `Bill`s instead of articles.
   - For each bill:
     - Show ID, title, introduction date, status, and topics.

3. **Bill detail page**
   - Replace article detail page with a bill view.
   - Show:
     - Core metadata.
     - Official summary (short).
     - Action timeline (if available).

4. **Topics / tags integration**
   - Map legislative subjects to RealWorld tags/topics.
   - Topic-filtered feed (e.g., “Healthcare bills”).

5. **Multi-platform baseline**
   - Ensure iOS and Android clients:
     - Use the updated API.
     - Can display the bill feed and basic detail pages (even if minimally styled at first).

> **Phase 1 = usable “Congress viewer” in web + simple mobile clients, read-only, no watchlists or comments yet.**

---

### Phase 2 – Plain-Language Summaries & Watchlists

**Objective:** Add core CivicLens “value-add”: plain summaries and personal watchlists.

**Key Deliverables:**

1. **BillBrief / Summary generation**
   - Add `BillBrief` or extend `Bill` to store:
     - Plain-language summary.
     - Key points (list).
   - AI pipeline:
     - Given official summary & metadata, generate human-readable text.
     - Cache results to avoid re-running unnecessarily.

2. **Watchlists**
   - Backend:
     - `WatchlistItem` model linking `userId` and `billId`.
     - API endpoints to add/remove watchlist entries.
   - Frontend (web, iOS, Android):
     - “Watch this bill” toggle.
     - “My Watchlist” view listing watched bills.

3. **Basic notifications**
   - In-app:
     - “Recent updates on your watched bills” section.
   - Data:
     - Track when a bill’s status changes (via periodic sync).
     - Track when a user last checked each bill.

4. **User accounts & onboarding (if not already wired)**
   - Smooth sign-up/login flow.
   - Simple “choose your topics” preferences (optional).

---

### Phase 3 – Member & Topic Deep Dives

**Objective:** Enrich the experience with member pages and deeper topic exploration.

**Key Deliverables:**

1. **Member sync**
   - Fetch members from Congress.gov.
   - Store `Member` data locally.
   - Link `Bill.sponsorMemberId` and `cosponsorMemberIds` to Member entries.

2. **Member pages**
   - Web/iOS/Android screens for members:
     - Overview, committees, sponsored bills.
   - Link from bill detail (sponsor section).

3. **Topic exploration**
   - Topic detail pages:
     - Description / tag line.
     - Recent bills in that topic.
   - “Follow topic” for users (stretch).

4. **Timeline & filters**
   - More advanced bill filters:
     - Date range.
     - Chamber.
     - Status.
     - Topic.
   - Timeline views (e.g., “bills introduced this week” vs “bills that changed status”).

---

### Phase 4 – Discussion, Personal Notes, and Education Features

**Objective:** Layer on community and learning tools while maintaining neutrality.

**Key Deliverables:**

1. **Comments / Discussion**
   - Enable comments on bills.
   - Basic moderation tools (report, hide).
   - Guidelines for respectful discussion.

2. **Personal notes / bookmarks**
   - Private notes per bill (visible only to the user).
   - Useful for students or researchers.

3. **Educational overlays**
   - Tooltips / callouts explaining:
     - What “introduced”, “committee”, “cloture”, “conference” mean.
   - Possibly a glossary or “How a Bill Becomes a Law” walkthrough.

4. **Multi-platform polish**
   - Improve mobile UX:
     - Offline-friendly watchlist.
     - “Today in Congress” snapshot on mobile home screen.

---

### Phase 5 – Advanced Features (Stretch)

- **Voting records**
  - Integrate roll-call votes.
  - Show how each member voted on tracked bills.

- **District lookup**
  - Allow users to enter their address/ZIP and see:
    - Their representatives.
    - Relevant bills.

- **Export & share**
  - Shareable bill summaries.
  - Simple export of watchlist or notes for coursework/research.

- **Visualization**
  - Charts for topics, bill volumes over time, member activity.

---

## 8. Technical Overview (High-Level)

### 8.1 Stack

- **Backend API**
  - Node.js + TypeScript.
  - RealWorld API foundation extended for CivicLens domain.
  - Integrations:
    - Congress.gov API (via api.data.gov).
    - Possibly other government/public APIs in future.

- **Web Client**
  - React (from RealWorld implementation).
  - Uses the CivicLens API to display bills, members, etc.

- **iOS Client**
  - SwiftUI app (Conduit-SwiftUI based).
  - Adapted to show CivicLens data instead of Medium-like articles.

- **Android Client**
  - Kotlin MVVM app (Conduit-Android-kotlin based).
  - Adapted similarly.

- **Data Sync**
  - Scheduled jobs (cron/tasks) hitting Congress APIs:
    - Fetch new/updated bills.
    - Fetch/update members.
  - Store in Postgres (or current RealWorld DB).

- **AI Integration (optional but core to value)**
  - Used for:
    - Plain-language summaries.
    - Key point extraction.
  - Designed as a separate service layer so models can change/evolve.

---

## 9. Neutrality, Transparency & Ethics

- **Neutral tone**
  - CivicLens describes *what* a bill does, not whether it’s good or bad.
  - If pros/cons are ever added, they should be clearly labeled and sourced.

- **Source transparency**
  - Always link to:
    - Official Congress.gov pages.
    - Underlying data sources.

- **AI summary labeling**
  - Label AI-generated text as such.
  - Encourage users to read the official summary if they need full details.

---

## 10. Role as an AppDevFoundry Example

CivicLens will be used as:

- A **case study project**:
  - Multi-platform clients.
  - API integration.
  - Background jobs, caching, and data modeling.

- A **playground for coding agents**:
  - Agents help refactor RealWorld’s generic architecture into CivicLens-specific modules.
  - Agents implement small features across web + mobile + backend.
  - Agents generate tests around complex integration code.

Documentation, architecture diagrams, and “agent-friendly tasks” will be added under `/docs/appdevfoundry/` as the project grows.

---

## 11. Next Steps

1. **Phase 1 planning**
   - Finalize the initial `Bill` model.
   - Identify a minimal subset of Congress.gov endpoints for MVP (e.g. recent bills).
   - Define the first sync job and feed UI changes.

2. **Repo housekeeping**
   - Add this document to the repo (`/docs/civiclens-overview.md`).
   - Note that this RealWorld-based project is being repurposed as CivicLens.

3. **Initial implementation**
   - Implement basic Congress sync + bill feed on backend.
   - Hook up the web client to new endpoints.
   - Update iOS/Android clients to display basic bill lists using the same API.

From there, features can be planned and implemented phase-by-phase, with coding agents assisting on both backend and client work.