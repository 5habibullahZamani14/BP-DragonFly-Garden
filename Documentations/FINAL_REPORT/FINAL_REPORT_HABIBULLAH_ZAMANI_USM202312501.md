At Innovatree Technologies Sdn. Bhd., George Town, Pulau Pinang

From 17 March 2026 to 31 August 2026

By

Habibullah Zamani

Student ID: USM202312501 -- 0208851

School of Computer Science\
Universiti Sains Malaysia\
Pulau Pinang

2025/2026

**Abstract**

Industrial training is an important component of the Bachelor of
Computer Science (Honours) programme because it connects theory with
real software engineering practice. This report documents my internship
at Innovatree Technologies Sdn. Bhd., George Town, Pulau Pinang, from 17
March 2026 to 31 August 2026 -- still one week is remaining to conclude
the internship at the time of submitting this report. The company is
small, informal, and entrepreneur-led, and this had a major impact on
the nature of my role.

I did not work in a conventional large IT team with a formal structure
of departments or a dedicated technical mentoring system. Instead, I was
given direct responsibility for a real project for BP Dragonfly Garden,
one of the company's ventures. I was effectively the main developer and
technical decision-maker for the entire system, from requirement
understanding to implementation and final refinement.

The project involved creating a local ordering and management system for
a restaurant environment. The solution included customer ordering,
payment processing, payment counter operations, management dashboards,
local network deployment, QR-based access flow, and hardware support for
a thermal printer. The system was designed to operate locally on a
Raspberry Pi 5 and through a local hotspot environment, which was
appropriate for a small-scale business with limited budget and no need
for a large cloud infrastructure.

This internship gave me practical experience in full-stack development,
requirement analysis, architecture planning, debugging, testing,
deployment, local infrastructure configuration, and continuous
improvement under realistic business constraints. It also taught me how
to work independently, manage uncertainty, learn unfamiliar
technologies, and adjust the project as business expectations changed.

This report therefore reflects not only my software engineering work,
but also my personal and professional growth during the internship. It
highlights the importance of initiative, resilience, problem-solving,
and responsibility when working in a small but genuine business setting.

**Declaration**

I, Habibullah Zamani, hereby declare that this industrial training
report is prepared by me and submitted to fulfil the requirement of
CAT302W -- Industrial Training under the Bachelor of Computer Science
(Honours), majoring in Software Engineering, at the School of Computer
Science, Universiti Sains Malaysia.

This report is based on the industrial training experience undertaken at
Innovatree Technologies Sdn. Bhd., George Town, Pulau Pinang, from 17
March 2026 to 31 August 2026. I confirm that the information contained
in this report is accurate to the best of my knowledge and reflects my
own experience, observations, and learning during the training period.

I also acknowledge that this report belongs to Universiti Sains Malaysia
and may not be reproduced without permission from the university and the
host organization. I accept responsibility for the preparation,
accuracy, and originality of the content in this report.

![](media/image1.png){width="1.775955818022747in"
height="0.9722222222222222in"}

**Acknowledgement**

First and foremost, I would like to express my gratitude to Allah S.W.T.
for giving me the strength, patience, and perseverance to complete this
internship journey. The process was demanding, because I was required to
learn, design, implement, and refine an entire system with very limited
formal guidance and in a business environment that was both flexible and
unpredictable.

I would also like to thank Universiti Sains Malaysia, especially the
School of Computer Science, for giving me the opportunity to undergo
industrial training and apply my academic knowledge in a real
environment. This internship helped me understand the practical
realities of software engineering beyond classroom learning.

I am deeply grateful to Dr. Tan Leong Ping (Robin), the Managing
Director of Innovatree Technologies Sdn. Bhd., for accepting me into the
company and trusting me with a meaningful project. In this internship, I
was not just a passive learner; I was given the opportunity to take
ownership of the software and make important technical decisions. His
trust and flexibility gave me a chance to learn in a realistic and
highly practical context.

I would also like to thank Mr. Danny Chen Sien Yau for his role in
coordinating the internship from the university side, and Prof. Dr. J.
Joshua Thomas for acting as the university supervisor for my case. Their
support helped ensure that my internship remained academically relevant
and professionally meaningful.

I also want to thank my family and friends for their continuous support,
encouragement, and patience throughout the training period. This
internship required long hours, independent thinking, and heavy
responsibility, and their support helped me remain motivated during
difficult moments.

Finally, I would like to acknowledge the importance of online learning
resources, technical forums, project documentation, and practical
experimentation. Because the company was small and there were no formal
internal training sessions for software work, self-learning and
independent problem-solving became essential to the project's success.

# Table of Contents {#table-of-contents-1 .TOC-Heading}

[Chapter 1: INTRODUCTION
[7](#chapter-1-introduction)](#chapter-1-introduction)

[1.1 Industrial Training Programme
[7](#industrial-training-programme)](#industrial-training-programme)

[1.2 Training Scope [8](#training-scope)](#training-scope)

[Chapter 2: ORGANIZATION
[10](#chapter-2-organization)](#chapter-2-organization)

[2.1 Organization Background
[10](#organization-background)](#organization-background)

[2.2 Organization Functions, Business Objectives and Goals
[10](#organization-functions-business-objectives-and-goals)](#organization-functions-business-objectives-and-goals)

[2.3 Organization Structure
[11](#organization-structure)](#organization-structure)

[2.4 Success Criteria [11](#success-criteria)](#success-criteria)

[2.5 Training Department
[12](#training-department)](#training-department)

[2.6 Training Team [12](#training-team)](#training-team)

[Chapter 3: PROJECT EXPERIENCE AND WORK PRACTICE
[13](#chapter-3-project-experience-and-work-practice)](#chapter-3-project-experience-and-work-practice)

[3.1 Overview of Assigned Task and Project
[13](#overview-of-assigned-task-and-project)](#overview-of-assigned-task-and-project)

[3.2 Objective of the Project
[13](#objective-of-the-project)](#objective-of-the-project)

[3.3 Methodology and Process
[14](#methodology-and-process)](#methodology-and-process)

[3.4 Design and Implementation Work
[14](#design-and-implementation-work)](#design-and-implementation-work)

[3.5 Tools, Technologies and Software Used
[16](#tools-technologies-and-software-used)](#tools-technologies-and-software-used)

[3.6 Challenges and Problem-Solving
[17](#challenges-and-problem-solving)](#challenges-and-problem-solving)

[3.7 Outcome and Analysis
[18](#outcome-and-analysis)](#outcome-and-analysis)

[Chapter 4: TECHNICAL AND PERSONAL DEVELOPMENT
[19](#chapter-4-technical-and-personal-development)](#chapter-4-technical-and-personal-development)

[4.1 Skills Acquired [19](#skills-acquired)](#skills-acquired)

[4.2 Teamwork and Communication
[20](#teamwork-and-communication)](#teamwork-and-communication)

[4.3 Professional Ethics and Workplace Culture
[20](#professional-ethics-and-workplace-culture)](#professional-ethics-and-workplace-culture)

[4.4 Contribution to the Organization
[20](#contribution-to-the-organization)](#contribution-to-the-organization)

[Chapter 5: SUGGESTIONS
[21](#chapter-5-suggestions)](#chapter-5-suggestions)

[5.1 Suggestions for the Organization
[21](#suggestions-for-the-organization)](#suggestions-for-the-organization)

[5.2 Suggestions for the Industrial Training Programme
[21](#suggestions-for-the-industrial-training-programme)](#suggestions-for-the-industrial-training-programme)

[Chapter 6: CONCLUSION
[22](#chapter-6-conclusion)](#chapter-6-conclusion)

[BIBLIOGRAPHY [22](#bibliography)](#bibliography)

[APPENDICES [23](#appendices)](#appendices)

[Appendix A: Project Summary
[23](#appendix-a-project-summary)](#appendix-a-project-summary)

[Appendix B: Tools and Technologies Used
[23](#appendix-b-tools-and-technologies-used)](#appendix-b-tools-and-technologies-used)

[Hardware [23](#hardware)](#hardware)

[Software and Tools [24](#software-and-tools)](#software-and-tools)

[Appendix C: Main Internship Activities
[24](#appendix-c-main-internship-activities)](#appendix-c-main-internship-activities)

[Appendix D: Major Learning Outcomes
[24](#appendix-d-major-learning-outcomes)](#appendix-d-major-learning-outcomes)

[Appendix D: Summary of Technical Problem-Solving Experience
[25](#appendix-d-summary-of-technical-problem-solving-experience)](#appendix-d-summary-of-technical-problem-solving-experience)

[Appendix E: Major Milestones in the Project Timeline
[25](#appendix-e-major-milestones-in-the-project-timeline)](#appendix-e-major-milestones-in-the-project-timeline)

[Other Related Matters
[27](#other-related-matters)](#other-related-matters)

[Final Note [27](#final-note)](#final-note)

# Chapter 1: INTRODUCTION

## 1.1 Industrial Training Programme

The industrial training programme is a compulsory component of the
Bachelor of Computer Science (Honours) curriculum at Universiti Sains
Malaysia. It is designed to allow students to apply theories learned in
class to real-world organizational practice and to develop professional
exposure in the information technology industry. This internship was a
practical opportunity to experience the realities of software work:
project ownership, technical decision-making, teamwork, communication,
technical troubleshooting, and workplace accountability.

My training period started on 17 March 2026 and it will end on 31 August
2026. I was placed at Innovatree Technologies Sdn. Bhd., a Penang-based
company with entrepreneurial interests in technology and hospitality.
The headquarters are located at 1236-1-2&3 Wisma Indah, Jalan Paya
Terubong, 11060 Air Itam, Penang. Although the company is small, the
internship experience was meaningful because the work was directly tied
to a real business environment and a genuine operational challenge.

In my placement, I was not simply observing procedures. I was working on
an actual software project for BP Dragonfly Garden; a business venture
owned within the broader Innovatree ecosystem. My role encompassed the
full process of understanding the business issue, designing a local
digital system, implementing the application, debugging problems,
testing the workflow, and refining the system for practical deployment.

The internship made me understand that software engineering is not
limited to writing code in a comfortable, classroom-based environment.
It requires initiative, problem-solving, communication, and
responsibility under conditions that are often uncertain, limited, and
changing. This experience gave me a clearer understanding of how
software supports real businesses and how user requirements can shift
while a project is still in progress.

## 1.2 Training Scope

The scope of my internship was broad because I was effectively the main
software developer for the entire project. I was responsible for
requirements elicitation, planning, system design, frontend development,
backend development, database setup, debugging, testing, deployment
preparation, and final refinement. In a small company, there was no
formal software team to divide these tasks among multiple people, so I
had to carry out the work independently while keeping the project
direction aligned with business needs.

The primary project was a restaurant ordering and management system for
BP Dragonfly Garden. The system was intended to improve operational
efficiency by enabling customers to browse the menu, place orders, and
pay more smoothly while helping staff and managers manage the service
workflow more effectively. The application also needed to support
payment counter operations, order processing, dashboard-based
management, and local data handling in a realistic environment.

The project was developed in a local-network architecture rather than a
cloud-first architecture. The system was designed to run either on a
laptop or on a Raspberry Pi 5, and it used a local hotspot environment.
This approach was chosen because the business needed a practical and
low-cost solution that could function in a cafe setting without
depending on large hosting costs or complex external infrastructure.

The system architecture consisted of a React and TypeScript front-end, a
Node.js and Express backend, and a SQLite database. This stack was
selected because it was lightweight, suitable for local deployment, and
manageable for a small-scale business system. The customer interface was
built for public table QR access so customers could reach the menu and
ordering interface through their own devices. The management interface
provided operational visibility, settings management, and data oversight
after secure authenticated login. The payment counter view supported
transaction processing and status updates for staff users with valid JWT
sessions. These components reflected the actual business workflow
required by the restaurant.

[\[GRAPHIC PLACEHOLDER: Insert a system architecture diagram here
showing the React frontend, Express backend, SQLite database, Raspberry
Pi local host, customer table QR ordering flow, secure staff and manager
login with JWT sessions, thermal printer, and local Wi‑Fi environment.\]]{.mark}

In reality, the project was broader than a basic ordering app. It
included ordering page for customers that could be accessed by scanning
a QR code; employee verification for cashier login; order processing
with split-payment support; live status updates; local stock monitoring;
menu and inventory management; dashboard accounting for finance and
logs; and customer feedback handling with AI-assisted support features.
This made the system closer to a small-scale restaurant management
platform than a simple prototype.

The project evolved over time as the supervisor's expectations changed,
and this required repeated adaptation. At one stage, the focus was on a
customer and staff workflow; later, management and payment views became
more important. The system also had to be revised to support thermal
printer functionality, full offline local operation, Raspberry Pi
deployment, and practical reliability requirements. This made the
project a genuine example of how software development in a real business
environment often changes with new requirements, real constraints, and
practical feedback.

The final system therefore represented a realistic implementation of
software engineering under a resource-constrained, fast-moving, and
flexible business setting. It was not only a technical attempt to build
a project, but an exercise in business awareness, practical
decision-making, and delivering value in a functional environment. More
importantly, the chosen solution was the most suitable one for the
actual context: a local QR-based architecture hosted on a Raspberry Pi
was more practical and sustainable than a cloud-first system because it
reduced cost, matched the restaurant's operational reality, supported
local service continuity, and addressed the business requirement for
affordable, reliable daily operation.

[\[GRAPHIC PLACEHOLDER: Insert a process flowchart showing the
end-to-end journey from customer QR access to menu browsing, ordering,
payment, staff action, and management monitoring.\]]{.mark}

# Chapter 2: ORGANIZATION

## 2.1 Organization Background

Innovatree Technologies Sdn. Bhd. is a Penang-based company associated
with entrepreneurial ventures in technology, innovation, and
hospitality. It is not a large corporate technology firm, but a small
and relatively flexible business that operates in a practical and
founder-driven environment. The company is led by Dr. Tan Leong Ping
(Robin), who served as the Managing Director and the main person in
charge of the internship arrangement. The business is known to be
connected with ventures such as BP Dragonfly Garden, a local cafe and
garden destination in Balik Pulau that reflects the company's interest
in hospitality and customer experience.

The company's public profile is relatively modest, and it is not
structured like a large software company with formal departments for
development, QA, support, or infrastructure. Instead, it operates in a
more compact and entrepreneurial style. This meant that the internship
was not organized around a highly formal company department structure,
but around a practical business need and a direct project requirement.

In this sense, the company environment was informal but meaningful. It
allowed me to understand how software work can be carried out in a small
company setting where speed, flexibility, and responsibility matter a
great deal. The internship therefore became a realistic introduction to
how technology supports business operations outside a large corporate
environment.

## 2.2 Organization Functions, Business Objectives and Goals

Innovatree Technologies Sdn. Bhd. functions as an entrepreneurial
technology-driven company with interest across different ventures,
including hospitality and lifestyle-focused businesses. Although
detailed corporate records were limited, the company clearly aims to
support business innovation, customer experience, and sustainable
operations. The business model appears to include both operational
ventures and technology-linked initiatives applied to real-world
enterprise needs.

The main business objective connected to my internship was BP Dragonfly
Garden, which required a more organized and efficient operational
system. The company wanted to improve service quality, streamline order
processes using technology, support better management visibility, and
create a more efficient environment for handling restaurant operations.

In practical terms, the organization's goals were not only technical;
they were also operational and commercial. The company wanted to
increase efficiency, reduce friction in customer service, make business
workflows easier to manage, and support growth in a cost-sensitive
environment. My project was aligned with these goals because it aimed to
create a system that could improve service flow, make order handling
easier, and allow managers to monitor restaurant operations more
clearly.

## 2.3 Organization Structure

The organization structure was informal and compact. There was no clear
large-scale department structure such as a separate software division,
QA team, or IT operations unit. The company was essentially a small
organization with direct leadership and lean operations. In practice, I
was effectively the development team for the internship project, from
the early research stage until final refinement.

This had a major effect on my training experience. I had to work
independently, make technical decisions on my own, and ensure that the
project remained relevant to business goals. It also meant that
communication with the company-side supervisor was direct and practical.
The company was not heavily bureaucratic, and feedback was often given
in informal meetings and conversation rather than through a formal
project management process.

This kind of structure encouraged initiative, but it also came with
difficulties. Since there was no dedicated technical team or formal
internal training system, I had to learn everything practically, create
my own workflow, and solve most issues without formal mentorship or a
set of internal standard procedures.

## 2.4 Success Criteria

The company's success criteria were practical and business-oriented
rather than purely technical. Success was judged by whether the business
could operate more efficiently, serve customers better, organize daily
tasks more clearly, and keep operations manageable within a limited
budget. In a small business environment, even small improvements in
process efficiency can create meaningful value.

For my internship project, success was not measured only by whether the
code worked technically. It was also measured by whether the system
solved a real operational problem and could be realistically used in the
business setting. The system had to be affordable, locally deployable,
user-friendly, manageable, and reliable enough for daily use.

This requirement made the work more realistic and more valuable. The
project had to support practical business operations, not just build a
demonstration that looked impressive in a presentation. Because of this,
the project balanced technical capability with business logic and
operational sense.

## 2.5 Training Department

The "training department" in this case was essentially the project
itself. There was no formal internal department dedicated to student
training or software work. Instead, the internship was embedded directly
into the company's business environment, and I was expected to handle
the project with a high level of responsibility.

My work included research, system analysis, requirement gathering, UX
and architecture design, coding, testing, debugging, deployment
preparation, security and performance improvements, and documentation.
These tasks were not isolated but formed a single continuous engineering
cycle. This reflected a realistic software lifecycle in which the
project evolves through feedback, redesign, testing, and improvement.

This structure gave me a deeper understanding of how software is shaped
in real business situations. It also made me understand that the value
of a project comes not only from technical features, but from managing
uncertainty, learning quickly, and making sound technical decisions
under realistic constraints.

## 2.6 Training Team

In practice, the training team was extremely small. I was effectively
the whole development team for this internship project. I handled the
work of frontend design, backend logic, database design, debugging,
testing, integration, deployment planning, and final refinement. I was
also responsible for understanding the business expectations and
translating them into a workable technical solution.

As a result, I had to manage a wide range of responsibilities that would
normally be split among several roles in a larger company. This
experience strongly developed my independence. It also made me realize
that software engineering is not only about coding; it also involves
initiative, decision-making, communication, and a willingness to keep
learning until the problem is solved.

# Chapter 3: PROJECT EXPERIENCE AND WORK PRACTICE

## 3.1 Overview of Assigned Task and Project

The main task assigned to me during the internship was to design and
develop a digital ordering and management system for BP Dragonfly
Garden. The project had to support the restaurant's operational
processes and improve the way customers, staff, and managers interacted
with the business.

The application had to support: customer ordering through a table-based
QR access flow for public dining access, authenticated staff orders and
payment processing, order tracking, manager dashboard operations after
secure login, and local deployment in a small business environment. The
project was therefore not limited to frontend or backend work; it
required end-to-end development and operational thinking.

The project was meaningful because it connected directly with the real
needs of the business. This was not a hypothetical classroom assignment.
The system had to work in a real environment where user expectations
were practical, business decisions could change quickly, and usability
mattered as much as technical correctness.

## 3.2 Objective of the Project

The core objective of the project was to create an ordering and
management system that could help the restaurant operate more
efficiently and systematically. The business needed a solution that
would reduce the friction of manual and disorganized ordering methods
and give staff and managers better visibility over operations.

At the same time, the project also had an educational purpose: it served
as a practical platform for me to develop software engineering skill in
a realistic environment. The project allowed me to experience the
complete software lifecycle, from understanding the business issue to
implementing the solution, validating it, refining it, and preparing it
for a business deployment model.

The system was expected to improve service speed, organization, and
information visibility. It was also intended to give the business a
modern digital tool that could support daily operations without
requiring a large infrastructure cost or a complex external hosting
environment.

## 3.3 Methodology and Process

Because there was no formal internal software methodology or dedicated
development team, I adopted a self-directed iterative process. I began
by understanding the business context and converting manager
expectations into a practical feature list. Then I researched suitable
technologies and designed a lightweight architecture that fit the
project's goals.

The workflow followed a repeated cycle of design, implementation,
testing, debugging, and refinement. This was necessary because the
system requirements were changing during the project period. Dr. Robin
frequently revised the expected features, required interface additions,
and changed the preferred deployment direction. The project therefore
had to remain flexible and adaptive.

This iterative process was one of the most important learning outcomes
of the internship. I learned that real projects are rarely stable from
the beginning. Requirements often shift, features change, and design
decisions must be revisited. The ability to adapt without losing the
original objective is an essential part of software engineering.

I also learned the value of testing and real observation. I did not rely
on assumptions about whether a component worked. Instead, I tested the
code in actual runtime conditions, reviewed backend behavior, and fixed
issues based on what the system actually did. This allowed me to improve
the application in a disciplined and practical manner.

## 3.4 Design and Implementation Work

The system design was based on the real needs of a cafe operation.
Customers needed a fast and easy way to browse menu items and place
orders from their own devices. Staff needed a clear and practical order
queue and payment process. Managers needed a dashboard for operational
oversight and system configuration.

I designed the application around a simple but effective architecture: a
React and TypeScript frontend for the user interfaces, an Express-based
backend for business logic and API routing, and a SQLite database for
local persistence. This architecture was chosen because it was
efficient, affordable, and realistic for a local business deployment.

The implementation work included menu browsing, cart operations, order
status updates, payment processing, live UI updates, role-based access,
management interfaces, local deployment setup, and backend
configuration. I also worked on local access support, QR-based ordering
flow, backup and restore logic, printer operations, and reliability
features.

A key part of the project was the secure access model. Customer users
entered through table QR codes for public ordering access, while staff and
managers were required to authenticate with their credentials and receive
server-issued JWT sessions before accessing protected dashboards of their
respective roles. This role-based system was important because it allowed
the application to separate customer, cashier, and administrative
functions while still running on a single local platform. I also
implemented employee-based payment counter login, shift verification,
operating-hours checks, and session-lock behavior so that the system
would not allow improper access or misuse.

As the project matured, several additional features became necessary.
These included split payment handling, management authentication,
session locking, local backup and restore support, AI-assisted feedback
analysis, localization support, and thermal printer integration. The
project also incorporated employee management, inventory tracking,
finance dashboards, order logs, settings management, and customer
feedback channels, all of which were directly relevant to the
restaurant's operational requirements. These additions were not
arbitrary; they were connected to the actual operational requirements of
the restaurant business and were necessary to make the system more
capable and realistic.

The implementation also had to account for hardware constraints. A
Raspberry Pi 5 was introduced as the local production host, and a
thermal printer was integrated to support the service workflow and
receipt printing process. This reflects the fact that the project was
not purely software-based; it was a combination of software and
practical business infrastructure. The system was also designed to work
without external internet access once the local network was active,
which was a major consideration for a cafe environment that depended on
local service continuity. In practical terms, the design had to handle
table QR customer access, authenticated staff and manager login through
username/password and JWT sessions, live order updates across devices,
and operational checks such as business hours, payment processing, and
inventory alerts without relying on a hosted cloud service.

[\[GRAPHIC PLACEHOLDER: Insert a project timeline or milestone chart
here showing the major phases of requirement study, design, development,
testing, deployment, recovery, and final refinement.\]]{.mark}

## 3.5 Tools, Technologies and Software Used

The project required a mix of software tools, hardware components, and
communication channels. The main development tool was Visual Studio
Code, which I used for coding, editing, refactoring, and project
organization. Git and GitHub were used for version control, progress
tracking, and maintaining code history. This was especially important
because the project evolved over time and required frequent updates.

The main software stack included Node.js, Express.js, React, Vite,
TypeScript, and SQLite. These technologies were selected because they
were suitable for a lightweight local deployment model and did not
require a large infrastructure investment. I also used Postman for API
validation and browser developer tools to debug frontend issues.

For hardware support, the project involved a Raspberry Pi 5, a thermal
printer, networking equipment, and standard local laptop and PC
environments. The system was designed to work locally rather than
through a cloud-only deployment model. I also used Windows for the
PC-hosted environment and Linux for the Raspberry Pi setup.

The communication tools used during the internship included WhatsApp for
requirement clarification and project discussions. Since the company was
small and informal, direct communication was often more effective than
formal documentation. This meant that practical communication skills
were essential to the project's progress.

## 3.6 Challenges and Problem-Solving

The internship was full of practical challenges. The first major
challenge was the lack of formal support and a structured technical
training environment. I had to learn many technologies independently,
and there was no internal team that could teach me step by step. This
forced me to rely heavily on research, self-learning, documentation
review, and experimentation.

The second major challenge was the low budget and limited resources. The
company did not provide a substantial software or infrastructure budget,
and there were very few formal tools available to support the project. I
had to rely on free or lightweight alternatives and make the most of the
local hardware available. This required strong resourcefulness and
careful technical planning.

Another challenge was the changing nature of the requirements. The
supervisor often revised the project direction, adding new views,
changing the expected user flow, and reconsidering the appropriate
hardware and deployment model. This meant that parts of the system had
to be redesigned or rewritten several times. I learned that software
projects in a real business setting are rarely static and that
flexibility is an essential skill.

The most technical problem was the local QR and network access
requirement. The business wanted customers to be able to access the
ordering page quickly and conveniently through a QR code, while the
system itself operated locally. This required careful thought because a
fully local server cannot behave exactly like a cloud application,
especially when customer devices need to connect to the local network
first. I explored different network strategies, evaluated hotspot and
captive portal possibilities, and learned that local deployment
introduces real constraints that cannot be ignored.

Another major technical challenge was protecting the correct user roles
and preventing unauthorised access between the customer, payment, and
manager interfaces. This included implementing session locking and
verification checks to reduce misuse and maintain system integrity.

The Raspberry Pi deployment also created serious challenges. The
supplied microSD card failed to boot, and upon investigation it was
found that the storage was corrupted. This required a full recovery
process, including wiping partitions, reformatting, reinstalling the
latest Raspberry Pi OS, and reconfiguring the environment so it could
run again correctly. This was a major lesson in the importance of
reliability, backup awareness, and operational recovery planning.

I also faced difficulties with debugging, performance, security, and
release stability. Some issues took days to resolve, especially when a
bug appeared only under particular conditions or when a feature
interacted badly with the broader system. I had to troubleshoot these
problems systematically, validate each fix through actual use, and avoid
relying on assumptions. This process improved my debugging capability
substantially.

## 3.7 Outcome and Analysis

The final outcome of the project was a working full-stack local
restaurant system that could support ordering, payment processing,
table-based order access, staff workflow, management oversight, and
deployment on small hardware. Although the company was small and the
technical environment was limited, the system showed that practical
software engineering can still produce valuable results when the
solution is designed around real business needs.

The project did not just produce code; it produced a working
business-oriented system. It supported operational workflow, gave better
visibility to management, supported staff processes, and was designed
around the realities of a local restaurant environment. In many ways,
this made the internship more meaningful than a purely academic project,
because it required practical judgement and operational thinking. This
outcome also demonstrates that the project decisions were guided by the
most appropriate solution for the real context: a lightweight, local,
role-based system that matched the restaurant's budget, hardware, and
operational demands better than a more complicated cloud-first or
enterprise-style architecture.

[\[GRAPHIC PLACEHOLDER: Insert a comparison chart or summary table here
showing the key project decisions and why the local QR-based
architecture was the most suitable choice for a small restaurant
environment.\]]{.mark}

I also learned that technical challenge is not always about writing code
alone. It is often about understanding the problem clearly, finding a
workable solution under constraints, staying calm under uncertainty, and
being willing to refine the system repeatedly until it is useful. This
understanding shaped my growth as a future software engineer.

# Chapter 4: TECHNICAL AND PERSONAL DEVELOPMENT

## 4.1 Skills Acquired

This internship significantly improved my technical and professional
capabilities. I developed stronger skills in full-stack development,
especially in designing interfaces, working with backend APIs, handling
local database logic, and ensuring that the front-end and back-end
worked together as one functional system.

I also strengthened my understanding of system architecture, practical
debugging, deployment preparation, and project management in a real
environment. In addition to frontend and backend work, I gained
practical experience in local network configurations, Raspberry Pi
setup, thermal printer integration, backup and restore planning,
security hardening, and release validation. The project also required me
to understand restaurant operations more broadly, including employee
verification, work-hours enforcement, low-stock inventory monitoring,
finance tracking, staff assistance workflows, and customer feedback
collection.

A major gain from this internship was independent learning. Because the
company did not provide formal in-house technical training, I had to
learn many tools and concepts by reading documentation, exploring online
resources, testing solutions, troubleshooting failures, and applying
what I learned in the actual project. This made me more confident and
more capable as a self-directed learner.

## 4.2 Teamwork and Communication

Although the project was technically developed by me, communication was
still crucial. I had to clarify requirements, discuss development
priorities, and explain technical constraints to the company-side
supervisor.

This improved my communication skill. I became better at understanding
the actual meaning behind a request, asking the right questions, and
explaining technical solutions in a way that non-technical stakeholders
could understand. This is essential in software engineering, because
real projects often depend on the ability to translate technical work
into business value.

## 4.3 Professional Ethics and Workplace Culture

The company environment was casual and flexible, but it still required
professionalism. I learned that workplace professionalism is not just
about formal rules; it is about responsibility, discipline, good
judgement, communication, and quality of work. Even in a small
organization, a person is expected to be reliable and committed to
producing good results.

Because I was the sole developer on the main project, I had to be
accountable for my work. This strengthened my sense of discipline and
reinforced the importance of reliability, honesty, and careful reasoning
in software work.

I also learned that progress in real professional work is often not
smooth. Deadlines, requirement changes, and technical issues are common,
and the ability to remain calm, solve problems, and continue improving
is essential.

## 4.4 Contribution to the Organization

My contribution to the organization was significant, even though the
company was small and informal. I helped build a digital system that
could support the restaurant business and improve the organization of
operations. The project included ordering flow, management modules,
payment handling, and operational support systems designed around the
business context.

This contribution made the internship meaningful because it showed that
even a trainee can add real value when given responsibility and a clear
opportunity. Although I did not work in a large software structure, I
still contributed to a real business solution and gained a practical
understanding of how software supports daily operations in a small
enterprise context.

# Chapter 5: SUGGESTIONS

## 5.1 Suggestions for the Organization

The company would benefit from a more structured internship and project
framework, even in a small setting. A clearer onboarding process, a more
defined project plan, and a more formal documentation approach would
make future internship projects easier to manage and easier to maintain.
This is especially important for a business environment where no
internal software team exists.

The company could also benefit from better support for technical
resources, such as proper tooling, clearer internal documentation, and
more structured budget allocation for project needs. This would make the
learning experience more effective and would also improve the
sustainability of the software after the intern leaves.

Another valuable improvement would be to align business expectations
more clearly with technical feasibility. In some cases, the project
requirements changed several times, which created workload pressure and
extra rework. Better planning and requirement review would improve
project efficiency and reduce confusion.

## 5.2 Suggestions for the Industrial Training Programme

[The industrial training programme would benefit from stronger
preparation before students begin the internship. Students need clearer
guidance on what to expect, how to communicate with supervisors, and
what learning outcomes are expected.]{.mark} This would help students
adapt to company environments more quickly and avoid confusion during
the early stage of placement.

The university should also encourage better communication between
students, companies, and academic supervisors. This is especially
important in situations where the company is small and the intern is
expected to be highly independent. A more structured feedback mechanism
would help maintain academic quality without reducing the value of
real-world experience.

It would also be helpful if companies were required to provide a clearer
project brief and a more practical training blueprint for interns. This
would make the internship more meaningful and would reduce the risk of
students being placed into an environment with no clear technical
guidance or development structure.

# Chapter 6: CONCLUSION

Overall, the industrial training experience at Innovatree Technologies
Sdn. Bhd. was a valuable and meaningful learning journey. Although the
company was small and the environment was informal, the internship gave
me the opportunity to work on a genuine software project in a real
business context. The project was not just a classroom exercise; it
required actual planning, implementation, debugging, deployment
preparation, and system refinement.

I was responsible for a large part of the project from start to finish,
which gave me practical experience in project ownership and technical
independence. This helped me become more confident in my problem-solving
ability and more aware of the realities of software engineering in a
real business environment.

The internship also taught me that software work involves more than
coding. It includes understanding business needs, adapting to change,
learning from failures, managing uncertainty, and making decisions with
responsibility. These lessons are valuable and will continue to guide my
future career in software engineering.

In conclusion, the internship fulfilled its purpose in a meaningful way.
It improved my technical confidence, developed my professional maturity,
and strengthened my understanding of how software systems can support
real operational needs in a small business environment. I am grateful
for the opportunity and confident that the experience will contribute
positively to my future professional development.

# BIBLIOGRAPHY

1.  Universiti Sains Malaysia. (2025). Bachelor of Computer Science
    (Honours) Programme Handbook. Universiti Sains Malaysia, Pulau
    Pinang.

2.  Sommerville, I. (2016). Software Engineering (10th Edition). Pearson
    Education Limited.

3.  Pressman, R. S. (2014). Software Engineering: A Practitioner's
    Approach (8th Edition). McGraw-Hill Education.

4.  Schwalbe, K. (2020). Information Technology Project Management (9th
    Edition). Cengage Learning.

5.  Dennis, A., Wixom, B., & Tegarden, D. (2015). Systems Analysis and
    Design: An Object-Oriented Approach with UML (5th Edition). Wiley.

6.  Laudon, K. C., & Laudon, J. P. (2021). Management Information
    Systems: Managing the Digital Firm (16th Edition). Pearson.

7.  Turban, E., Leidner, D., McLean, E., & Wetherbe, J. (2015).
    Information Technology for Management: Transforming Organizations in
    the Digital Economy (8th Edition). Wiley.

# APPENDICES

## Appendix A: Project Summary

The main project completed during this internship was a local restaurant
ordering and management system for BP Dragonfly Garden. The system
included menu browsing, order placement, payment counter support,
management dashboard features, local database handling, and
infrastructure support for deployment on a Raspberry Pi environment.

The solution was designed to help the business operate in a more
organized and efficient way while keeping the system affordable and
practical for a small cafe environment. The project gave me direct
experience in how software can support real operations in a local
business setting.

## Appendix B: Tools and Technologies Used

### Hardware

- Personal laptop and development workstation
- Raspberry Pi 5
- Thermal printer
- Local network equipment
- Supporting hardware for deployment and testing

### Software and Tools

- Visual Studio Code
- Git and GitHub
- Node.js
- Express.js
- React + TypeScript + Vite
- SQLite
- Postman
- Browser developer tools
- WhatsApp for communication and project clarifications
- Online documentation and technical references

## Appendix C: Main Internship Activities

- Requirement analysis and business understanding
- Project planning and solution design
- Frontend development
- Backend development
- Database creation and integration
- Feature debugging and refinement
- Local deployment preparation
- Raspberry Pi recovery and system configuration
- Thermal printer integration
- Performance and security refinement
- Backup and restore testing
- Documentation and final handover preparation

## Appendix D: Major Learning Outcomes

- Development of full-stack practical skills

- Improved confidence in independent problem-solving

- Better understanding of deployment and environment configuration

- Greater awareness of real-world software constraints

- Improved communication and professional responsibility

- Better understanding of project adaptation in changing requirements

- API testing and feature validation

- Debugging and system issue resolution

- Deployment configuration for local environment

- Performance and accessibility improvement

- Documentation and project handover preparation

These activities reflect the full scope of software work undertaken
during the internship and show that the trainee was actively involved in
the practical development and refinement of the system.

## Appendix D: Summary of Technical Problem-Solving Experience

One of the most significant aspects of the project was the repeated need
to solve practical problems in a real environment. These included
shaping the customer access flow in a local offline network, evaluating
and refining the deployment model, stabilizing the application under
realistic use, and resolving issues such as session behaviour,
accessibility, and system performance.

The experience demonstrated that technical work in an actual business
environment depends on continuous observation, testing, and corrective
action. It also showed that problem-solving in software projects is not
limited to coding; it is a broader process of understanding flaws,
evaluating options, and implementing a practical resolution.

## Appendix E: Major Milestones in the Project Timeline

The project was completed through a series of major development
milestones that reflected the real progression of the work. These
milestones included:

- Initial project discovery and technology comparison, where I evaluated
  ordering approaches and concluded that a QR-code web application was
  the most practical and accessible option for a small business
  environment.
- System design approval after the design reports and supervisor
  discussions, where the project direction was confirmed and the local
  deployment model using a Raspberry Pi was selected.
- Initial implementation of the customer ordering flow, payment flow,
  and management dashboard, followed by review and refinement based on
  the supervisor's feedback.
- Refactoring of the early prototype to align the app with the correct
  operational structure, including the separation of customer, payment,
  and management tasks.
- Thermal printer integration and local business workflow support, which
  were necessary to connect the digital system to real operating
  requirements.
- Raspberry Pi recovery and deployment preparation, including the full
  reinstallation of the OS after storage corruption was identified and
  corrected.
- Security and access hardening, covering role-based restrictions,
  session locking, safer authentication patterns, and improved reserve
  and audit behavior.
- Backup, restore, and continuity improvements, which became essential
  as the system approached handover and production-level readiness.
- Final accessibility, performance, release testing, and documentation
  updates, which completed the transition from prototype to practical
  business-ready deployment.

These milestones demonstrate that the internship was shaped by real
project progression, not by isolated coding tasks. Each phase
contributed to making the system more suitable for actual cafe
operations and strengthened the value of the internship experience.

## Other Related Matters

\(a\) Each student must prepare an individual report even though they
share a project.

\(b\) The report must be prepared as a Word document, single spacing and
typed on one side of the page, except for appendix/attachment.

\(c\) Date of submission: within one week after completion of industrial
training.

\(d\) Two copies of the report must be prepared. One copy to the
organization and one copy to the School.

\(e\) The student is responsible for submitting one copy of the report
and a thank you letter to the respective organization.

\(f\) All cost for preparing the report will be borne by the student.

\(g\) The report can be submitted in two bindings: the Main Binding
followed by the Appendix Binding.

\(h\) The main binding is recommended to have about 25 pages.

\(i\) All reports can be written either in Bahasa Malaysia or English.

## Final Note

This industrial training report reflects a genuine and practical
software engineering experience in a small business environment. It
documents the work performed, the challenges faced, the decisions made,
and the technical and personal development achieved throughout the
internship. It is not simply a passive description of an organization;
it is a record of active project involvement in a real-world software
environment.

The experience at Innovatree Technologies Sdn. Bhd. gave me the
opportunity to contribute in a meaningful way to a live business problem
while developing valuable technical and professional capability. It
strengthened my understanding of software development in realistic
conditions and improved my ability to solve problems independently,
communicate clearly, and work responsibly in an environment that
required initiative and judgment.

This report therefore serves both as an academic submission and as a
record of meaningful growth. It captures the practical learning, the
technical effort, and the professional maturity gained during the
internship. The experience was demanding, but it was also highly
valuable and will continue to shape my future work in the technology
industry.

***[Per university rules the internship was scheduled to ideally end on
24 August 2026; as mine began slightly later, it will conclude on 31
August 2026.]{.underline}***
