# Ownlevel

Open-source (AGPL open-core), AI-first, white-label agency OS. Hierarchy: platform → partner (agency) → client (sub-account) → contact.

Architecture: [Ownlevel Architecture](https://claude.ai/artifact/KM8xHpkpjRYBtJ297NS2am). Modular monolith with a microkernel core and event-driven workers.

```
apps/       web · mobile · api · mcp-server · worker   (thin adapters, no business logic)
packages/   core · tenancy · ai · plugins · sdk · ui
```

Build order: tenancy + core + api → web → worker + ai → mcp-server → mobile.
