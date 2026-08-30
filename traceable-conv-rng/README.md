# Traceable Conv-Pool PRNG (可追溯卷积-池化伪随机数生成器)

[![Rust](https://img.shields.io/badge/language-Rust-orange.svg)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

基于**卷积（Convolution）**与**池化（Pooling）**架构的可追溯确定性伪随机数生成器（Deterministic PRNG）。通过构建代数 ARX（Add-Rotate-XOR）卷积层与位异或池化层（XOR Pooling），打破传统神经网络池化导致的分布失真，实现高度雪崩效应、绝对可复现性以及**单像素有向无环图（DAG）全拓扑溯源**。

---

## 🌟 核心特色与创新点

1. **天然的可追溯性 (Full Lineage Tree Traceability)**
   * 给定初始 64 位种子（Seed）与卷积核参数，前向传播过程完全确定。
   * 支持从任意生成的输出伪随机数点向顶层反向追溯，使用 D3.js 渲染层次化树状图，精确定位其受哪些卷积核权重、移位值及 Layer 0 种子矩阵像素影响。

2. **解决池化分布失真问题 (Bitwise XOR Pooling)**
   * **Max Pooling**：偏向最大值，导致随机数严重失真。
   * **Average Pooling**：中心极限定理导致输出趋近正态分布而非均匀分布。
   * **本方案创新**：设计 $2 \times 2$ 步长**位异或池化（Bitwise XOR Pooling）**，完美保留位域上的均匀分布与最大熵。

3. **高雪崩效应 (ARX Convolution Kernel)**
   * 使用无符号 32 位整数字长域（$\mathbb{Z}_{2^{32}}$）上的加法、循环移位（Rotate Left）与异或混合，微小的种子变化即可扩散至整个矩阵。

4. **GPU / NPU 高度并行友好**
   * 基于张量矩阵运算，天然适合在现代显卡与 AI 加速芯片上并行批量生成伪随机数据。

---

## 🏗️ 算法管线 (Architecture Pipeline)

```text
Seed (u64)
  │
  ▼
[Layer 0]  Seed Expansion Matrix (N x N) - SplitMix64 散列扩展
  │
  ▼
[Layer 1]  3x3 ARX Convolution Layer (N x N) - 3x3 循环移位 ARX 卷积
  │
  ▼
[Layer 2]  2x2 Bitwise XOR Pooling Layer (N/2 x N/2) - 2x2 位异或下采样
  │
  ▼
[Layer 3]  3x3 Diffusion Layer (N/2 x N/2) - 最终扩散与随机数流提取
```

---

## 🖥️ Web 可视化交互面板 (Dashboard)

内置基于 Rust 原生 HTTP 服务器与 HTML5/D3.js 的交互面板：

* **🌲 随机数追溯树状图 (Lineage Tree)**：交互式 D3.js 树图，展示所选随机数的逐级归因过程。
* **🎨 4 层特征热力图 (Feature Maps)**：实时显示 Layer 0 到 Layer 3 的像素值与规范化色彩映射。
* **📊 随机性统计分析 (Randomness Test)**：
  * 输出数据 10-Bin 直方图分布。
  * NIST Monobit 单比特平衡度校验。
  * 卡方均匀性检验（Chi-Square Uniformity p-value）。
  * 2D 伪色彩随机过程噪声图。

---

## 🚀 快速开始 (Quick Start)

### 前置要求
* [Rust](https://www.rust-lang.org/) (Cargo 1.80+)

### 构建与运行

1. 克隆仓库或进入子目录：
   ```bash
   cd traceable-conv-rng
   ```

2. 运行测试套件：
   ```bash
   cargo test
   ```

3. 编译并启动 Web 服务：
   ```bash
   cargo run --release
   ```

4. 打开浏览器访问界面：
   ```text
   http://127.0.0.1:8080
   ```

---

## 📜 许可证 (License)

根据 [MIT License](LICENSE) 许可发布。
