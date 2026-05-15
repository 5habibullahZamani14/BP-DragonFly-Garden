# Project Logbook — BP DragonFly Garden Ordering System

**Author:** HZ  
**Internship period:** 9 March 2026 – 23 August 2026  
**Host organisation:** BP DragonFly Garden  
**Degree programme:** Bachelor's in Computer Science / Software Engineering  
**Project:** QR-code-based table ordering and restaurant management system  
**Current progress (as of 14 May 2026):** ~40% complete — core ordering system functional and hardware printer integration established

## March 2026

| **Date** | **Day** | **Phase** | **Log Entry** |
| --- | --- | --- | --- |
| 09 Mar 2026 | Monday | Administration | Internship period officially begins. Initiated contact with HR and external coordinators to navigate the placement process. |
| 10 Mar 2026 | Tuesday | Interview Prep | Coordinated schedules and made appointments for the initial internship placement interview. |
| 12 Mar 2026 | Thursday | Interview | Attended the internship interview to discuss my technical background and the potential software engineering role. |
| 13 Mar 2026 | Friday | Administration | Awaited the official acceptance or rejection decision following the interview. |
| 15 Mar 2026 | Sunday | Acceptance | Officially received the internship acceptance and offer letter from the company. |
| 16 Mar 2026 | Monday | Administration | Signed and submitted the offer letter back to HR. Contacted the company supervisor to plan and schedule our first formal project meeting for the next day. |
| 17 Mar 2026 | Tuesday | **Meeting 1** | First formal meeting with the supervisor. Received an introduction to the project, targets, features, and the deployment environment. Assigned a two-week task to research and survey existing ordering methods used by restaurants. |
| 18 Mar 2026 | Wednesday | Research | Began remote research. Concluded that physical restaurant surveys were unnecessary; utilised personal life experiences and extensive online data, previous studies, and literature on restaurant management systems. |
| 19 Mar 2026 | Thursday | Research | Analysed data on traditional paper-based ordering systems and their inherent bottlenecks (illegibility, lost slips). |
| 20 Mar 2026 | Friday | Research | Investigated digital Point-of-Sale (POS) systems and their typical deployment challenges in small-to-medium restaurants. |
| 23 Mar 2026 | Monday | Research | Researched self-service kiosk implementations and cost factors. Determined hardware costs were prohibitive for this project. |
| 24 Mar 2026 | Tuesday | Research | Evaluated native mobile applications. Concluded app store friction (downloading before ordering) reduces customer adoption. |
| 25 Mar 2026 | Wednesday | Research | Continued compiling research data, comparing different ordering models (kiosks, face-to-face, native mobile apps, QR code web apps, and buffets). |
| 26 Mar 2026 | Thursday | Research | Focused deep-dive into QR-code web applications. Identified this as the optimal path due to zero-installation friction and high accessibility. |
| 27 Mar 2026 | Friday | Survey analysis | Synthesised all findings from the two-week research period into a coherent structural outline. |
| 30 Mar 2026 | Monday | Report writing | Drafted the survey analysis section of the report, comparing the pros and cons of each technological approach. |
| 31 Mar 2026 | Tuesday | Report writing | Compiled all research findings and system recommendations into the first formal report. |

## April 2026

| **Date** | **Day** | **Phase** | **Log Entry** |
| --- | --- | --- | --- |
| 01 Apr 2026 | Wednesday | Report review | Final proofread of the research report, ensuring the recommendation for a QR-code web app is strongly supported by the data. |
| 02 Apr 2026 | Thursday | Report submission | Sent the first written report (Internship - Initial Survey Report) via email. This replaced the planned physical **Meeting 2** since this is a remote internship and I could not attend in person due to being in another country. The report recommended a QR-code-based ordering and management system web application for the restaurant. |
| 03 Apr 2026 | Friday | Post-submission | Awaited feedback on the first report while reviewing high-level web architecture concepts. |
| 06 Apr 2026 | Monday | Tech Research | Investigated frontend frameworks suitable for rapid Single Page Application (SPA) development. Selected React. |
| 07 Apr 2026 | Tuesday | Tech Research | Evaluated backend technologies and lightweight databases. Selected Node.js (Express) and SQLite for simple, offline-capable local deployment. |
| 08 Apr 2026 | Wednesday | Prototyping | Sketched conceptual data models and entity relationships for the restaurant operations (orders, menu items, tables). |
| 09 Apr 2026 | Thursday | Planning | Drafted an initial feature list (cart, menu browsing, kitchen queue) to structure the upcoming design phase. |
| 10 Apr 2026 | Friday | Logistics | Coordinated travel arrangements and scheduling for my upcoming return to Batu Kawan to meet the supervisor face-to-face. |
| 12 Apr 2026 | Sunday | **Returning to Batu Kawan** | I arrived to Batu Kawan and started making a plan for a face-to-face meeting for giving a demo about the latest updates and answering any questions the company supervisor might have had. |
| 13 Apr 2026 | Monday | Meeting Prep | Organised my notes and prepared the presentation points to defend the QR-code web app recommendation in person. |
| 14 Apr 2026 | Tuesday | Meeting Prep | Refined the conceptual features list and anticipated questions regarding offline capability and hardware requirements. |
| 15 Apr 2026 | Wednesday | Meeting Prep | Finalised the agenda for the face-to-face meeting, ensuring all technical proposals were clear and ready for discussion. |
| 16 Apr 2026 | Thursday | **Meeting 3** | Face-to-face meeting with the supervisor. Discussed the April 2nd research report. The supervisor approved the overall direction with minor modifications. Given one week to design the system architectural and implementational design based on the findings. |
| 17 Apr 2026 | Friday | System design | Began designing the software architecture, database structure, and selecting the technology stack for the proposed system. |
| 20 Apr 2026 | Monday | System design | Designed the specific database schema (tables, orders, menu_items) and drafted the RESTful API endpoints required. |
| 21 Apr 2026 | Tuesday | System design | Finalised the architectural design document, detailing the React frontend, Express backend, and SQLite data flow. |
| 22 Apr 2026 | Wednesday | Report submission | Sent the second written report (Second Report 22nd April) via email, effectively replacing **Meeting 4**. Received remote approval from the supervisor on the design and the decision to use a Raspberry Pi as our local server provider for the web app since system reliability under any circumstances was our top priority. |
| 23 Apr 2026 | Thursday | Development | Started system implementation. Set up the codebase, configured the repository, and started building the Customer Ordering View and Kitchen View. |
| 24 Apr 2026 | Friday | Development | Implemented the SQLite database initialisation script and seeded the full menu data. |
| 27 Apr 2026 | Monday | Development | Built out the core Express backend routes and connected the React frontend to fetch menu items dynamically. |
| 28 Apr 2026 | Tuesday | Development | Developed the initial real-time order tracking UI and finalized the first iterations of the Customer and Kitchen Views. |
| 29 Apr 2026 | Wednesday | **Meeting 5** | Face-to-face meeting. Showed the first iterations of the Customer View and Kitchen View. The supervisor approved the progress but requested the addition of two new interfaces: Management View and Payment Counter View. Discussed features and bugs. |
| 30 Apr 2026 | Thursday | Planning | Planned the architecture for the newly requested Management and Payment Counter views based on supervisor feedback. |

## May 2026

| **Date** | **Day** | **Phase** | **Log Entry** |
| --- | --- | --- | --- |
| 01 May 2026 | Friday | Development | Sketched the layout and required data hooks for the Payment Counter and Management Dashboard. |
| 04 May 2026 | Monday | Development | Continued development based on April 29th feedback. Started building out the Payment Counter View and Management Dashboard. |
| 05 May 2026 | Tuesday | Development | Implemented the Employees and Inventory tabs within the Management Dashboard, integrating backend CRUD operations. |
| 06 May 2026 | Wednesday | Development | Refined the Payment Counter View to handle unpaid order fetching and dynamic calculation of VAT and service charges. |
| 07 May 2026 | Thursday | **Meeting 6** | Meeting with supervisor. Presented the updated UI with the two new views. Supervisor decided to completely drop the Kitchen View. Discussed adding takeaway/pickup features, thermal printer integration, and Raspberry Pi migration. |
| 08 May 2026 | Friday | Refactoring | Began the process of removing the Kitchen View logic from the codebase and shifting focus toward thermal printer preparation. |
| 11 May 2026 | Monday | Refactoring | Focused on codebase cleanup, fixing crashes, removing temporary scripts, and improving overall system robustness. Safely deprecated and removed the Kitchen View component. |
| 12 May 2026 | Tuesday | Troubleshooting | Investigated and resolved critical system crashes that emerged during the heavy refactoring process, ensuring core ordering stability. |
| 13 May 2026 | Wednesday | Maintenance | A planned meeting was delayed as I was heavily focused on fixing a system crash and stabilising the architecture rather than adding new features. |
| 14 May 2026 | Thursday | Development | Huge milestone reached: Finalized POS receipt and kitchen checklist printing integration using a custom C# GDI engine (`print_gdi.exe`) specifically adapted for 58mm thermal printers. Handled character cutoff, implemented word-wrapping, automated the payment lifecycle (auto-dismissal via WebSockets), and ran a secure database purge script. |

## Upcoming — 15 May 2026 onwards

| **Planned date** | **Event / Task** |
| --- | --- |
| 20 May | Raspberry Pi 5 deployment, Linux printing (CUPS/escpos), and auto-start configuration |
| 25 May | Preparation for physical deployment and staff training |
| 1 Jun | QR sticker generation and printing; final table/staff QR codes |
|  8 Jun | Full end-to-end test with cafe staff |
| TBD | Meeting 7 — Hardware and deployment review |
| TBD | Meeting 8 — Final user acceptance testing |
| TBD | Meeting 9 — Handover and sign-off |
| 23 Aug 2026 | End of internship |

## Quick Reference — System Overview

### Deployment

| **Service** | **Port** | **Notes** |
| --- | --- | --- |
| Backend API + WebSocket | 5000 | Also serves compiled frontend in production |
| Frontend (dev only) | 5173 | Vite dev server, proxies API to port 5000 |

_Logbook maintained by HZ. Last updated: 14 May 2026._