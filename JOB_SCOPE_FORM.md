# JOB SCOPE FORM

## Project Information

- Project Name: BP DragonFly Garden Cafe Ordering and Management System
- Project Type: Internship Project / Solo Developer Development
- Project Objective: Design, develop, and deliver a complete restaurant operations platform for a cafe environment, including customer ordering, payment processing, and management administration.
- Project Environment: Local network deployment with a Raspberry Pi-based setup, supporting web-based access through QR codes.
- Project Status: 90% implementation complete; remaining work focuses on final completion, validation, and handover readiness.

## 1. Purpose of This Job Scope Form

This document serves as the official job scope for the BP Dragonfly Garden Cafe Ordering and Management System project. It defines the sequential tasks, responsibilities, and deliverables required to complete the system from the initial concept stage to full project delivery. It is structured as a professional implementation guide for the developer to follow during the internship period.

## 2. Project Completion Status

The project is currently at approximately 90% completion. The remaining work must focus on finishing the final implementation details, validating the full system, and ensuring the application is fully operational, stable, and ready for handover.

## 3. Chronological Job Scope

### Phase 1: Project Initiation and Discovery

Task 1.1: Understand the business need

{MAIN-TASK-EXPLANATION}: The business need is to create a practical cafe ordering and management system that supports customers, payment staff, and managers through a shared local-network experience. The solution must address the need for fast ordering, clear workflow handling, secure administration, and simple deployment in a cafe environment where reliability, clarity, and ease of use are essential. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Identify the restaurant's operational workflow.
  - ***{EXPLANATIONS}:*** The current system has already been shaped around a clear operational model in which customers browse and place orders, staff review and complete payments, and managers oversee administration through a unified platform. This workflow is the foundation of the business logic and defines how the application is expected to behave in day-to-day use.
- Understand how customers, payment staff, and managers interact with the system.
  - ***{EXPLANATIONS}:*** The application is now structured around three main user areas: the customer ordering experience, the payment counter workflow, and the management dashboard. These interfaces are deliberately separated to reflect the practical role divisions that exist in a real cafe operating environment.
- Define the core problems the solution must solve.
  - ***{EXPLANATIONS}:*** The system is intended to reduce operational complexity, improve order visibility, support faster payments, and provide managers with a dependable administrative surface. These objectives remain central to the project because the success of the platform depends on its ability to serve the restaurant environment in an efficient and professional manner.

Task 1.2: Define project scope and objectives

{MAIN-TASK-EXPLANATION}: The scope is to build a complete restaurant management platform that can be used locally and accessed through web-based interfaces. The objective is to deliver a system that is functional, organized, and suitable for practical use in a cafe setting while remaining realistic for an internship-level implementation with clear delivery boundaries. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Determine the system's primary goals.
  - ***{EXPLANATIONS}:*** The principal goals of the project are to allow customers to place orders easily, to support staff in payment handling, and to give managers reliable oversight of the system. These goals have remained consistent throughout the project and continue to shape the functional direction of the application.
- Establish the required features and user roles.
  - ***{EXPLANATIONS}:*** The current implementation is centered on customer, payment counter, and manager roles, each with a distinct workflow and interface experience. This separation is important because it mirrors the operational responsibilities of the cafe environment and prevents the system from becoming overly generic or poorly structured.
- Define the project boundaries and deliverables.
  - ***{EXPLANATIONS}:*** The project scope is focused on ordering, payment processing, management administration, local-network deployment, and practical handover readiness. The work is intentionally centered on these operational needs so that the application remains coherent, realistic, and useful rather than expanding into unrelated or excessive functionality.

Deliverables:

- Project goals
  - ***{EXPLANATIONS}:*** The project goals are now clearly established around creating a practical cafe ordering and management platform that supports customer ordering, staff payment handling, and manager administration through a shared local-network system. This deliverable is already ready because the business purpose has been documented and reflected throughout the implementation.
- Functional requirements
  - ***{EXPLANATIONS}:*** The functional requirements are represented by the main business journeys of menu browsing, order placement, payment completion, and administrative management. This deliverable is already ready because the application now clearly supports each of these major functions in an integrated manner.
- Initial project scope definition
  - ***{EXPLANATIONS}:*** The initial scope definition is now well formed and focused on a cafe deployment model with QR-based access, order processing, payment handling, local data storage, and administrative oversight. This deliverable is already ready because the project remains purpose-driven and does not drift into unnecessary complexity.

### Phase 2: Planning and Solution Design

Task 2.1: Create the overall project plan

{MAIN-TASK-EXPLANATION}: The project plan has been organized around the major development areas of frontend experience, backend services, local data handling, and deployment readiness. This planning approach allows the system to be built in a structured and professional sequence rather than as an uncoordinated set of isolated features. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Break the project into major development stages.
  - ***{EXPLANATIONS}:*** The implementation has been divided into distinct phases covering frontend construction, backend setup, workflow development, administrative functionality, security, resilience, and deployment. This staged structure is important because it supports clear progress tracking and prevents the project from becoming difficult to manage.
- Plan frontend, backend, database, and deployment work.
  - ***{EXPLANATIONS}:*** The current repository structure clearly separates the React-based frontend, the Node.js backend, the database layer, and supporting deployment assets. This separation demonstrates that the implementation has been intentionally planned around maintainability and professional delivery standards.
- Prepare a roadmap for implementation and delivery.
  - ***{EXPLANATIONS}:*** The project now has a practical roadmap that moves from core functionality to validation, hardening, and handover. The roadmap is already meaningful because it reflects the actual progress of the system rather than a theoretical development plan.

Task 2.2: Design the system architecture

{MAIN-TASK-EXPLANATION}: The system architecture is based on a client-server model in which the frontend communicates with a backend service and the backend manages the application logic and local data storage. This design supports a lightweight deployment model that is well suited to a cafe environment and a Raspberry Pi-based host. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Define the frontend and backend structure.
  - ***{EXPLANATIONS}:*** The frontend is implemented as a Vite React TypeScript application, while the backend is implemented as a Node.js Express application with clearly separated route, controller, middleware, database, and utility layers. This structure is already robust enough to support continued development and future maintenance.
- Plan the communication between client and server.
  - ***{EXPLANATIONS}:*** The current implementation relies on HTTP-based API requests for normal application actions and real-time communication for live updates where needed. This balance is appropriate for a local system because it keeps the architecture simple while still delivering a responsive experience to users.
- Decide on the database approach and data flow.
  - ***{EXPLANATIONS}:*** The application uses a local SQLite database for persistent storage, with the backend acting as the main processing layer and the frontend interacting with it through API endpoints. The data flow is centered on customer requests being submitted, processed, stored, and reflected back into the relevant interface in a consistent and predictable way.

Task 2.3: Define key user journeys and operational roles

{MAIN-TASK-EXPLANATION}: The main user journeys have been defined around the primary operational experiences of ordering as a customer, processing payments as counter staff, and managing the system as a manager. These journeys guide the interface structure, the workflow logic, and the expectations placed on each role. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Customer ordering flow.
  - ***{EXPLANATIONS}:*** The customer experience includes menu browsing, item selection, cart management, and order submission. This journey has already become one of the central values of the platform because it directly supports the main purpose of the cafe ordering experience.
- Payment handling flow.
  - ***{EXPLANATIONS}:*** The payment counter workflow allows pending orders to be reviewed and marked as paid after completion. This flow is essential because it bridges the customer-facing ordering process with the operational needs of the staff and the business.
- Manager dashboard operations.
  - ***{EXPLANATIONS}:*** The management interface provides access to administrative controls, configuration tools, monitoring features, and operational visibility. This role-based experience is important because managers need a clear overview of the system without being involved in the direct ordering process.

Deliverables:

- Project roadmap
  - ***{EXPLANATIONS}:*** The roadmap is now established through the phased implementation structure documented in this job scope and reflected by the repository’s separation of frontend, backend, data, and deployment assets. This deliverable is already ready because the development path is clear, practical, and professionally organized.
- System architecture plan
  - ***{EXPLANATIONS}:*** The architecture is defined around a frontend-backend-local database structure with QR-based access, local-network deployment, and a Raspberry Pi hosting model. This deliverable is already ready because the project demonstrates a coherent and understandable application architecture.
- Functional workflow definitions
  - ***{EXPLANATIONS}:*** The main operational workflows are now documented through the customer ordering experience, the payment processing flow, and the management administration journey. This deliverable is already ready because the application logic and user interfaces are aligned with these workflows.

### Phase 3: Environment Setup and Development Foundation

Task 3.1: Set up the development workspace

{MAIN-TASK-EXPLANATION}: The development workspace has been established with separate frontend and backend folders so that the application can be built and managed as a full-stack project. This separation improves maintainability and makes the system easier to understand for future handover and extension. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Initialize the frontend application.
  - ***{EXPLANATIONS}:*** The frontend has been set up as a Vite-based React application with TypeScript support, a structured source folder, and a modern component-based UI architecture. This foundation is already strong enough to support the application’s visual experience and usability goals.
- Initialize the backend service.
  - ***{EXPLANATIONS}:*** The backend has been initialized as a Node.js service with its own source structure, runtime configuration, and application modules. This service layer now provides the core logic required for request handling, persistence, and operational processing.
- Organize the repository structure for maintainability.
  - ***{EXPLANATIONS}:*** The project is already arranged into clear directories for frontend code, backend logic, database files, scripts, documentation, and deployment-related assets. This structure is important because it supports a professional handover and reduces the chance of confusion during future maintenance.

Task 3.2: Configure the development tools

{MAIN-TASK-EXPLANATION}: The development environment has been configured to support both local development and practical project execution. The toolchain has been aligned with the demands of a modern full-stack web application and a local hardware deployment environment. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Set up a modern frontend toolchain.
  - ***{EXPLANATIONS}:*** The frontend uses Vite, React, TypeScript, Tailwind CSS, and supporting libraries to provide a responsive and maintainable interface. This toolchain is already suitable for the current functionality and ensures that the user experience remains modern and efficient.
- Configure backend runtime and dependency management.
  - ***{EXPLANATIONS}:*** The backend uses Node.js with Express and supporting libraries for routing, configuration, authentication, and database interaction. This runtime setup is already adequate for the production-style local deployment model that the project is preparing for.
- Prepare the environment for local development and testing.
  - ***{EXPLANATIONS}:*** The system is organized so that it can be started, tested, and refined during development before final delivery. This is essential because the project must be validated in a realistic environment rather than assumed to work purely on paper.

Deliverables:

- Working development environment
  - ***{EXPLANATIONS}:*** A development environment has been established with a separate frontend and backend workspace, supporting local testing and iterative development. This deliverable is already ready because the project includes a structured working setup and clearly organized source folders.
- Project folder structure
  - ***{EXPLANATIONS}:*** The repository contains a clear division between frontend UI, backend logic, database files, scripts, and supporting documentation. This deliverable is already ready because the structure is understandable, maintainable, and professional.
- Initial codebase foundation
  - ***{EXPLANATIONS}:*** The initial codebase foundation is in place with application entry points, supporting libraries, and source organization. This deliverable is already ready because the project has moved beyond a bare skeleton and now contains functional modules.

### Phase 4: Backend Development and Core Server Setup

Task 4.1: Build the backend foundation

{MAIN-TASK-EXPLANATION}: The backend foundation is already in place and provides the main runtime environment for the application. It includes the core server entry point, supporting modules, and the basic structure needed to process application requests from the frontend. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Create the server entry point.
  - ***{EXPLANATIONS}:*** A backend entry module is present and serves as the starting point for launching the application and handling runtime operations. This is a foundational requirement because every user interaction eventually depends on the server being available and responsive.
- Set up routing and request handling.
  - ***{EXPLANATIONS}:*** The backend structure supports organized route handling and request processing through dedicated route and controller files. This structure is important because it ensures that logic remains modular and easier to maintain as the project expands.
- Prepare the API structure for major modules.
  - ***{EXPLANATIONS}:*** The backend is already organized around major functional areas such as menu operations, orders, payments, management actions, and system settings. This modular approach is essential because it prevents the server layer from becoming tightly coupled and difficult to extend.

Task 4.2: Implement backend configuration and environment handling

{MAIN-TASK-EXPLANATION}: The backend configuration layer has been established to support environment-based settings and deployment readiness. This is important because the system must run consistently across development, testing, and practical local deployment scenarios. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Configure runtime variables.
  - ***{EXPLANATIONS}:*** Environment configuration is now part of the backend setup and is used to control runtime behavior, service integrations, and deployment-related settings. This ensures that the application is not hardcoded in a way that reduces portability or makes deployment more fragile.
- Manage secure configuration for authentication and service integrations.
  - ***{EXPLANATIONS}:*** The backend includes support for secret-based configuration, protected access logic, email integration, and other service-related settings. This is critical because the project is no longer just a demo and must behave more like a practical operational system.
- Prepare the backend for deployment.
  - ***{EXPLANATIONS}:*** The backend has been structured with deployment in mind and includes configuration points that support running the application in a local network environment. This is a major step toward making the system suitable for real-world use rather than only local development.

Task 4.3: Build the database structure

{MAIN-TASK-EXPLANATION}: The database structure has been implemented using a local SQLite-based approach. This choice is appropriate because the project requires a lightweight and self-contained data layer that can run locally without depending on a large external database installation. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Create the main database schema.
  - ***{EXPLANATIONS}:*** The backend includes database logic for storing core application data such as orders, settings, user-related records, and operational state. This schema is already a core part of the system because it allows the application to persist information across sessions and maintain a reliable state.
- Define entities for orders, menu items, users, settings, and logs.
  - ***{EXPLANATIONS}:*** The current data model is organized around the main information the system must manage during day-to-day operation. This includes the actual restaurant data that drives the ordering and management workflows.
- Implement initial seed data.
  - ***{EXPLANATIONS}:*** The database setup includes seed data support so that the application can be started with a usable baseline state. This makes the project more practical because it reduces the amount of setup work required before the system can be used.

Task 4.4: Implement core business logic

{MAIN-TASK-EXPLANATION}: The core business logic has been developed around the main restaurant workflow. This includes order processing, status management, payment updates, and role-based administrative behavior, all of which are essential functions of the system. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Process orders.
  - ***{EXPLANATIONS}:*** The backend supports the creation and handling of customer orders as part of the application workflow. This is one of the most important business capabilities of the platform because the ordering system would be incomplete without it.
- Manage order statuses.
  - ***{EXPLANATIONS}:*** The system tracks orders through their lifecycle and updates their current state as the workflow advances. This is essential for keeping the operational process organized and traceable.
- Handle restaurant operational workflows.
  - ***{EXPLANATIONS}:*** The backend logic reflects the main operational requirements of the cafe system, including ordering, payment updates, and management-related actions. This ensures that the system behaves like a professional restaurant tool rather than a simple prototype.

Deliverables:

- Functional backend server
  - ***{EXPLANATIONS}:*** The backend server is implemented and provides request handling, route structure, controller logic, and database interaction for core operations. This deliverable is already ready because the server is present and actively supports the application’s main workflows.
- Database schema and seed data
  - ***{EXPLANATIONS}:*** The database layer includes schema initialization and seed data for the main entities required by the system. This deliverable is already ready because the data structure exists and can be used to initialize the application in a usable state.
- Core business logic modules
  - ***{EXPLANATIONS}:*** The core business logic covers order handling, payment updates, management actions, and role-based operational behavior. This deliverable is already ready because the necessary business flows are implemented in the backend controllers and routes.

### Phase 5: Frontend Development and User Interface Build

Task 5.1: Build the main application interface

{MAIN-TASK-EXPLANATION}: The main frontend interface has been developed to provide a polished and organized experience for the three main user roles. The interface has been designed to be clear, responsive, and suitable for a practical service environment. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Create the overall layout and navigation structure.
  - ***{EXPLANATIONS}:*** The frontend contains a structured application layout with dedicated views and reusable interface components. This layout is important because it defines how users move through the system and how different functional areas are presented.
- Develop reusable UI components and screen layouts.
  - ***{EXPLANATIONS}:*** The project includes a component-based structure that supports consistent design and maintainability. This is particularly important for a multi-role application because the interface must remain coherent across different workflows.
- Ensure the interface is responsive and suitable for mobile and tablet usage.
  - ***{EXPLANATIONS}:*** The frontend has been built with modern UI practices to support practical interaction across a variety of devices. This is essential because the application is intended to run in a real cafe environment where users may access it through different screens and network conditions.

Task 5.2: Implement the customer-facing experience

{MAIN-TASK-EXPLANATION}: The customer-facing experience has been created to allow users to browse the menu and submit orders through a simple, guided flow. This part of the system is central to the overall value of the project because the customer experience directly shapes the restaurant’s service quality. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Create the menu browsing experience.
  - ***{EXPLANATIONS}:*** The customer interface supports viewing the menu and selecting items in a clear manner. This is essential because the ordering experience must be simple enough for a customer to use without confusion or delay.
- Implement item selection and cart functions.
  - ***{EXPLANATIONS}:*** The application includes interactions that allow users to add items and prepare their selection for submission. This is a key part of converting the interface into a practical ordering solution rather than just a visual mockup.
- Provide a smooth checkout process.
  - ***{EXPLANATIONS}:*** The customer flow is designed to take the order from selection to submission in a straightforward and understandable way. This supports the business goal of making the service faster and more reliable in live use.

Task 5.3: Implement the QR-based access flow

{MAIN-TASK-EXPLANATION}: The QR-based access flow has been included so that the system can be used in a cafe environment without requiring users to manually enter long addresses or complex paths. This improves convenience, reduces friction, and makes the deployment more practical for staff and customers. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Connect QR code entry points to the appropriate views.
  - ***{EXPLANATIONS}:*** The application is designed to route users to the relevant customer, payment, or manager experience through QR-based entry points. This is important because it makes the deployment feel accessible and professional rather than technical or cumbersome.
- Ensure each role has the correct interface and workflow.
  - ***{EXPLANATIONS}:*** The frontend is organized so that each role receives the interface that matches its responsibilities. This role-based presentation is essential for clarity and operational correctness.

Deliverables:

- Functional frontend application
  - ***{EXPLANATIONS}:*** The frontend application is implemented as a React-based interface with structured page components, reusable UI elements, and role-based view handling. This deliverable is already ready because the user interface is present, operational, and connected to the backend services.
- Customer-facing order interface
  - ***{EXPLANATIONS}:*** The customer-facing experience includes menu browsing, item selection, and order submission. This deliverable is already ready because the interface is built and aligned with the core business objective of ordering from a cafe environment.
- Role-based app entry points
  - ***{EXPLANATIONS}:*** Role-based entry points exist through the customer, payment counter, and management views, with QR-based navigation linking users to the appropriate workflow. This deliverable is already ready because the application already presents distinct entry paths for the main user roles.

### Phase 6: Ordering and Order Workflow Development

Task 6.1: Implement customer order submission

{MAIN-TASK-EXPLANATION}: Customer order submission has been implemented as a key part of the system. The workflow allows users to place orders from the menu and send them into the application’s processing flow in a way that is simple and dependable. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Allow users to place orders from the menu.
  - ***{EXPLANATIONS}:*** The customer experience includes the ability to select menu items and submit them as an order. This is one of the core functional capabilities of the system and is central to the business value of the product.
- Send orders to the backend for processing.
  - ***{EXPLANATIONS}:*** The frontend sends customer requests to the backend so that the system can process and store them. This is essential because it connects the user interface to the application’s real operational logic.
- Provide confirmation of successful order placement.
  - ***{EXPLANATIONS}:*** The workflow is designed to confirm that an order has been received and is moving through the system. This is important because it gives users confidence that the transaction was successful and that the system is actively working.

Task 6.2: Support order lifecycle management

{MAIN-TASK-EXPLANATION}: The order lifecycle is supported so that orders can move through the workflow in an organized and traceable way. This is essential for keeping the overall restaurant process consistent and manageable. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Update order status as the workflow progresses.
  - ***{EXPLANATIONS}:*** The system is designed to reflect order changes as the workflow advances. This helps keep the ordering process visible and understandable for both staff and managers.
- Maintain order history and current activity.
  - ***{EXPLANATIONS}:*** The current implementation keeps the relevant order state available for tracking and review. This is important because it allows the system to serve as an operational record rather than only as a temporary transaction tool.

Deliverables:

- Customer ordering workflow
  - ***{EXPLANATIONS}:*** The customer ordering workflow includes the ability to create and submit orders from the interface and send them into the system’s processing logic. This deliverable is already ready because the flow is implemented end to end in the current application.
- Functional order lifecycle logic
  - ***{EXPLANATIONS}:*** The order lifecycle is reflected through state handling, updates, and operational visibility within the order workflow. This deliverable is already ready because the repository contains logic and interfaces that support order progression through the system.

### Phase 7: Payment and Counter Operations Development

Task 7.1: Build the payment counter interface

{MAIN-TASK-EXPLANATION}: The payment counter interface has been developed to support staff in reviewing outstanding orders and handling transactions efficiently. This view is a core part of the system’s operational workflow because it transforms the app from a customer tool into a full service platform. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Create a view for staff to see outstanding orders.
  - ***{EXPLANATIONS}:*** The payment interface provides access to the orders that are still pending completion. This is essential because payment staff need a clear and accurate view of what remains to be processed.
- Display order details clearly for payment processing.
  - ***{EXPLANATIONS}:*** The interface is arranged to show the relevant information needed for payment handling. This makes the workflow more efficient and reduces the chance of confusion during operation.

Task 7.2: Implement payment handling logic

{MAIN-TASK-EXPLANATION}: The payment handling logic has been included so that completed payments can be recorded and reflected in the system. This makes the counter workflow practical, consistent, and relevant to a real cafe environment. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Mark orders as paid after successful processing.
  - ***{EXPLANATIONS}:*** The system supports updating an order to a paid state after the transaction is completed. This is necessary to ensure that the application reflects the real operational status of each order.
- Keep the order state synchronized across the system.
  - ***{EXPLANATIONS}:*** The application logic helps ensure that the updated payment status is reflected in the shared workflow and visible to the relevant interfaces. This is important because consistency across the UI and backend improves both user experience and operational confidence.

Deliverables:

- Payment workflow interface
  - ***{EXPLANATIONS}:*** The payment counter interface is implemented to display outstanding orders and support staff in processing payments. This deliverable is already ready because the payment-focused UI and data flow are already present.
- Completed payment processing logic
  - ***{EXPLANATIONS}:*** Payment processing logic is implemented to update orders and reflect their state as completed or paid. This deliverable is already ready because the payment pathway is present and aligned with the operational workflow of the cafe system.

### Phase 8: Management Dashboard and Administrative Features

Task 8.1: Create the management dashboard

{MAIN-TASK-EXPLANATION}: The management dashboard has been built as the main administrative interface for the system. It provides a central place for overseeing the application and its daily operations in a structured and organized manner. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Build a central control panel for restaurant administrators.
  - ***{EXPLANATIONS}:*** The dashboard is designed to serve as the main center for management tasks and operational oversight. This is essential because managers need a clear environment in which they can work without being confused by the customer-facing interface.
- Provide access to operational and configuration tools.
  - ***{EXPLANATIONS}:*** The interface includes features that support administration and system configuration. This makes the dashboard more than a passive display and turns it into a real management tool.

Task 8.2: Implement employee and access management

{MAIN-TASK-EXPLANATION}: The management area includes access-related functionality so that the system can be controlled in a secure and organized way. This helps ensure that administrative actions are limited to the appropriate users. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Manage staff roles and permissions.
  - ***{EXPLANATIONS}:*** The application structure supports role-based administration so that different responsibilities can be separated appropriately. This is important because the system must be usable by multiple staff groups without exposing the wrong capabilities to the wrong users.
- Control access to sensitive actions and administrative features.
  - ***{EXPLANATIONS}:*** The system is designed to separate management actions from general public usage. This protects the business logic and reduces the risk of unauthorized or accidental misuse of administrative functions.

Task 8.3: Implement inventory and settings management

{MAIN-TASK-EXPLANATION}: The management module includes support for operational settings and configuration-related tasks. This allows the system to be adjusted based on the needs of the cafe and the operational preferences of the owner or manager. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Support menu and stock-related administration.
  - ***{EXPLANATIONS}:*** The management features are intended to cover restaurant operational settings and content updates. This ensures that business changes can be reflected in the system without needing to rebuild the application.
- Enable restaurant configuration and operational customization.
  - ***{EXPLANATIONS}:*** The system includes the ability to manage important operational preferences that affect how the restaurant uses the platform. This makes the application more flexible and more aligned with day-to-day real-world use.

Task 8.4: Implement logs and monitoring tools

{MAIN-TASK-EXPLANATION}: The system includes monitoring and logging support so that activity can be reviewed and tracked. This contributes to better oversight and easier maintenance of the platform. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Track system activity and operations.
  - ***{EXPLANATIONS}:*** The app structure supports recording relevant activity for review. This is important because it creates a clearer trail of system behavior and supports future debugging or operational analysis.
- Provide useful administrative visibility into app usage.
  - ***{EXPLANATIONS}:*** The management views are intended to provide supervisors with enough visibility to monitor how the system is being used. This is an important part of making the platform operationally professional rather than purely functional.

Deliverables:

- Manager dashboard
  - ***{EXPLANATIONS}:*** The manager dashboard is implemented as a central administration surface for managing system functions. This deliverable is already ready because the dashboard exists as a distinct management experience and is connected to administrative features.
- Administrative control features
  - ***{EXPLANATIONS}:*** Administrative features include management of settings, menu content, staff access, and operational controls. This deliverable is already ready because these functions are represented in the management modules and supported by backend endpoints.
- Operational monitoring tools
  - ***{EXPLANATIONS}:*** Monitoring and logging support are included through management views and backend activity handling. This deliverable is already ready because the system already includes a monitoring-oriented structure and administrative visibility mechanisms.

### Phase 9: Security, Reliability, and Data Protection

Task 9.1: Implement authentication and authorization

{MAIN-TASK-EXPLANATION}: Authentication and authorization have been incorporated to protect the management side of the system and restrict access to appropriate users. This is essential for keeping the application secure and suitable for practical deployment. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Secure manager and admin features.
  - ***{EXPLANATIONS}:*** The current design includes protected access for administrative functions. This is an important step because it prevents the management layer from being exposed to untrusted or unauthorized usage.
- Restrict access by role.
  - ***{EXPLANATIONS}:*** The system uses role-based control to limit sensitive actions and separate operational responsibilities. This is important because different users should not have equal access to every function in the platform.
- Protect sensitive backend routes.
  - ***{EXPLANATIONS}:*** The backend is structured to support protected service access and restricted route execution. This ensures that administrative behavior remains controlled and that the system is not open to misuse.

Task 9.2: Secure data handling

{MAIN-TASK-EXPLANATION}: The system includes measures to protect sensitive information and reduce the risk of unauthorized exposure. This is especially important for login-related, administrative, and operational data that must remain safe and controlled. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Hash sensitive credentials.
  - ***{EXPLANATIONS}:*** Secure handling practices are part of the application design, which is essential for protecting user and administrative information. This helps ensure that the system can be trusted with credentials and sensitive business information.
- Protect reset and login flows.
  - ***{EXPLANATIONS}:*** The system includes support for secure account-related actions and protected access flows. This makes the platform more dependable and reduces the chance of poor security practices being introduced during operation.
- Prevent unauthorized action execution.
  - ***{EXPLANATIONS}:*** The backend and access logic are designed to reduce the risk of misuse. This is necessary because an operational restaurant system must not only work well but also behave safely under real-world circumstances.

Task 9.3: Improve stability and resilience

{MAIN-TASK-EXPLANATION}: The application has been structured to behave consistently under normal use and to support reliable operation as the system is used in practice. This helps reduce failures and makes the system easier to maintain over time. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Add robust error handling.
  - ***{EXPLANATIONS}:*** The application has been designed with error handling in mind as part of the overall implementation. This is important because dependable systems must be able to recover gracefully from operational interruptions rather than failing silently.
- Ensure consistent system behavior under normal usage.
  - ***{EXPLANATIONS}:*** The system is intended to provide stable operation during everyday use. This matters because a cafe environment requires the platform to remain dependable even when the system is under normal stress.
- Prepare the platform for real-world operation.
  - ***{EXPLANATIONS}:*** The architecture and configuration support practical deployment and day-to-day use. This adds credibility to the platform because it moves the project beyond a purely academic or demonstration-oriented build.

Deliverables:

- Secure access controls
  - ***{EXPLANATIONS}:*** Access control is present through protected routes, role-aware logic, and management authentication mechanisms. This deliverable is mostly ready for delivery, but it should be final-validated before more formal deployment because additional hardening remains beneficial.
- Protected user and admin flows
  - ***{EXPLANATIONS}:*** User and admin workflows are separated by role and access behavior, which protects sensitive actions and operational functions. This deliverable is mostly ready for delivery and suitable for demonstration use, but final security review remains advisable.
- Stable application behavior
  - ***{EXPLANATIONS}:*** The application is structured to behave consistently during normal use and to support practical operation in the intended environment. This deliverable is already ready as an internship-level system and should be validated through final testing before handover.

### Phase 10: Advanced Features, Mobile Experience, and Real-Time Communication

Task 10.1: Add real-time communication features

{MAIN-TASK-EXPLANATION}: Real-time communication has been included so that the system can keep key interfaces updated as activity occurs. This improves responsiveness and helps the overall workflow feel connected and active. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Enable live updates between client interfaces and backend services.
  - ***{EXPLANATIONS}:*** The application supports synchronized interaction between the main user views through real-time messaging and update logic. This makes the overall experience feel more immediate and operationally connected.
- Keep customer, counter, and manager views synchronized.
  - ***{EXPLANATIONS}:*** The system is designed so that relevant updates are reflected across the main interfaces. This is especially valuable in a restaurant context because staff and managers benefit from seeing activity as it happens rather than after delays.

Task 10.2: Implement localization and accessibility support

{MAIN-TASK-EXPLANATION}: The project includes support for multiple languages and a more inclusive user experience. This makes the application more usable for a wider audience and more suitable for real-world deployment. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Provide multi-language support.
  - ***{EXPLANATIONS}:*** The frontend includes localization support for different languages. This is an important quality improvement because it makes the platform more accessible to a broader range of users and operational contexts.
- Improve the experience for a wider range of users.
  - ***{EXPLANATIONS}:*** The application structure supports a more accessible and user-friendly interface. This makes the system better aligned with modern software expectations and improves its practical value.

Task 10.3: Add PWA and usability improvements

{MAIN-TASK-EXPLANATION}: The application has been prepared with progressive web app and usability improvements so that it can feel more like a modern installed experience rather than a basic webpage. This strengthens the practical value of the system and improves the user experience. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Support installation-like web usage.
  - ***{EXPLANATIONS}:*** The project includes PWA-related setup and service worker support. This makes the system more flexible and more suitable for device-based operation in an operational environment.
- Improve offline-friendly and device-friendly experience.
  - ***{EXPLANATIONS}:*** The frontend has been prepared with capabilities that improve overall usability and resilience. This is valuable because cafes and similar environments may experience inconsistent network conditions.

Task 10.4: Integrate supporting services

{MAIN-TASK-EXPLANATION}: The project includes supporting services that extend the basic functionality of the system. These services improve communication, security, and operational flexibility while keeping the overall architecture manageable. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Connect email-based reset functionality.
  - ***{EXPLANATIONS}:*** The backend includes support for email-based reset capability. This adds a practical layer of user support and improves the professionalism of the system.
- Integrate optional printing and operational support features.
  - ***{EXPLANATIONS}:*** The system includes support for printing-related and operational integrations where relevant. This is important because practical restaurant technology is often expected to connect with physical outputs and local hardware devices.

Task 10.5: Implement AI-powered feedback and chatbot support

{MAIN-TASK-EXPLANATION}: The system has been enhanced with AI-assisted feedback analysis and a chatbot-style interface to make user feedback more actionable and easier to use. This adds a modern and intelligent layer to the project while still preserving the core restaurant functionality. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Add feedback intelligence.
  - ***{EXPLANATIONS}:*** The application includes AI-based feedback processing that summarizes and analyzes responses to improve insight quality. This moves the project beyond basic data collection and into a more intelligent operational support model.
- Create a chatbot feedback experience.
  - ***{EXPLANATIONS}:*** A dedicated feedback tab has been designed to provide conversational guidance and response summaries. This improves the user experience and gives the system a more advanced and professional feel.
- Improve feedback presentation.
  - ***{EXPLANATIONS}:*** The interface has been refined to make feedback results easier to understand and more useful for evaluation. This helps ensure that the system can provide meaningful insight rather than simply storing raw comments.

Deliverables:

- Enhanced real-time experience
  - ***{EXPLANATIONS}:*** The system includes real-time update behavior through websocket-based communication and live synchronization across major interfaces. This deliverable is already ready because the project already implements live updates between major views.
- Improved accessibility and usability
  - ***{EXPLANATIONS}:*** The frontend has been built with modern UI tools, responsive layouts, localization support, and a more inclusive interface structure. This deliverable is already ready because the user experience design is substantially implemented.
- Extended operational features
  - ***{EXPLANATIONS}:*** Additional operational features such as feedback handling, printing support, and supporting integrations are present in the project structure. This deliverable is already ready as a functional extension set, although final testing may still refine these modules.

### Phase 11: Deployment, Local Network Readiness, and Hardware Integration

Task 11.1: Prepare the application for deployment

{MAIN-TASK-EXPLANATION}: The application has been prepared for deployment in a local network environment, which is essential for a cafe-based system. The project is structured so that it can be run on a Raspberry Pi or similar device without requiring a complex external hosting setup. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Configure the app for local network operation.
  - ***{EXPLANATIONS}:*** The application is designed to run within a local environment and support practical in-store use. This is essential because the cafe deployment model depends on local accessibility rather than remote hosting.
- Ensure the system is suitable for use on lightweight hardware.
  - ***{EXPLANATIONS}:*** The project documentation and structure support simple deployment on Raspberry Pi-style hardware. This is important because the deployment model is built around affordability, simplicity, and reliability rather than heavy infrastructure.

Task 11.2: Set up production-style runtime procedures

{MAIN-TASK-EXPLANATION}: The runtime workflow has been organized so that the app can be launched and maintained in a professional and repeatable way. This includes clear setup details, startup procedures, and operational expectations for the host device. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Prepare run instructions.
  - ***{EXPLANATIONS}:*** The project includes clear instructions for starting the backend and frontend services. This is important because the system must be understandable to the person responsible for operating it after development is complete.
- Ensure environment variables and service configuration are in place.
  - ***{EXPLANATIONS}:*** The application setup includes environment-based configuration for proper runtime operation. This reduces the risk of deployment failure and makes the system more consistent across devices.
- Make the application usable in a cafe environment.
  - ***{EXPLANATIONS}:*** The deployment concept is aligned with the practical needs of the restaurant setting. This ensures that the system is not merely technically functional but also realistic within the intended operating environment.

Task 11.3: Configure the Raspberry Pi runtime environment

{MAIN-TASK-EXPLANATION}: The Raspberry Pi deployment has been handled from the ground up, including runtime environment setup, dependency installation, and local network configuration. This makes the device a practical host for the full cafe system. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Install and configure Raspberry Pi OS and required runtime services.
  - ***{EXPLANATIONS}:*** The deployment model includes the operating system, networking, and utility setup required for a stable Pi host. This is a major milestone because it turns the project into an actual device-based deployment rather than just a local development build.
- Prepare the Node.js and SQLite runtime environment on ARM.
  - ***{EXPLANATIONS}:*** The project requires dependency installation, architecture-specific module handling, and correct permission management for the Pi environment. This is essential because local deployment success depends on the hardware environment being configured correctly.
- Configure local network addressing and app endpoint settings.
  - ***{EXPLANATIONS}:*** The system must be able to reach the correct local IP-based endpoints rather than relying on localhost-only assumptions. This ensures that devices on the same network can access the application reliably.
- Set up service-style startup behavior.
  - ***{EXPLANATIONS}:*** Repeatable startup and recovery procedures have been prepared so that the runtime remains dependable after restart or disruption. This is an important operational readiness measure for a system that will be used in a real business setting.

Task 11.4: Set up thermal printer and hardware integration

{MAIN-TASK-EXPLANATION}: Thermal printer hardware setup has been completed as part of the deployment readiness work, ensuring the system can print receipts and operational outputs reliably in the target environment. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Install and configure the thermal printer.
  - ***{EXPLANATIONS}:*** The physical printer has been prepared and connected in a way that supports operation within the deployment model. This is important because practical service systems often depend on local hardware outputs for receipts and related tasks.
- Validate printing behavior and formatting.
  - ***{EXPLANATIONS}:*** The project includes testing of receipt formatting, paper width, and line wrapping so that print jobs are readable and reliable. This is necessary because poor print output would reduce the professionalism and usefulness of the system.
- Integrate print logic with the backend.
  - ***{EXPLANATIONS}:*** The print flow is connected to the local runtime so that the application can deliver print commands from the system. This completes the practical hardware path from user action to physical output.
- Confirm hardware readiness for cafe operation.
  - ***{EXPLANATIONS}:*** The printer setup is now considered part of the system’s deployment readiness model rather than a separate experiment. This contributes to the overall operational maturity of the project.

Task 11.5: Configure hotspot and QR-based access support

{MAIN-TASK-EXPLANATION}: The project includes support for a local hotspot and QR-based table access model to make the restaurant deployment easier for customers and staff. This improves usability and reduces the need for manual address entry or technical support during daily use. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Add hotspot networking support.
  - ***{EXPLANATIONS}:*** The application is designed to run with local network access through a Raspberry Pi-based deployment model. This is necessary because the system is intended to be simple and practical for direct use in a cafe setting.
- Generate QR table access flows.
  - ***{EXPLANATIONS}:*** QR codes are used to route customers to the appropriate app experience without requiring manual URL entry. This strengthens the user experience and makes the access model feel polished and business-ready.
- Verify local network usability.
  - ***{EXPLANATIONS}:*** The system has been tested with the expectation that users on the same local network can access the platform reliably. This is critical because the deployment model depends on local availability rather than a remote hosting architecture.

Deliverables:

- Deployed or deployment-ready application
  - ***{EXPLANATIONS}:*** The application is structured for local-network deployment and is suitable for running on a Raspberry Pi or similar small device. This deliverable is already ready in a local deployment context, provided the runtime environment and startup procedures are verified on the target hardware.
- Local system setup instructions
  - ***{EXPLANATIONS}:*** The project includes setup guidance covering development startup, environment variables, and deployment to a Raspberry Pi-based environment. This deliverable is already ready because the documentation is already present and practical.
- Operational readiness documentation
  - ***{EXPLANATIONS}:*** The repository contains deployment-related documentation and environment notes that support installation and operation. This deliverable is already ready because it is documented in a usable form.
- Raspberry Pi runtime environment setup
  - ***{EXPLANATIONS}:*** The project includes a realistic Pi deployment model with environment setup, dependency handling, and network configuration. This deliverable is already ready because the runtime environment is now a defined and documented part of the system.
- Thermal printer hardware integration readiness
  - ***{EXPLANATIONS}:*** The deployment includes printer setup, formatting validation, and local print integration support. This deliverable is already ready because the hardware integration work is now part of the operational implementation.
- Hotspot and QR-based local access support
  - ***{EXPLANATIONS}:*** The system is prepared for local access through QR-based routes and a network-aware deployment model. This deliverable is already ready because the access experience is built into the system’s intended usage model.

### Phase 12: Operational Resilience, Backup, Restore, and Continuity Readiness

Task 12.1: Implement backup and restore readiness

{MAIN-TASK-EXPLANATION}: The project now includes a more complete approach to operational continuity. This means the system is not only expected to run, but also to remain recoverable in the event of data loss, device restart, or local storage failure. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Establish local and cloud backup behavior.
  - ***{EXPLANATIONS}:*** The current system has been extended to create local backup archives and to synchronize the latest valid backup to a cloud storage provider. This is important because it protects the restaurant data and reduces the risk of complete loss if the local device or storage medium fails.
- Ensure backup logic is based on freshness rather than assumptions.
  - ***{EXPLANATIONS}:*** The backup service now checks whether a fresh local backup and a fresh cloud backup are present and creates or syncs the missing side when necessary. This is an important operational improvement because it prevents the system from relying on a weak or incomplete backup policy.
- Prepare restore procedures for the deployment environment.
  - ***{EXPLANATIONS}:*** The backup system is designed to support recovery through the availability of recoverable archived data and associated environment information. This makes the project more practical because it can be restored and brought back online with greater confidence rather than being dependent on a fragile manual process.

Task 12.2: Improve startup resilience and runtime continuity

{MAIN-TASK-EXPLANATION}: The system must remain dependable during restart and recovery scenarios. This is especially important for a cafe system that is expected to be available in day-to-day operations rather than being restarted manually whenever a minor issue occurs. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Ensure startup logic checks backup consistency.
  - ***{EXPLANATIONS}:*** The backend now performs a startup reconciliation step that evaluates the current state of local and cloud backups. This is a major resilience improvement because it helps ensure that the system does not silently miss the backup protection that it is meant to provide.
- Support recovery from interrupted or incomplete runtime conditions.
  - ***{EXPLANATIONS}:*** The system architecture has been strengthened so that the application can continue operating in a more controlled and predictable way even when external conditions change. This is important because a restaurant environment is often sensitive to interruptions and downtime.
- Prepare the system for long-term operational use.
  - ***{EXPLANATIONS}:*** The resilience work is now part of the core project scope rather than an afterthought. This is appropriate because any practical deployment must be able to survive not only the normal workflow but also restore and continuity events.

Deliverables:

- Operational backup and restore readiness
  - ***{EXPLANATIONS}:*** The system now includes backup creation, freshness checking, local retention, and cloud synchronization behavior. This deliverable is already ready because the backup framework is in place and designed to support operational continuity.
- Startup continuity and recovery support
  - ***{EXPLANATIONS}:*** The application includes startup logic that evaluates the backup state and takes the right action when one side is missing or outdated. This deliverable is already ready because the backup reconciliation path is now integrated into the runtime startup flow.
- Resilience documentation for handover
  - ***{EXPLANATIONS}:*** The operational backup and recovery approach should be documented clearly for the person who will eventually maintain the system. This deliverable is still best treated as a final handover task because it needs to be explained in a practical and non-technical manner for the intended audience.

### Phase 13: Testing, Refinement, and Final Delivery

Task 13.1: Perform functional testing

{MAIN-TASK-EXPLANATION}: The final stage includes validating that the main workflows work properly and that the system behaves as expected in real use. This is necessary to confirm that the project is both complete and dependable. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Verify customer ordering.
  - ***{EXPLANATIONS}:*** The main customer ordering flow should be confirmed as working end to end. This is essential because it validates the primary purpose of the system and ensures that the user experience works in practice rather than only in theory.
- Verify payment and administration workflows.
  - ***{EXPLANATIONS}:*** The payment and management flows should be validated to ensure they operate correctly. This is important because these workflows are central to the operational usefulness of the platform.
- Validate local-network and QR-based access.
  - ***{EXPLANATIONS}:*** The application should be confirmed to work reliably across the intended deployment environment, including local devices and QR-based entry paths. This is essential because the deployment model depends on these access methods being dependable.

Task 13.2: Perform integration and end-to-end validation

{MAIN-TASK-EXPLANATION}: The system should be tested as a full solution so that all modules work together smoothly. This confirms that data flows correctly between the frontend, backend, database, and supporting services. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Ensure all modules work together smoothly.
  - ***{EXPLANATIONS}:*** The completed system should be checked for consistency across interface, logic, and storage layers. This is important because a multi-layer system can appear functional in parts while still failing when the modules interact under real conditions.
- Confirm that data flows correctly across the full system.
  - ***{EXPLANATIONS}:*** The order, payment, management, and backup-related information should be verified as it moves through the application. This ensures that the full system behaves coherently and that no significant information path remains broken.
- Validate resilience and recovery behavior.
  - ***{EXPLANATIONS}:*** The system should be evaluated for its backup and startup continuity behavior so that it is not only functional but also recoverable. This is especially important for a deployment that may operate in a real business environment.

Task 13.3: Final refinement and documentation

{MAIN-TASK-EXPLANATION}: The final stage includes polishing the project and preparing it for handover. The goal is to deliver a solution that is documented, complete, stable, and ready for practical use. This task is important because it captures the current implementation context, explains why the work matters in practical operation, and provides the rationale that supports the sub-tasks that follow. It keeps the solution aligned with the real business purpose of the system, the expected user experience, and the long-term maintainability of the application.

- Improve clarity and polish where needed.
  - ***{EXPLANATIONS}:*** The system should be refined so that it is consistent, professional, and stable in presentation and behavior. This is important because the final deliverable must reflect not only functionality but also maturity and readiness.
- Prepare final documentation and usage instructions.
  - ***{EXPLANATIONS}:*** The project should include clear guidance for deployment, use, maintenance, and recovery. This matters because the person receiving the project needs to understand how to run and manage it with confidence.
- Deliver the completed project in a stable state.
  - ***{EXPLANATIONS}:*** The final output should be ready for handover with confidence in its functionality, resilience, and practical usefulness. This is the point at which the project transitions from development work into a real operational delivery.

Deliverables:

- Verified application
  - ***{EXPLANATIONS}:*** The application should be verified through end-to-end testing of ordering, payment, management, local-network usage, and backup-related behavior. This deliverable is not yet fully complete until the final validation cycle is executed, but the foundation for it is already present.
- Final documentation
  - ***{EXPLANATIONS}:*** The project already contains documentation for running the app, understanding the deployment model, and reviewing the overall system purpose. This deliverable is already ready, with the expectation that the final handover package may be refined slightly before submission.
- Handover-ready project output
  - ***{EXPLANATIONS}:*** The project is close to being handover-ready because the core application, documentation, and operational structure are present. This deliverable is mostly ready for delivery and should be finalized through a last round of validation, cleanup, and continuity review.

## 4\. Summary of Deliverables

The completed project must include:

- A complete cafe ordering system for customers
  - ***{EXPLANATIONS}:*** This deliverable is already ready because the application supports ordering through a customer-facing interface and the backend processes those requests in a coherent workflow.
- A payment counter workflow
  - ***{EXPLANATIONS}:*** This deliverable is already ready because the payment interface and payment status handling are already implemented in the current system.
- A manager dashboard for administration
  - ***{EXPLANATIONS}:*** This deliverable is already ready because the management view contains the administrative tools needed for oversight and operation.
- Secure authentication and access handling.
  - ***{EXPLANATIONS}:*** This deliverable is mostly ready for delivery and suitable for an internship-level handover, but it still benefits from final hardening and validation before any more formal deployment.
- A local-network deployment setup
  - ***{EXPLANATIONS}:*** This deliverable is already ready in a local environment because the system is designed for deployment on a Raspberry Pi or similar device within a cafe network.
- Raspberry Pi runtime environment setup
  - ***{EXPLANATIONS}:*** This deliverable is already ready because the project includes a realistic Pi deployment model with environment setup, dependency handling, and network configuration.
- Thermal printer hardware integration readiness
  - ***{EXPLANATIONS}:*** This deliverable is already ready because the deployment includes printer setup, formatting validation, and local print integration support.
- Backup, recovery, and continuity readiness
  - ***{EXPLANATIONS}:*** This deliverable is now an important part of the project because the platform includes local and cloud backup behavior, startup reconciliation logic, and a more robust operational continuity model.
- Documentation and operational guidance
  - ***{EXPLANATIONS}:*** This deliverable is already ready because the project includes both technical guidance and operational notes that support setup, use, and recovery.

## 4.1 Expanded Deliverables Inventory and Readiness Assessment

The following section expands the original deliverables listed throughout this job scope form into a more complete, professional, and implementation-based record. Each item is described in practical terms, and each is assessed for whether it is ready for delivery as part of the current project output or whether it still requires final validation before handover.

### Phase 1 Deliverables

- Project goals — The project goals are clearly defined around creating a practical cafe ordering and management platform that supports customers, payment staff, and managers through a shared local-network experience. This deliverable is ready for delivery because the project purpose is documented, aligned with the business need, and reflected in the current system structure.
- Functional requirements — The functional requirements are represented by the core journeys of menu browsing, order placement, payment handling, and administrative management. This deliverable is ready for delivery because the implemented application clearly supports these major workflows.
- Initial project scope definition — The project scope is clearly bounded around a local cafe environment with QR-based user access, order processing, payment operations, management oversight, and operational readiness. This deliverable is ready for delivery because the system remains focused and purpose-driven rather than scattered across unrelated features.

### Phase 2 Deliverables

- Project roadmap — The roadmap is established through the phased implementation structure documented in this job scope and reflected by the repository’s separation of frontend, backend, database, and deployment assets. This deliverable is ready for delivery because the development path is clear and professionally organized.
- System architecture plan — The architecture is based on a frontend-backend-local database structure with QR-driven access, local-network deployment, and a Raspberry Pi hosting model. This deliverable is ready for delivery because the repository already demonstrates a coherent application architecture and service separation.
- Functional workflow definitions — The main user journeys are defined around customer ordering, payment processing, management administration, and operational continuity. This deliverable is ready for delivery because the workflow logic is visible through the frontend views, backend routes, and supporting services.

### Phase 3 Deliverables

- Working development environment — A development environment has been established with a separate frontend and backend workspace, supporting local testing and iterative development. This deliverable is ready for delivery because the project includes a structured development setup and clearly organized source folders.
- Project folder structure — The repository contains a clear division between frontend UI, backend logic, database files, scripts, and supporting documentation. This deliverable is ready for delivery because the structure is already maintainable and understandable.
- Initial codebase foundation — The initial codebase foundation is in place with the necessary application entry points, supporting libraries, and source organization. This deliverable is ready for delivery because the project has moved beyond a bare skeleton and now contains working application modules.

### Phase 4 Deliverables

- Functional backend server — The backend server is implemented and provides request handling, route structure, controller logic, and database interaction for core operations. This deliverable is ready for delivery as a functional backend because the server is present and actively supports the application’s main workflows.
- Database schema and seed data — The database layer includes schema initialization and seed data for the main entities required by the system. This deliverable is ready for delivery because the data structure exists and can be used to initialize the application in a usable state.
- Core business logic modules — The core business logic covers order handling, payment updates, management actions, role-based operational behavior, and data persistence. This deliverable is ready for delivery because the necessary business flows are already implemented in the backend controllers and routes.

### Phase 5 Deliverables

- Functional frontend application — The frontend application is implemented as a React-based interface with structured page components, reusable UI elements, and role-based view handling. This deliverable is ready for delivery because the user interface is present, operational, and connected to the backend services.
- Customer-facing order interface — The customer-facing experience includes menu browsing, item selection, and order submission functions. This deliverable is ready for delivery because the customer interface is built and aligned with the core business objective of ordering from a cafe table.
- Role-based app entry points — Role-based entry points exist through the customer, payment counter, and management views, with QR-based navigation linking users to the appropriate workflow. This deliverable is ready for delivery because the application already presents distinct entry paths for the main user roles.

### Phase 6 Deliverables

- Customer ordering workflow — The customer ordering workflow includes the ability to create and submit orders from the interface and send them into the system’s processing logic. This deliverable is ready for delivery because the flow is implemented end to end in the current application.
- Functional order lifecycle logic — The order lifecycle is reflected through state handling, updates, and operational visibility within the order workflow. This deliverable is ready for delivery because the repository contains logic and interfaces that support order progression through the system.

### Phase 7 Deliverables

- Payment workflow interface — The payment counter interface is implemented to display outstanding orders and support staff in processing payments. This deliverable is ready for delivery because the payment-focused UI and data flow are already present.
- Completed payment processing logic — Payment processing logic is implemented to update orders and reflect their state as completed or paid. This deliverable is ready for delivery because the payment pathway is present and aligned with the operational workflow of the cafe system.

### Phase 8 Deliverables

- Manager dashboard — The manager dashboard is implemented as a central administration surface for managing system functions. This deliverable is ready for delivery because the dashboard exists as a distinct management experience and is connected to administrative features.
- Administrative control features — Administrative features include management of settings, menu content, employees, and operational controls. This deliverable is ready for delivery because these functions are represented in the management modules and supported by backend endpoints.
- Operational monitoring tools — Monitoring and logging support are included through management views and backend activity handling. This deliverable is ready for delivery because the system already includes a monitoring-oriented structure and administrative visibility mechanisms.

### Phase 9 Deliverables

- Secure access controls — Access control is present through protected routes, role-aware logic, and management authentication mechanisms. This deliverable is mostly ready for delivery, but it should be final-validated before broader deployment because the system still benefits from additional hardening and security review.
- Protected user and admin flows — User and admin workflows are separated by role and access behavior, which protects sensitive actions and operational functions. This deliverable is mostly ready for delivery and suitable for demonstration use, but final security validation is still advisable.
- Stable application behavior — The application is structured to behave consistently during normal use and to support practical operation in the intended environment. This deliverable is ready for delivery as an internship-level system and should be validated through final testing before formal handover.

### Phase 10 Deliverables

- Enhanced real-time experience — The system includes real-time update behavior through websocket-based communication and live updates across major views. This deliverable is ready for delivery because the project already implements live synchronization between major interfaces.
- Improved accessibility and usability — The frontend has been built with a modern UI framework, responsive layouts, localization support, and accessible interface components. This deliverable is ready for delivery because the user experience design is already substantially implemented.
- Extended operational features — Additional operational features such as feedback handling, printing support, and supporting integrations are present in the project structure. This deliverable is ready for delivery as a functional extension set, although the final round of testing may still refine these modules.

### Phase 11 Deliverables

- Deployed or deployment-ready application — The application is structured for local-network deployment and is suitable for running on a Raspberry Pi or similar small device. This deliverable is ready for delivery in a local deployment context, provided the runtime environment and startup procedures are verified on the target hardware.
- Local system setup instructions — The project includes setup guidance covering development startup, environment variables, and deployment to a Raspberry Pi-based environment. This deliverable is ready for delivery because the documentation is already present and practical.
- Operational readiness documentation — The repository contains deployment-related documentation and environment notes that support installation and operation. This deliverable is ready for delivery because it is already documented in a usable form.

### Phase 12 Deliverables

- Operational backup and restore readiness — The system now includes backup creation, freshness checking, local retention, and cloud synchronization behavior. This deliverable is ready for delivery because the backup framework is in place and designed to support operational continuity.
- Startup continuity and recovery support — The application includes startup logic that evaluates the backup state and takes the right action when one side is missing or outdated. This deliverable is ready for delivery because the backup reconciliation path is now integrated into the runtime startup flow.
- Resilience documentation for handover — The operational backup and recovery approach should be documented clearly for the person who will eventually maintain the system. This deliverable is mostly ready and should be finalized as part of the handover package.

### Phase 13 Deliverables

- Verified application — The application should be verified through end-to-end testing of ordering, payment, management, local-network usage, and backup-related behavior. This deliverable is not yet fully complete until the final validation cycle is executed, but the foundation for it is already present.
- Final documentation — The project already contains documentation for running the app, understanding the deployment model, and reviewing the overall system purpose. This deliverable is ready for delivery, with the expectation that the final handover package may be refined slightly before submission.
- Handover-ready project output — The project is close to being handover-ready because the core application, documentation, and operational structure are present. This deliverable is mostly ready for delivery and should be finalized through a last round of validation and cleanup.

### Overall Readiness Summary

In its current form, the BP Dragonfly Garden Cafe Ordering and Management System project is best described as a functional and well-structured delivery candidate for a local cafe deployment, with the main feature set already implemented, documented, and increasingly hardened for operational use. The project is strongly positioned for delivery as an internship-level solution, while the remaining work should focus on final validation, refinement, backup and recovery confirmation, and security hardening before a more formal production-style handover.

## 5\. Final Acceptance Criteria

The project will be considered complete when:

- All major functional workflows operate correctly.
- The application is stable, responsive, and reliable.
- The system can be used by customers, staff, and managers without operational issues.
- The system is deployable in a local-network environment and works reliably on the intended hardware platform.
- The project includes proper backup, recovery, and continuity readiness.
- The project is documented and ready for handover.
- The implementation reflects the full intended scope of the internship project.

## 6\. Closing Statement

This job scope form now reflects the current state of the BP Dragonfly Garden Cafe Ordering and Management System as a mature, implementation-ready restaurant operations platform rather than a purely initial-stage development outline. It captures the work completed from the earliest concept stage to the present level of functionality and also identifies the remaining tasks that must be completed to reach full handover readiness. The document is therefore structured not only as a record of progress but also as a professional blueprint for final completion, validation, and delivery.

This job scope form defines the required professional development path from project inception to final completion of the BP Dragonfly Garden Cafe Ordering and Management System. It captures the step-by-step work that must be completed by the developer to deliver the application as a complete, stable, and fully operational solution.
