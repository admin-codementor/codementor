# 🎓 CodeMentor — Intelligent Coding Assessment Platform

> A full-stack coding assessment platform for academic institutions — featuring a Monaco-powered IDE, real-time code execution via Judge0, AI-assisted hints, plagiarism detection, and role-based dashboards for Students, Faculty, and HODs.

---

## 📐 Architecture Overview

```
codementor/
├── frontend-next/     ← Next.js 16 + MUI v6 app (Monaco Editor, role-based UI)
│   └── src/
│       ├── app/          (routes, grouped by role: student/faculty/ide/auth)
│       ├── components/   (editor, shell, feedback, faculty tooling)
│       └── lib/          (API client, Firebase client)
├── backend/           ← Node.js 22 + Express 5 API server (stateless)
│   └── src/
│       ├── controllers/  (business logic)
│       ├── middleware/   (auth, rate limit, error handling)
│       ├── repositories/ (Firestore access)
│       ├── services/     (judge, AI, plagiarism)
│       └── config/       (Firebase, Redis, env)
├── judge0/            ← Code execution engine config (Docker, privileged)
├── docker-compose.yml ← Full-stack self-hosted deployment (Judge0 network-isolated)
└── docs/              ← Deployment guide, DevOps guide, scale-readiness programme
```

---

## 🚀 Tech Stack

| Layer        | Technology                                                |
|--------------|------------------------------------------------------------|
| Frontend     | Next.js 16, MUI v6 (Material 3), Monaco Editor              |
| Backend      | Node.js 22, Express 5 — stateless (no sessions, no sockets) |
| Database     | Firebase Firestore                                          |
| Auth         | Firebase Auth → backend mints its own JWT                   |
| Cache / rate limit | Upstash Redis (REST-based)                             |
| Code Engine  | Judge0 CE — always self-hosted, needs privileged Docker      |
| AI Features  | Google Gemini (hints, code review)                           |
| Plagiarism   | JPlag 5.1.0 (Java), shelled out from the backend              |
| DevOps       | Docker Compose, GitHub Actions CI                             |

See [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md) for the full picture — what runs where, why Judge0 can never be serverless, and both hosting paths (cloud vs. self-hosted). See [`docs/DEVOPS_GUIDE.md`](docs/DEVOPS_GUIDE.md) for the CI/CD lifecycle and tooling.

---

## 🛠️ Getting Started

### Prerequisites

- Node.js 22+
- Docker & Docker Compose

### Run the whole stack locally

```bash
git clone https://github.com/admin-codementor/codementor.git
cd codementor
cp backend/.env.example backend/.env      # fill in real values
cp frontend-next/.env.example frontend-next/.env
docker compose up -d --build
```

This brings up the frontend, backend, and Judge0 (server + worker + its own Postgres/Redis), with Judge0 sealed on an isolated Docker network reachable only by the backend.

### Or run apps individually (faster iteration)

```bash
cd backend && npm install && npm run dev      # http://localhost:3001
cd frontend-next && npm install && npm run dev # http://localhost:3000
```

Firestore, Firebase Auth, Upstash, and Gemini are managed cloud services — no local setup needed beyond real credentials in `.env`.

---

## 👥 Roles

| Role    | Capabilities                                                                 |
|---------|-------------------------------------------------------------------------------|
| Student | Solve problems in the IDE, run/submit code, take contests and MCQ tests       |
| Faculty | Author problems and test cases, create assignments/classes, plagiarism checks |
| HOD     | Everything faculty can do, scoped across departments, permissions/audit logs  |

---

## 📡 API Reference

See [`docs/API.md`](docs/API.md) for endpoint documentation.

---

## 📄 License

MIT © CodeMentor Project
