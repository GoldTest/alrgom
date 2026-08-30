use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Kernel3x3 {
    pub weights: [[u32; 3]; 3],
    pub shifts: [[u32; 3]; 3],
}

impl Default for Kernel3x3 {
    fn default() -> Self {
        Self {
            weights: [
                [0x9E3779B9, 0x85EBCA6B, 0xC2B2AE35],
                [0x27D4EB2F, 0x165667B1, 0x9E3779B9],
                [0x85EBCA6B, 0xC2B2AE35, 0x27D4EB2F],
            ],
            shifts: [
                [7, 11, 13],
                [17, 19, 23],
                [5, 9, 15],
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixLayer {
    pub name: String,
    pub width: usize,
    pub height: usize,
    pub data: Vec<Vec<u32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceNode {
    pub id: String,
    pub layer: usize,
    pub layer_name: String,
    pub row: usize,
    pub col: usize,
    pub value_hex: String,
    pub value_dec: u32,
    pub value_norm: f64,
    pub op_type: String,
    pub op_detail: String,
    pub children: Vec<TraceNode>,
}

fn splitmix64(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct TraceableRng {
    seed: u64,
    size: usize,
    kernel1: Kernel3x3,
    kernel2: Kernel3x3,
    l0_seed: Vec<Vec<u32>>,
    l1_conv: Vec<Vec<u32>>,
    l2_pool: Vec<Vec<u32>>,
    l3_diffuse: Vec<Vec<u32>>,
}

impl TraceableRng {
    pub fn new(seed: u64, size: usize) -> Self {
        let size = if size < 4 { 4 } else { size };
        // Ensure size is even for 2x2 pooling
        let size = if size % 2 != 0 { size + 1 } else { size };

        let kernel1 = Kernel3x3::default();
        let kernel2 = Kernel3x3 {
            weights: [
                [0xD1B54A32, 0x6C078965, 0x159A55E5],
                [0xA4093822, 0x299F31D0, 0x8054B327],
                [0xCEE1A0BD, 0x1165A967, 0x7A9D8B1C],
            ],
            shifts: [
                [9, 13, 15],
                [11, 21, 25],
                [3, 17, 19],
            ],
        };

        let mut rng = Self {
            seed,
            size,
            kernel1,
            kernel2,
            l0_seed: vec![],
            l1_conv: vec![],
            l2_pool: vec![],
            l3_diffuse: vec![],
        };
        rng.compute_pipeline();
        rng
    }

    fn compute_pipeline(&mut self) {
        // 1. Layer 0: Seed Matrix Initialization
        let mut sm_state = self.seed;
        let mut l0 = vec![vec![0u32; self.size]; self.size];
        for r in 0..self.size {
            for c in 0..self.size {
                let val64 = splitmix64(&mut sm_state);
                l0[r][c] = (val64 ^ (val64 >> 32)) as u32;
            }
        }
        self.l0_seed = l0;

        // 2. Layer 1: Integer ARX Convolution (3x3 periodic)
        let s = self.size;
        let mut l1 = vec![vec![0u32; s]; s];
        for r in 0..s {
            for c in 0..s {
                let mut acc: u32 = 0x65D444C5;
                for dr in 0..3 {
                    for dc in 0..3 {
                        let pr = (r + s + dr - 1) % s;
                        let pc = (c + s + dc - 1) % s;
                        let in_val = self.l0_seed[pr][pc];
                        let w = self.kernel1.weights[dr][dc];
                        let shift = self.kernel1.shifts[dr][dc];
                        let term = in_val.wrapping_mul(w).rotate_left(shift);
                        acc = acc.wrapping_add(term) ^ (term >> 3);
                    }
                }
                l1[r][c] = acc;
            }
        }
        self.l1_conv = l1;

        // 3. Layer 2: 2x2 Bitwise XOR Stride Pooling
        let p_size = s / 2;
        let mut l2 = vec![vec![0u32; p_size]; p_size];
        for r in 0..p_size {
            for c in 0..p_size {
                let v00 = self.l1_conv[2 * r][2 * c];
                let v01 = self.l1_conv[2 * r][2 * c + 1];
                let v10 = self.l1_conv[2 * r + 1][2 * c];
                let v11 = self.l1_conv[2 * r + 1][2 * c + 1];
                let xor_val = v00 ^ v01 ^ v10 ^ v11;
                // Add non-linear rotation step to break symmetries
                l2[r][c] = xor_val.rotate_left(13).wrapping_add(0x9E3779B9);
            }
        }
        self.l2_pool = l2;

        // 4. Layer 3: Diffusion Convolution Layer (3x3 periodic)
        let mut l3 = vec![vec![0u32; p_size]; p_size];
        for r in 0..p_size {
            for c in 0..p_size {
                let mut acc: u32 = 0x27D4EB2F;
                for dr in 0..3 {
                    for dc in 0..3 {
                        let pr = (r + p_size + dr - 1) % p_size;
                        let pc = (c + p_size + dc - 1) % p_size;
                        let in_val = self.l2_pool[pr][pc];
                        let w = self.kernel2.weights[dr][dc];
                        let shift = self.kernel2.shifts[dr][dc];
                        let term = (in_val ^ w).rotate_left(shift);
                        acc = acc.wrapping_mul(31).wrapping_add(term);
                    }
                }
                l3[r][c] = acc;
            }
        }
        self.l3_diffuse = l3;
    }

    pub fn get_trace_tree(&self, layer_idx: usize, row: usize, col: usize) -> TraceNode {
        let p_size = self.size / 2;
        match layer_idx {
            0 => {
                let r = row % self.size;
                let c = col % self.size;
                let val = self.l0_seed[r][c];
                TraceNode {
                    id: format!("L0_{}_{}", r, c),
                    layer: 0,
                    layer_name: "Layer 0: Seed Matrix (Initial State)".to_string(),
                    row: r,
                    col: c,
                    value_hex: format!("0x{:08X}", val),
                    value_dec: val,
                    value_norm: val as f64 / 4294967295.0,
                    op_type: "SplitMix64 Seed Expansion".to_string(),
                    op_detail: format!("Generated from Seed {:#X} at offset ({}, {})", self.seed, r, c),
                    children: vec![],
                }
            }
            1 => {
                let r = row % self.size;
                let c = col % self.size;
                let val = self.l1_conv[r][c];
                let s = self.size;
                let mut children = vec![];
                for dr in 0..3 {
                    for dc in 0..3 {
                        let pr = (r + s + dr - 1) % s;
                        let pc = (c + s + dc - 1) % s;
                        let mut child = self.get_trace_tree(0, pr, pc);
                        let w = self.kernel1.weights[dr][dc];
                        let shift = self.kernel1.shifts[dr][dc];
                        child.op_detail = format!(
                            "Weight K1[{},{}] = {:#010X}, Shift = {} bits",
                            dr, dc, w, shift
                        );
                        children.push(child);
                    }
                }
                TraceNode {
                    id: format!("L1_{}_{}", r, c),
                    layer: 1,
                    layer_name: "Layer 1: ARX Integer Convolution (3x3)".to_string(),
                    row: r,
                    col: c,
                    value_hex: format!("0x{:08X}", val),
                    value_dec: val,
                    value_norm: val as f64 / 4294967295.0,
                    op_type: "3x3 ARX Convolution".to_string(),
                    op_detail: "acc = 0x65D444C5 + SUM( (In * Weight) ROT Shift )".to_string(),
                    children,
                }
            }
            2 => {
                let r = row % p_size;
                let c = col % p_size;
                let val = self.l2_pool[r][c];
                let children = vec![
                    self.get_trace_tree(1, 2 * r, 2 * c),
                    self.get_trace_tree(1, 2 * r, 2 * c + 1),
                    self.get_trace_tree(1, 2 * r + 1, 2 * c),
                    self.get_trace_tree(1, 2 * r + 1, 2 * c + 1),
                ];
                TraceNode {
                    id: format!("L2_{}_{}", r, c),
                    layer: 2,
                    layer_name: "Layer 2: 2x2 Bitwise XOR Pooling".to_string(),
                    row: r,
                    col: c,
                    value_hex: format!("0x{:08X}", val),
                    value_dec: val,
                    value_norm: val as f64 / 4294967295.0,
                    op_type: "2x2 XOR Downsampling Pool".to_string(),
                    op_detail: "(L1[2r,2c] ^ L1[2r,2c+1] ^ L1[2r+1,2c] ^ L1[2r+1,2c+1]) ROT 13 + 0x9E3779B9".to_string(),
                    children,
                }
            }
            3 | _ => {
                let r = row % p_size;
                let c = col % p_size;
                let val = self.l3_diffuse[r][c];
                let mut children = vec![];
                for dr in 0..3 {
                    for dc in 0..3 {
                        let pr = (r + p_size + dr - 1) % p_size;
                        let pc = (c + p_size + dc - 1) % p_size;
                        let mut child = self.get_trace_tree(2, pr, pc);
                        let w = self.kernel2.weights[dr][dc];
                        let shift = self.kernel2.shifts[dr][dc];
                        child.op_detail = format!(
                            "Weight K2[{},{}] = {:#010X}, Shift = {} bits",
                            dr, dc, w, shift
                        );
                        children.push(child);
                    }
                }
                TraceNode {
                    id: format!("L3_{}_{}", r, c),
                    layer: 3,
                    layer_name: "Layer 3: Non-Linear Diffusion (Output RNG)".to_string(),
                    row: r,
                    col: c,
                    value_hex: format!("0x{:08X}", val),
                    value_dec: val,
                    value_norm: val as f64 / 4294967295.0,
                    op_type: "3x3 Non-Linear Diffusion".to_string(),
                    op_detail: "acc = acc * 31 + ((In ^ Weight) ROT Shift)".to_string(),
                    children,
                }
            }
        }
    }
}

#[wasm_bindgen]
impl TraceableRng {
    #[wasm_bindgen(constructor)]
    pub fn wasm_new(seed_hi: u32, seed_lo: u32, size: usize) -> TraceableRng {
        let seed = ((seed_hi as u64) << 32) | (seed_lo as u64);
        TraceableRng::new(seed, size)
    }

    #[wasm_bindgen]
    pub fn get_layers_json(&self) -> String {
        let layers = vec![
            MatrixLayer {
                name: "Layer 0: Seed Matrix".to_string(),
                width: self.size,
                height: self.size,
                data: self.l0_seed.clone(),
            },
            MatrixLayer {
                name: "Layer 1: ARX Convolution".to_string(),
                width: self.size,
                height: self.size,
                data: self.l1_conv.clone(),
            },
            MatrixLayer {
                name: "Layer 2: 2x2 XOR Pooling".to_string(),
                width: self.size / 2,
                height: self.size / 2,
                data: self.l2_pool.clone(),
            },
            MatrixLayer {
                name: "Layer 3: Output Diffusion".to_string(),
                width: self.size / 2,
                height: self.size / 2,
                data: self.l3_diffuse.clone(),
            },
        ];
        serde_json::to_string(&layers).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_trace_tree_json(&self, layer_idx: usize, row: usize, col: usize) -> String {
        let tree = self.get_trace_tree(layer_idx, row, col);
        serde_json::to_string(&tree).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_output_flat(&self) -> Vec<f64> {
        let mut out = Vec::new();
        for r in 0..self.l3_diffuse.len() {
            for c in 0..self.l3_diffuse[r].len() {
                out.push(self.l3_diffuse[r][c] as f64 / 4294967295.0);
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rng_creation_and_trace() {
        let rng = TraceableRng::new(123456789, 8);
        assert_eq!(rng.l0_seed.len(), 8);
        assert_eq!(rng.l1_conv.len(), 8);
        assert_eq!(rng.l2_pool.len(), 4);
        assert_eq!(rng.l3_diffuse.len(), 4);

        let tree = rng.get_trace_tree(3, 0, 0);
        assert_eq!(tree.layer, 3);
        assert_eq!(tree.children.len(), 9); // 3x3 conv children
        assert_eq!(tree.children[0].children.len(), 4); // 2x2 pool children
        assert_eq!(tree.children[0].children[0].children.len(), 9); // 3x3 conv children
    }
}
