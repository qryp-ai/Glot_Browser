# Glot_Browser

![Glot Browser Screenshot](https://i.postimg.cc/Wpq7tN3J/Screenshot-2026-01-20-222117.png)

**Glot Browser** is an experimental, privacy-first desktop web browser built on Chromium, designed to integrate local AI capabilities directly into the browsing experience. It allows users to interact with the web using AI assistance while keeping full control over data, models, and execution.
Glot Browser combines a modern Chromium-based browsing engine with a locally running AI backend. Unlike cloud-dependent AI browsers, Glot Browser is designed to:

- Run AI locally on the user’s machine
- Avoid mandatory accounts or telemetry
- Give users freedom to choose their own AI models
- Maintain strict separation between browser data and external services

This project is currently in **active development** and should be considered **experimental**.

---

## Key Principles

- **Privacy-first**: No forced data collection, tracking, or analytics
- **Local execution**: AI processing runs on the user’s device
- **User control**: Choose your own AI models and providers
- **Transparent architecture**: Clear separation between browser, launcher, and AI runtime
- **Open-source friendly**: Designed for inspection, modification, and contribution

---

## Features

- Chromium-based browsing engine
- Built-in AI sidebar and browser extension
- Local AI backend runtime (no cloud dependency by default)
- Support for multiple AI providers and local model runtimes (e.g. OpenAI-compatible APIs, Gemini, Ollama)
- Custom launcher for process and lifecycle management
- Secure local profile and runtime storage
- Extension-based UI integration

---

## Platform Support

- **Windows (64-bit)**  
Other platforms may be explored in the future, but are not currently supported.

---

## Project Status

- Release type: **Early / Experimental**
- Stability: Actively improving
- Intended audience:
  - Developers
  - Privacy-focused users
  - AI enthusiasts
  - Open-source contributors

---

## Security & Privacy Notes

- No mandatory sign-in or account system
- No background telemetry or analytics
- No cloud AI usage unless explicitly configured by the user
- All AI requests are initiated by the user

Users are encouraged to review the source code and runtime behavior.

---

## Contributing

Contributions, issues, and discussions are welcome.

You can help by:
- Reporting bugs or UI issues
- Suggesting architecture improvements
- Improving documentation
- Testing new features or model integrations

Please open an issue before submitting major changes.

---

## Disclaimer

Glot Browser is provided **as-is**, without warranty of any kind.  
Use at your own risk.

