# Project Logbook — Weekly Format

**Author:** HZ

**Internship period:** 17 March 2026 - 31 August 2026

**Host organisation:** Innovatree Technologies Sdn. Bhd.

**Project/client:** BP Dragonfly Garden Cafe Ordering and Management System

This is an author-reported historical log. Verify dates and activities against original
records before formal submission. The 24 reporting periods are consecutive seven-day
periods, beginning 17 March 2026 and ending 31 August 2026; they are not calendar weeks.
Weekday labels are being corrected to match the dates shown.

| **Week** | **Date Range** | **Summary (weekly narrative)** |
|---:|---|---|
| 1 | 17 Mar 2026 — 23 Mar 2026 | Summary: see details below |
```
| 17 Mar 2026 | Tuesday    | Administration  | Internship period officially begins. Initiated contact with HR and external coordinators to navigate the placement process.
| 18 Mar 2026 | Wednesday   | Interview Prep  | Coordinated schedules and made appointments for the initial internship placement interview.
| 20 Mar 2026 | Friday  | Interview       | Attended the internship interview to discuss my technical background and the potential software engineering role.
| 21 Mar 2026 | Saturday    | Administration  | Awaited the official acceptance or rejection decision following the interview.
| 23 Mar 2026 | Monday    | Acceptance      | Officially received the internship acceptance and offer letter from the company.
```
| 2 | 24 Mar 2026 — 30 Mar 2026 | Summary: see details below |
```
| 24 Mar 2026 | Tuesday    | Administration  | Signed and submitted the offer letter back to HR. Contacted the company supervisor to plan and schedule our first formal project meeting for the next day.
| 25 Mar 2026 | Wednesday   | **Meeting 1**   | First formal meeting with the supervisor. Received an introduction to the project, targets, features, and the deployment environment. Assigned a two-week task to research and survey existing ordering methods used by restaurants.
| 26 Mar 2026 | Thursday | Research        | Began remote research. Concluded that physical restaurant surveys were unnecessary; utilised personal life experiences and extensive online data, previous studies, and literature on restaurant management systems.
| 27 Mar 2026 | Friday  | Research        | Analysed data on traditional paper-based ordering systems and their inherent bottlenecks (illegibility, lost slips).
| 28 Mar 2026 | Saturday    | Research        | Investigated digital Point-of-Sale (POS) systems and their typical deployment challenges in small-to-medium restaurants.
```
| 3 | 31 Mar 2026 — 06 Apr 2026 | Summary: see details below |
```
| 31 Mar 2026 | Tuesday    | Research        | Researched self-service kiosk implementations and cost factors. Determined hardware costs were prohibitive for this project.
| 01 Apr 2026 | Wednesday   | Research        | Evaluated native mobile applications. Concluded app store friction (downloading before ordering) reduces customer adoption.
| 02 Apr 2026 | Thursday | Research        | Continued compiling research data, comparing different ordering models (kiosks, face-to-face, native mobile apps, QR code web apps, and buffets).
| 03 Apr 2026 | Friday  | Research        | Focused deep-dive into QR-code web applications. Identified this as the optimal path due to zero-installation friction and high accessibility.
| 04 Apr 2026 | Saturday    | Survey analysis | Synthesised all findings from the two-week research period into a coherent structural outline.
```
| 4 | 07 Apr 2026 — 13 Apr 2026 | Summary: see details below |
```
| 07 Apr 2026 | Tuesday    | Report writing  | Drafted the survey analysis section of the report, comparing the pros and cons of each technological approach.
| 08 Apr 2026 | Wednesday   | Report writing  | Compiled all research findings and system recommendations into the first formal report.
| 09 Apr 2026 | Thursday | Report review               | Final proofread of the research report, ensuring the recommendation for a QR-code web app is strongly supported by the data.
| 10 Apr 2026 | Friday  | Report submission           | Sent the first written report (Internship - Initial Survey Report) via email. This replaced the planned physical **Meeting 2** since this is a remote internship and I could not attend in person due to being in another country. The report recommended a QR-code-based ordering and management system web application for the restaurant.
| 11 Apr 2026 | Saturday    | Post-submission             | Awaited feedback on the first report while reviewing high-level web architecture concepts.
```
| 5 | 14 Apr 2026 — 20 Apr 2026 | Summary: see details below |
```
| 14 Apr 2026 | Tuesday    | Tech Research               | Investigated frontend frameworks suitable for rapid Single Page Application (SPA) development. Selected React.
| 15 Apr 2026 | Wednesday   | Tech Research               | Evaluated backend technologies and lightweight databases. Selected Node.js (Express) and SQLite for simple, offline-capable local deployment.
| 16 Apr 2026 | Thursday | Prototyping                 | Sketched conceptual data models and entity relationships for the restaurant operations (orders, menu items, tables).
| 17 Apr 2026 | Friday  | Planning                    | Drafted an initial feature list (cart, menu browsing, order queue) to structure the upcoming design phase.
| 18 Apr 2026 | Saturday    | Logistics                   | Coordinated travel arrangements and scheduling for my upcoming return to Batu Kawan to meet the supervisor face-to-face.
| 20 Apr 2026 | Monday    | **Returning to Batu Kawan** | I arrived to Batu Kawan and started making a plan for a face-to-face meeting for giving a demo about the latest updates and answering any questions the company supervisor might have had.
```
| 6 | 21 Apr 2026 — 27 Apr 2026 | Summary: see details below |
```
| 21 Apr 2026 | Tuesday    | Meeting Prep                | Organised my notes and prepared the presentation points to defend the QR-code web app recommendation in person.
| 22 Apr 2026 | Wednesday   | Meeting Prep                | Refined the conceptual features list and anticipated questions regarding offline capability and hardware requirements.
| 23 Apr 2026 | Thursday | Meeting Prep                | Finalised the agenda for the face-to-face meeting, ensuring all technical proposals were clear and ready for discussion.
| 24 Apr 2026 | Friday  | **Meeting 3**               | Face-to-face meeting with the supervisor. Discussed the April 2nd research report. The supervisor approved the overall direction with minor modifications. Given one week to design the system architectural and implementational design based on the findings.
| 25 Apr 2026 | Saturday    | System design               | Began designing the software architecture, database structure, and selecting the technology stack for the proposed system.
```
| 7 | 28 Apr 2026 — 04 May 2026 | Summary: see details below |
```
| 28 Apr 2026 | Tuesday    | System design               | Designed the specific database schema (tables, orders, menu_items) and drafted the RESTful API endpoints required.
| 29 Apr 2026 | Wednesday   | System design               | Finalised the architectural design document, detailing the React frontend, Express backend, and SQLite data flow.
| 30 Apr 2026 | Thursday | Report submission           | Sent the second written report (Second Report 22nd April) via email, effectively replacing **Meeting 4**. Received remote approval from the supervisor on the design and the decision to use a Raspberry Pi as our local server provider for the web app since system reliability under any circumstances was our top priority.
| 01 May 2026 | Friday  | Development                 | Started system implementation. Set up the codebase, configured the repository, and started building the Customer Ordering View and staff interface prototypes.
| 02 May 2026 | Saturday    | Development                 | Implemented the SQLite database initialisation script and seeded the full menu data.
```
| 8 | 05 May 2026 — 11 May 2026 | Summary: see details below |
```
| 05 May 2026 | Tuesday    | Development                 | Built out the core Express backend routes and connected the React frontend to fetch menu items dynamically.
| 06 May 2026 | Wednesday   | Development                 | Developed the initial real-time order tracking UI and finalized the first iterations of the Customer and staff interface views.
| 07 May 2026 | Thursday | **Meeting 5**               | Face-to-face meeting. Showed the first iterations of the Customer View and staff interface design. The supervisor approved the progress but requested the addition of two new interfaces: Management View and Payment Counter View. Discussed features and bugs.
| 08 May 2026 | Friday  | Planning                    | Planned the architecture for the newly requested Management and Payment Counter views based on supervisor feedback.
| 09 May 2026 | Saturday    | Development       | Sketched the layout and required data hooks for the Payment Counter and Management Dashboard.
```
| 9 | 12 May 2026 — 18 May 2026 | Summary: see details below |
```
| 12 May 2026 | Tuesday    | Development       | Continued development based on April 29th feedback. Started building out the Payment Counter View and Management Dashboard.
| 13 May 2026 | Wednesday   | Development       | Implemented the Employees and Inventory tabs within the Management Dashboard, integrating backend CRUD operations.
| 14 May 2026 | Thursday | Development       | Refined the Payment Counter View to handle unpaid order fetching and dynamic calculation of VAT and service charges.
| 15 May 2026 | Friday  | **Meeting 6**     | Meeting with supervisor. Presented the updated UI with the two new views. Supervisor decided to refocus the staff experience around Payment Counter and Management interfaces. Discussed adding takeaway/pickup features, thermal printer integration, and Raspberry Pi migration.
| 16 May 2026 | Saturday    | Refactoring       | Began the process of removing the legacy staff interface prototype from the codebase and shifting focus toward thermal printer preparation.
```
| 10 | 19 May 2026 — 25 May 2026 | Summary: see details below |
```
| 19 May 2026 | Tuesday    | Refactoring       | Focused on codebase cleanup, fixing crashes, removing temporary scripts, and improving overall system robustness. Safely deprecated the legacy staff interface component.
| 20 May 2026 | Wednesday   | Troubleshooting   | Investigated and resolved critical system crashes that emerged during the heavy refactoring process, ensuring core ordering stability.
| 21 May 2026 | Thursday | Maintenance       | A planned meeting was delayed as I was heavily focused on fixing a system crash and stabilising the architecture rather than adding new features.
| 22 May 2026 | Friday  | Development       | Huge milestone reached: Finalized POS receipt and kitchen checklist printing integration using a custom C# GDI engine (print_gdi.exe) specifically adapted for 58mm thermal printers. Handled character cutoff, implemented word-wrapping, automated the payment lifecycle (auto-dismissal via WebSockets), and ran a secure database purge script.
| 23 May 2026 | Saturday    | Documentation     | Continued documentation and project record refinement, improving the clarity and structure of the project materials as development progressed.
| 24 May 2026 | Sunday  | Maintenance       | Removed outdated progress-report documentation and cleaned up project records so that the repository remained more focused and easier to navigate.
| 25 May 2026 | Monday    | Development       | Implemented role-based routing for the main application entry, allowing the system to present a unified customer experience while preparing the platform for different access roles.
```
| 11 | 26 May 2026 — 01 Jun 2026 | Summary: see details below |
```
| 26 May 2026 | Tuesday    | Development       | Built the core infrastructure for centralized API communication and management-side functionality, laying the groundwork for finance, logging, and operations modules.
| 28 May 2026 | Thursday | Development       | Expanded the management module with audit logging, system settings, database management features, and printer-related support to strengthen daily operations.
| 29 May 2026 | Friday  | Development       | Implemented the Payment Counter View with staff authentication, real-time billing support, and localized interfaces, while also introducing the initial management dashboard experience.
| 31 May 2026 | Sunday  | Development       | Finalised the Customer View experience with live order tracking, menu browsing, and persisted session behavior to improve usability across customer interactions.
| 01 Jun 2026 | Monday    | UI Refinement     | Refined the app layout and interface positioning, improved notification handling, fixed timestamp issues, and enhanced navigation for the management and payment-related views.
```
| 12 | 02 Jun 2026 — 08 Jun 2026 | Summary: see details below |
```
| 02 Jun 2026 | Tuesday    | AI Integration    | Added and improved AI-powered feedback analysis features, introduced a chatbot experience, and improved responsiveness for feedback-related workflows.
| 03 Jun 2026 | Wednesday   | Feature Expansion | Improved the feedback and AI experience by refining the analysis output, separating the chatbot into its own tab, and improving the presentation of feedback-related content.
| 08 Jun 2026 | Monday    | UI Polish         | Improved the visual quality of several frontend components and polished the interface to make the overall experience more consistent and professional.
```
| 13 | 09 Jun 2026 — 15 Jun 2026 | Summary: see details below |
```
| 09 Jun 2026 | Tuesday    | Pi Recovery             | Began Raspberry Pi recovery after the supplied microSD card failed to boot the Pi. The pre-installed card was not discoverable on the network, and review of the card contents did not reveal usable Wi-Fi configuration files. ChatGPT troubleshooting suggested re-flashing the OS, but repeated attempts with Raspberry Pi Imager failed at random points during write or verification, even across different SD cards, USB drives, computers, and host systems. The problem persisted until it was identified as storage corruption rather than a configuration issue.
| 10 Jun 2026 | Wednesday   | Pi Recovery             | Continued working on the Pi recovery issue, testing alternate media and configuration steps. Confirmed that the device was still not visible on the network and that prior flash attempts were failing due to an underlying storage corruption issue rather than network configuration alone.
| 12 Jun 2026 | Friday  | Pi Recovery             | Revisited the recovery process after additional troubleshooting. Investigated partition and formatting issues, and prepared to perform a deeper disk cleanup with the goal of eliminating hidden corruption on the microSD card.
| 14 Jun 2026 | Sunday  | Pi Recovery             | Continued the Raspberry Pi recovery effort by reviewing the disk management strategy and preparing for a full wipe of the storage device. This day was dedicated to ensuring that the corrupted partition state would not block the next flash attempt.
```
| 14 | 16 Jun 2026 — 22 Jun 2026 | Summary: see details below |
```
| 16 Jun 2026 | Tuesday    | Pi Recovery             | Performed further recovery work, verifying that all previous flash failures were consistent with partition corruption. This confirmed the need for removing all active partitions and doing a deep full format before attempting the OS install again.
| 17 Jun 2026 | Wednesday    | Pi Recovery             | Final pre-flash preparation completed by checking the hardware, reinstalling the latest Raspberry Pi Imager, and creating a clean FAT32 partition layout on the microSD card. The focus remained on clearing the corrupted storage and ensuring the new image would write successfully.
| 18 Jun 2026 | Thursday   | Pi Deployment Prep       | Resolved the Raspberry Pi boot failure by fully wiping the corrupted microSD card partitions through Disk Management, deleting all active partitions, and performing a full deep format to FAT32. Replaced the old imager tool with the latest Raspberry Pi Imager from the official site (`https://downloads.raspberrypi.com/imager/imager_latest.exe`), flashed a fresh Raspberry Pi 5 OS image successfully, and configured the Pi Connect/SSH and local Wi-Fi network settings for automatic onboarding. The device began working properly on 10 June after the successful recovery and reinstallation.
| 19 Jun 2026 | Friday  | Deployment Prep          | Focused on deployment reliability and local network readiness by fixing API base configuration, resolving SQLite initialization crashes on fresh setups, and improving database file management for smoother startup behavior. These changes were important for making the system more dependable when running from a Raspberry Pi or other local host device. The Pi deployment notes also documented a bug in the cloud backup path and explained SQLite WAL behavior on Linux/Pi.
```
| 15 | 23 Jun 2026 — 29 Jun 2026 | Summary: see details below |
```
| 24 Jun 2026 | Wednesday   | Feature Expansion        | Implemented significant menu and design enhancements, including global default pattern overlays, item variation systems, manager-editable menu sections, and improved menu management controls.
| 25 Jun 2026 | Thursday | UI & Pattern System      | Expanded the pattern and visual editing experience by introducing a repository-based pattern system, advanced editing tools, improved dialog layouts, updated font options, and a more flexible feedback star system.
```
| 16 | 30 Jun 2026 — 06 Jul 2026 | Summary: see details below |
```
| 01 Jul 2026 | Wednesday   | Security & Access        | Strengthened the management and payment-side security model by introducing authentication for protected routes, improving management dashboard access, and tightening the overall application security structure.
| 02 Jul 2026 | Thursday | Security & Performance   | Implemented stronger security and performance measures, including password hashing, JWT-based protection for management and payment endpoints, image compression support, and improved backend setup documentation.
| 03 Jul 2026 | Friday  | Deployment & UX          | Added hotspot configuration support, QR code generation for tables, improved checkout button styling, safer error handling, and better support for local deployment and network usage. These updates directly supported the Raspberry Pi hotspot and cafe-network operation model.
| 04 Jul 2026 | Saturday    | Pi Reliability Planning  | Added notes about the Raspberry Pi as the planned deployment host, the need to install dependencies on Linux/ARM rather than reuse Windows-built `node_modules`, using the Pi's reachable IP instead of `localhost` for client devices, and a systemd-based startup approach. These are deployment plans, not proof of a production installation.
```
| 17 | 07 Jul 2026 — 13 Jul 2026 | Summary: see details below |
```
| 07 Jul 2026 | Tuesday    | Documentation & Handover | Improved project documentation by adding the job scope form and logbook update materials, consolidating the project's structure and progress into a more formal and professional documentation set.
| 08 Jul 2026 | Wednesday | Integration Testing & Analysis  | Reviewed comprehensive git commit history spanning April 27 through June 29, analyzing full development timeline and identifying code implementations underlying each major feature. Examined actual file changes, API modifications, and component implementations to understand system architecture deeply. Prepared detailed technical summaries of implementations completed in previous phases to inform remaining work. This analysis strengthened understanding of system's technical foundations.
| 09 Jul 2026 | Thursday | Feature Analysis & Validation   | Conducted comprehensive review of full-stack implementation across frontend components (CustomerView, PaymentCounterView, ManagementView), backend API controllers, and WebSocket real-time communication systems. Validated order management lifecycle, payment processing workflows, inventory tracking, and management dashboard functionality. Analyzed AI feedback system integration with Groq LLM, i18n support across 6 languages, and thermal printer integration. Confirmed maturity of core features.
| 10 Jul 2026 | Friday | UI/UX Consistency Review        | Reviewed UI component consistency across all views, examining botanical-themed design system, typography options (Baskerville, Merriweather, Montserrat), and responsive layout behavior. Analyzed pattern overlay system, notification system, and Radix UI accessibility integration. Identified refinement opportunities in spacing, accessibility compliance, and visual polish for production readiness.
| 11 Jul 2026 | Saturday | Documentation & Implementation  | Enhanced Job Scope Form with detailed technical descriptions of AI feedback analysis (Groq integration, prompt engineering, markdown rendering), Raspberry Pi setup procedures (OS installation, Wi-Fi configuration, network service setup), and thermal printer integration guidelines (58mm printer support, C# GDI engine integration). Updated logbook with expanded entries for May-June covering implementation phases and architectural decisions.
| 12 Jul 2026 | Sunday | Session Mgmt & Security         | Implemented session locking mechanisms (25+ lines) in ManagementView and PaymentCounterView to prevent concurrent multi-user access and ensure data integrity. Enhanced SettingsTab with comprehensive confirmation dialogs (271+ lines refactored) requiring explicit confirmation for settings changes. Implemented secure session state management tracking active user sessions and preventing simultaneous logins. This reduced risk of accidental or malicious data modifications.
| 13 Jul 2026 | Monday | Split Payment Implementation    | Implemented end-to-end split payment functionality (510+ lines across frontend/backend). Added UI components for staff to select individual items and assign to payment methods; created new API endpoint with validation middleware; enhanced CustomerView with item-level selection; added 6-language translations; implemented validation ensuring all items accounted for. This enabled flexible payment workflows for groups.
```
| 18 | 14 Jul 2026 — 20 Jul 2026 | Summary: see details below |
```
| 14 Jul 2026 | Tuesday | Analytics Localization          | Added multilingual support for analytics chart descriptions/tooltips across 5 languages (English, Farsi, Hindi, Malay, Chinese). Created ChartInfo components for contextual analytics information and implemented ChartTickWrap for improved label readability. Enhanced management dashboard analytics views with descriptive legends and better visual formatting for sales trends, inventory levels, payment methods.
| 15 Jul 2026 | Wednesday | Feature Testing & Validation    | Conducted comprehensive end-to-end testing of split payment feature across different payment method combinations and order compositions. Validated session locking implementation for proper concurrent access rejection. Tested chart export with various file formats/locales. Verified WebSocket real-time updates for order status changes. Tested JWT authentication for management/payment counter routes. Confirmed all recent features working correctly.
| 16 Jul 2026 | Thursday | Network Infrastructure         | Enhanced CORS configuration (6 commits, 20+ files) to dynamically detect/support captive portal scenarios. Implemented network utility function `getPreferredLocalIP()` intelligently selecting best local IP address. Refactored passcode logic and implemented redirect URL builder for captive portal scenarios. Added QR code type toggle to PaymentCounterView. Enhanced Vite configuration and created improved QR code download functionality. Ensured system works on various local network configs.
| 17 Jul 2026 | Friday | Backup & Code Quality           | Refactored cloudBackupService with 162+ lines enhancing local backup functionality, improving dotenv configuration, and strengthening error handling for cloud operations. Enhanced backup reconciliation logic for accurate local/cloud backup determination based on explicit freshness tracking. Cleaned up outdated backup files and reorganized directory structure. Refactored PaymentCounterView UI code (16+ lines) for readability. Updated Vite configuration and dialog components for consistency.
| 18 Jul 2026 | Saturday | Final Integration & Status      | The author records integration checks across recent changes, payment flows, session locking, exports, and network scenarios. The local/cloud backups are separate backup paths, not live database synchronization; this historical entry is not independent proof of integrity or restore success. A 95% figure was recorded as an unverified progress estimate with no documented measurement method; it is not a test result or readiness certification.
| 19 Jul 2026 | Sunday | Maintenance & Triage           | Conducted a focused bug-triage session: reviewed telemetry and audit trails, prioritized fixes for session locking edge-cases, and drafted smaller follow-up commits to address race conditions discovered during heavy concurrent testing.
| 20 Jul 2026 | Monday | Backup & Integrity              | Implemented enhanced backup verification and restore procedures to improve data integrity and avoid SQLite corruption during restores (WAL checkpointing and safe close/replace flow). Updated unit checks for backup metadata.
```
| 19 | 21 Jul 2026 — 27 Jul 2026 | Summary: see details below |
```
| 21 Jul 2026 | Tuesday | Refactor & Localization         | Performed targeted refactors in `managementController` and localization files to streamline help content and remove unused update functions. Improved dialog responsiveness and adjusted layout breakpoints for better multilingual rendering.
| 22 Jul 2026 | Wednesday | Documentation                   | Updated internal documentation and job scope forms with precise instructions for restore procedures, backup locations, and developer notes for safe DB handling. Polished deployment notes for Raspberry Pi and PC roles.
| 23 Jul 2026 | Thursday | Feature Development            | Added backend feedback system endpoints and frontend dashboard components for feedback and order-management; continued iterative improvements to dialog responsiveness and UX in management panels.
| 24 Jul 2026 | Friday | Analytics & Refactor           | Added filtering and analytics features across management tabs to improve data exploration. Applied code-structure refactors to improve readability and maintainability across management modules.
| 25 Jul 2026 | Saturday | Testing & CI Hygiene            | Ran integration smoke-tests, improved test scripts, and tightened CI hooks to fail fast on lint/type regressions. Fixed issues discovered in analytics export under edge locales.
| 26 Jul 2026 | Sunday | Stability & Shutdown           | Implemented and tested comprehensive graceful shutdown handling for the backend to ensure open resources are cleaned up and long-running tasks are cancelled on stop. Improved audit-trail UI to reflect shutdown events.
| 27 Jul 2026 | Monday | Localisation Polish             | Continued localization cleanup and help-text streamlining across tables, employees, and settings; improved formatted examples and translations in the management UI.
```
| 20 | 28 Jul 2026 — 03 Aug 2026 | Summary: see details below |
```
| 28 Jul 2026 | Tuesday | UX Refinement                   | Tweaked dialog widths and content wrapping across management panels. Adjusted chart tick labels and tooltip wording for clarity. Fixed RTL/bi-di layout issues in a few help screens.
| 29 Jul 2026 | Wednesday | Printer Integration             | Enhanced the printer subsystem with auto-discovery and persisted printer settings; implemented device selection and basic test-print routines to reduce operator friction during setup.
| 30 Jul 2026 | Thursday | Hardware Support & Feedback    | Integrated raw ESC/POS thermal printer support and improved the feedback system end-to-end. Completed robustness improvements across print paths and added configuration toggles to management UI.
| 31 Jul 2026 | Friday | Deployment Prep                | Began composing deployment scripts for management, payment counter, and table roles; documented differences between development and production modes and prepared scripts for Raspberry Pi 5 and Windows deployment.
| 01 Aug 2026 | Saturday | Documentation & Handover Prep   | Prepared handover artifacts and updated the README with new deployment options, backup locations, and troubleshooting steps for thermal printers and WAL-enabled SQLite databases.
| 02 Aug 2026 | Sunday | System Update & Localization   | Landed a comprehensive system update with UI enhancements, additional localization strings, and updated documentation for the system-update flow and version display in the manager view.
| 03 Aug 2026 | Monday | QA & Bug Fixing                 | Performed cross-platform QA on web views and fixed multiple small bugs affecting layout and printer output; regression-tested backup/restore flow on a staging snapshot.
```
| 21 | 04 Aug 2026 — 10 Aug 2026 | Summary: see details below |
```
| 04 Aug 2026 | Tuesday | Deployment Scripts & Printer    | Added and refined deployment scripts for PC and Pi (management, payment counter, table roles), performed a major printer system overhaul, and reorganized startup scripts to be more robust across environments.
| 05 Aug 2026 | Wednesday | Release Candidate Testing       | Built a release candidate bundle, exercised end-to-end payment flows with split payments and thermal printing, and tested full backup creation and restore on a staging Raspberry Pi instance.
| 06 Aug 2026 | Thursday | Monitoring & Logs              | Improved logging and audit trails across backend controllers; added more descriptive log messages to facilitate post-mortem analysis and day-to-day troubleshooting.
| 07 Aug 2026 | Friday | Minor Fixes & Polish           | Addressed small UI regressions discovered in RC testing, tightened validation on management forms, and improved error messages for backup/restore failures.
| 08 Aug 2026 | Saturday | Release Prep & Documentation    | Finalized release notes, updated the `PRINTER_SETUP` guides, and confirmed the repository `backups` directory is ignored by Git; prepared automated backup retention notes.
| 09 Aug 2026 | Sunday | Staging Deploy                 | Deployed the release candidate to a staging environment (Pi and PC), confirmed service start/stop sequences, and validated WAL checkpoints and backup exports.
```
| 22 | 11 Aug 2026 — 17 Aug 2026 | Summary: see details below |
```
| 10 Aug 2026 | Monday | Observability                  | Tuned logging verbosity for production, added health-check endpoints for automated monitoring, and fixed an edge-case leading to noisy logs during high-order throughput.
| 11 Aug 2026 | Tuesday | Hotfix & Dialog Improvements    | Applied a small hotfix to dialog sizing and action responsiveness reported from staging; updated notification timing to reduce UI flicker during rapid actions.
| 12 Aug 2026 | Wednesday | Backup Automation              | Hardened the nightly backup routine and cloud upload path; validated encryption of archive artifacts and verified restore path respects WAL semantics. Added retention policy notes to documentation.
| 13 Aug 2026 | Thursday | Accessibility & Testing        | Performed accessibility checks on management and payment views, fixed several contrast and focus-order issues, and ran a small user acceptance test with staff to validate printer workflows.
| 14 Aug 2026 | Friday | Performance & Housekeeping     | Improved backend response times for management queries by adding lightweight caching where safe; cleaned up temporary artifacts and reduced frontend bundle size by removing unused translations.
| 15 Aug 2026 | Saturday | Refactor & Maintainability      | Large code-structure refactor to improve readability and maintainability across core modules; reorganised service modules and simplified startup/shutdown sequences.
| 16 Aug 2026 | Sunday | Final Handover & Wrap-up        | Consolidated final handover documentation, updated the logbook to include the latest deployment and printer integration notes, and prepared the project for formal handover at internship completion.
| 17 Aug 2026 | Monday | Backup & UX Feedback             | Incorporated staged UX feedback from staff and tightened user-facing messaging in the Settings tab. Improved the restore workflow feedback so managers see progress and result messages. Committed frontend and controller updates aligning the UI with the new full-archive backup format.
```
| 23 | 18 Aug 2026 — 24 Aug 2026 | Summary: see details below |
```
| 18 Aug 2026 | Tuesday | Safe Restore Improvements         | Finalised `db` connection wrapper changes and ensured `performRestore` flow checkpointed WAL, closed DB, replaced the DB file atomically, ran `PRAGMA integrity_check`, and reopened the DB. Added automated rollback if integrity checks failed.
| 19 Aug 2026 | Wednesday | Manager UI Cleanup               | Removed captive-portal/hotspot controls from Management UI to simplify operator workflows. Updated localization strings and API wrappers to match the simplified settings model.
| 20 Aug 2026 | Thursday | Backup Directories & Naming     | Consolidated backup directories on disk and in code: `full-manual-backup` and `full-auto-backup`. Implemented deterministic naming and overwrite policies for manager-created archives and improved retention cleanup rules.
| 21 Aug 2026 | Friday | Data Tools & Testing             | Added `dataReset.js` and associated tests to allow deterministic test dataset resets for staging; produced a `database.sqlite.bak.*` snapshot workflow to aid safe restores and developer testing.
| 22 Aug 2026 | Saturday | Asset Cleanup                    | Removed numerous large menu images to reduce repo weight and implemented a clearer public-assets manifest. Updated frontend image-loading logic to tolerate missing assets gracefully.
| 23 Aug 2026 | Sunday | Printer & Deployment Scripts    | Landed the printer system overhaul commits — auto-discovery, persisted settings, and test-print routines — and added more robust startup scripts and environment detection for Pi/PC roles.
| 24 Aug 2026 | Monday | Staging Run                      | Performed a staging deployment combining the latest backend, frontend, and printer components. Verified WAL checkpointing, performed backup/restore dry-runs, and validated UI flows end-to-end.
```
| 24 | 25 Aug 2026 — 31 Aug 2026 | Summary: see details below |
```
| 25 Aug 2026 | Tuesday | Accessibility & Locale Fixes     | Addressed accessibility issues (contrast, focus order) discovered during staging UAT and completed additional locale fixes for analytics and help text.
| 26 Aug 2026 | Wednesday | Performance Tuning               | Added light caching for common management queries and optimized a few expensive joins and frontend renders to improve perceived responsiveness.
| 27 Aug 2026 | Thursday | CI / Release Candidate         | Finalised CI tweaks to ensure lint/type checks and test runs before release; prepared a release candidate and smoke-tested critical flows (orders, payments, backups, printing).
| 28 Aug 2026 | Friday | Documentation & Handover Notes   | Completed handover artifacts: updated `README.md`, `PRINTER_SETUP_GUIDE.md`, backup locations, and WAL/restore notes. Documented the nightly/cloud backup behavior and retention policy for the operations team.
| 29 Aug 2026 | Saturday | Final QA & Edge-case Fixes       | Executed final QA on edge cases (concurrent restores, interrupted backups) and fixed a small race condition in session-locking that surfaced under stress. Created a short-run checklist for operators.
| 30 Aug 2026 | Sunday | Release & Tag                   | The log records an intended release-candidate tag, release archive, and cloud-backup upload. No Git tag is present in the current checkout, and the archive/upload cannot be verified from repository contents; confirm the original release and backup records before claiming they were created or verified.
| 31 Aug 2026 | Monday | Internship Wrap-up               | Internship formally concluded. Consolidated all documentation, created the final handover package, pushed and tagged the final release, and provided operational notes for the host team. Celebrated the handover and outlined recommended next steps: scheduled regression testing, extended monitoring, and prioritized backlog items for the next team.
```
| 25 | 09 Nov 2026 — 15 Nov 2026 | Summary: see details below |
```
| 13 Nov 2026 | Friday | Product Scope Decision | At the restaurant owner's request, removed DragonBot from the current application. The owner considered it an optional bonus feature that added unnecessary weight and slowed the system; core restaurant workflows remain the priority. The separate feedback-analysis feature remains.
```