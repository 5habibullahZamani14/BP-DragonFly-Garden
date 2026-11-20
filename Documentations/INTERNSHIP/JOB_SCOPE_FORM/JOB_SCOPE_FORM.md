# Project Job Scope and Handover Criteria

> **Working technical scope, not an approved university or company form.** Confirm the
> required template, scope, dates, and stakeholder acceptance before submitting this as an
> official record. No completion percentage is claimed; progress must be measured against
> the acceptance evidence below.

## Project

- **Name:** BP DragonFly Garden Cafe Ordering and Management System
- **Host organization:** Innovatree Technologies Sdn. Bhd. (author-reported; verify before
  official use)
- **Project period:** 17 March 2026 to 31 August 2026 (author-reported; verify against
  placement records)
- **Purpose:** Develop a local-network application to support customer ordering and
  restaurant staff/manager workflows.

## Intended scope

- Customer menu browsing, cart, table/QR context, and order submission.
- Staff payment-counter and order-management workflows.
- Manager administration, including menu, employee, settings, and operational data.
- Backend API, local SQLite persistence, and real-time updates where implemented.
- Local hosting on a Windows computer or Raspberry Pi/Linux host.
- Integration with an operating-system printer queue.
- Backup, restore, setup, and operational handover documentation.
- Optional integrations, such as email, cloud backup, and AI feedback analysis, only when
  their credentials and external services are configured.

The application does not itself connect a customer's phone to Wi-Fi. A table QR code can
open a URL after the device has network access. Do not describe the app as providing
card-payment processing, automatic database synchronization, guaranteed offline recovery,
or production readiness unless those capabilities are separately implemented and tested.

## Expected deliverables

1. **Application source:** frontend, backend, schema/initialization, and dependency
   lockfiles.
2. **Local runtime:** documented installation, environment configuration, build, and
   startup for the selected host.
3. **Printer setup:** host queue installation plus a tested physical receipt. Queue
   acceptance alone is not proof of paper output or cutting.
4. **Data protection:** dated backups, protected secret handling, and a demonstrated
   restore on a test or maintenance environment.
5. **Handover material:** setup steps, credentials transfer using a secure channel,
   network/printer details, recovery procedure, and limitations.

These are scope and handover targets, not a declaration that each item has passed
acceptance.

## Acceptance evidence

Record a result and evidence for each target environment before calling the project ready:

| Area | Acceptance evidence |
|---|---|
| Startup | Clean install, valid `.env`, backend health endpoint responds, and frontend loads |
| Customer ordering | Menu/cart/order flow tested with a uniquely identified test order |
| Staff operations | Payment-counter and order status flows tested with expected roles |
| Management | Manager login and required admin operations tested |
| Persistence | Created/updated data remains after a clean restart |
| Printer | Test ticket physically prints with readable width; cutter tested separately if applicable |
| Backup/restore | Archive exists, is protected, and restore is demonstrated with expected data |
| Network | Intended clients connect to the host on the actual restaurant network |
| Security | Secrets are not committed; access roles and production network exposure are reviewed |
| Handover | Owner can follow the clean setup and recovery instructions without undocumented steps |

Use the repository's focused tests and operational checks as evidence, but do not treat
passing unit tests or an HTTP health response as proof of end-to-end business readiness.
Obtain owner acceptance for operational requirements and record unresolved limitations.

## Status and approval

- **Completion percentage:** Not established. Do not use prior 90% or 95% estimates without
  an agreed measurement method.
- **Technical status:** Requires verification against the acceptance table on the intended
  machine and printer.
- **Owner approval:** Record approver, date, and any accepted limitations separately.
- **Academic approval:** Verify the required format and submission deadline with the
  university; this working scope is not a substitute for official requirements.
