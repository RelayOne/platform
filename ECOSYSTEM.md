# Relay Platform Ecosystem

This repository is part of the **Relay Platform Ecosystem** - a suite of shared libraries and infrastructure powering Verity, NoteMan, ShipCheck, NEXUS, AgentForce, and other Terragon Labs products.

## 📦 Related Repositories

| Repository | Description | URL |
|------------|-------------|-----|
| **platform** (this repo) | Core TypeScript packages and Rust crates | [RelayOne/platform](https://github.com/RelayOne/platform) |
| **relay-ui** | Shared React component library | [RelayOne/relay-ui](https://github.com/RelayOne/relay-ui) |
| **mobile-core** | React Native shared library | [RelayOne/mobile-core](https://github.com/RelayOne/mobile-core) |
| **platform-auth-wasm** | WASM authentication primitives | [RelayOne/platform-auth-wasm](https://github.com/RelayOne/platform-auth-wasm) |
| **relay-infra** | Terraform, K8s, CI/CD templates | [RelayOne/relay-infra](https://github.com/RelayOne/relay-infra) |
| **relay-docs** | Docusaurus documentation | [RelayOne/relay-docs](https://github.com/RelayOne/relay-docs) |
| **nexus** | NEXUS platform (consumer) | [RelayOne/nexus](https://github.com/RelayOne/nexus) |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
│  NEXUS, Verity, ShipCheck, NoteMan, AgentForce              │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────────┐
│                     ▼                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  platform   │  │   relay-ui   │  │   mobile-core      │  │
│  │  (TS+Rust)  │  │   (React)    │  │  (React Native)    │  │
│  └──────┬──────┘  └──────────────┘  └────────────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  platform-auth-wasm │  │        relay-infra          │   │
│  │     (Rust→WASM)     │  │  (Terraform, K8s, CI/CD)    │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    relay-docs                         │   │
│  │               (Docusaurus Docs)                       │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## 📖 Full Documentation

For complete ecosystem documentation including setup guides, dependency matrix, and development workflows, see:

**[nexus/docs/RELAY_ECOSYSTEM.md](https://github.com/RelayOne/nexus/blob/main/docs/RELAY_ECOSYSTEM.md)**

## 🔧 Quick Clone All Repos

```bash
mkdir -p ~/repos && cd ~/repos
gh repo clone RelayOne/platform
gh repo clone RelayOne/relay-ui
gh repo clone RelayOne/mobile-core
gh repo clone RelayOne/platform-auth-wasm
gh repo clone RelayOne/relay-infra
gh repo clone RelayOne/relay-docs
gh repo clone RelayOne/nexus
```

## 📞 Support

- **Cross-repo Issues:** Open in [RelayOne/platform](https://github.com/RelayOne/platform/issues)
- **Documentation:** [RelayOne/relay-docs](https://github.com/RelayOne/relay-docs)
