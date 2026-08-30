# Traceable Conv-Pool RNG Architecture

A deterministic, traceable pseudo-random number generator (PRNG) implemented in Rust based on integer 2D convolutions and bitwise XOR pooling.

## 📂 Repository Structure

* **[`traceable-conv-rng/`](./traceable-conv-rng)**: Core Rust crate & web visualization system.
  * `src/lib.rs`: Core ARX convolution, XOR pooling, and tree lineage extraction algorithms.
  * `src/main.rs`: High-performance native Rust web server.
  * `web/index.html`: Interactive web dashboard with D3.js tree graph visualization & NIST randomness statistical analysis.

## 🚀 Quick Start

```bash
cd traceable-conv-rng
cargo run --release
```

Then open `http://127.0.0.1:8080` in your browser.
