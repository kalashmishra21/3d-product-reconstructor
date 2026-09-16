# 3D Object Reconstruction from Images

**A Graph CNN and Mesh Deformation based Single-Image 3D Reconstruction System for E-Commerce and AR/VR**

---

## Overview

This project reconstructs a **real 3D mesh** (vertices + faces) of an object from a **single 2D RGB image**. The output is a complete 3D surface representation — not a 2D image that merely appears three-dimensional — suitable for interactive visualization, augmented reality, and e-commerce product display.

The approach is grounded in the **Pixel2Mesh** architecture ([ECCV 2018](https://arxiv.org/abs/1804.01654)), which progressively deforms an initial ellipsoid mesh to match the target object's geometry using learned image features and graph-based neural networks.

---

## Problem Statement

Capturing high-quality 3D models of products traditionally requires expensive multi-view scanning setups or manual modeling. This project aims to automate that process: given a single product photograph, produce a 3D mesh that faithfully represents the object's shape and can be viewed, rotated, and inspected from any angle.

---

## Objectives

- Reconstruct 3D meshes from single RGB images using deep learning
- Implement a coarse-to-fine mesh deformation pipeline based on Graph CNNs
- Build a web-based interface for uploading images, running reconstruction, and interactively viewing results
- Provide quantitative evaluation using standard 3D reconstruction metrics

---

## Approach

### Why Start from an Ellipsoid?

The reconstruction begins with a **template ellipsoid mesh** rather than generating geometry from scratch. An ellipsoid provides a topologically valid, watertight starting surface with well-distributed vertices. The network's task is then simplified from "create a mesh" to "move existing vertices to the right places" — a deformation problem that is more tractable for gradient-based learning.

### CNN Feature Extraction

A convolutional neural network (CNN) processes the input RGB image and extracts multi-scale feature maps. These feature maps encode both low-level details (edges, textures) and high-level semantic information (object parts, overall shape) at different spatial resolutions.

### Perceptual Feature Pooling

Each vertex of the 3D mesh is projected onto the 2D image plane using a known or estimated camera model. At each projected location, features are sampled (pooled) from the CNN feature maps. This gives every mesh vertex a feature vector that encodes the local image appearance at its corresponding 2D position, creating a bridge between the 2D image and the 3D mesh structure.

### Graph CNN for Mesh Learning

Standard CNNs operate on regular grids (pixels), but meshes are irregular graphs. **Graph Convolutional Networks (Graph CNNs)** generalize convolutions to work on the mesh's graph topology, where each vertex aggregates information from its neighbors. This enables the network to reason about local surface geometry and propagate shape information across the mesh.

### Mesh Deformation

The Graph CNN predicts a 3D displacement (offset) for each vertex. Applying these offsets progressively deforms the ellipsoid toward the target object's shape. The deformation is learned end-to-end: the network sees the image features at each vertex's projected position and learns to predict how far and in which direction that vertex should move.

### Coarse-to-Fine Refinement (Graph Unpooling)

The deformation proceeds in multiple stages. After each stage, **graph unpooling** increases the mesh resolution by subdividing faces and adding new vertices. Each stage refines a progressively higher-resolution mesh:

1. **Stage 1** — Coarse deformation on a low-resolution mesh captures the overall object shape
2. **Stage 2** — Medium-resolution refinement adds structural detail
3. **Stage 3** — High-resolution refinement captures fine geometric features

This coarse-to-fine strategy allows the network to first establish the global shape before investing capacity on local details.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        High-Level Pipeline                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Single RGB Image                                                  │
│        │                                                            │
│        ▼                                                            │
│   Image Preprocessing                                               │
│        │                                                            │
│        ▼                                                            │
│   CNN Feature Extraction (multi-scale feature maps)                 │
│        │                                                            │
│        ▼                                                            │
│   Initial Ellipsoid Mesh ──► Perceptual Feature Pooling             │
│        │                           │                                │
│        ▼                           ▼                                │
│   ┌─────────────────────────────────────┐                           │
│   │   Graph CNN  +  Mesh Deformation    │◄── Stage 1 (coarse)      │
│   │        │                            │                           │
│   │   Graph Unpooling                   │                           │
│   │        │                            │                           │
│   │   Graph CNN  +  Mesh Deformation    │◄── Stage 2 (medium)      │
│   │        │                            │                           │
│   │   Graph Unpooling                   │                           │
│   │        │                            │                           │
│   │   Graph CNN  +  Mesh Deformation    │◄── Stage 3 (fine)        │
│   └─────────────────────────────────────┘                           │
│        │                                                            │
│        ▼                                                            │
│   Final 3D Mesh ──► Mesh Export (.obj)                              │
│        │                                                            │
│        ▼                                                            │
│   ┌──────────────┐    ┌───────────────────────┐                     │
│   │ FastAPI API   │───►│ React + Three.js      │                    │
│   │ (Backend)     │    │ (Interactive Viewer)   │                    │
│   └──────────────┘    └───────────────────────┘                     │
│                              │                                      │
│                              ▼                                      │
│                       Quality Report                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Model Architecture

| Component | Role |
|---|---|
| **CNN Backbone** | Extracts multi-scale 2D feature maps from the input image |
| **Perceptual Feature Pooling** | Projects 3D vertices to 2D and samples image features |
| **Graph CNN Blocks** | Learns vertex displacements using mesh-topology-aware convolutions |
| **Graph Unpooling** | Increases mesh resolution between deformation stages |
| **Mesh Deformation Layers** | Applies predicted vertex offsets to progressively deform the ellipsoid |

The architecture operates in **three cascaded deformation blocks**, each producing a progressively finer mesh. All blocks share the same CNN feature maps but operate on meshes of increasing resolution.

---

## Dataset

**Primary dataset:** [ShapeNet](https://shapenet.org/) (via the Pixel2Mesh data pipeline)

### Prepared Subset

| Property | Value |
|---|---|
| Training objects | ~3,000 unique objects |
| Testing objects | ~1,000 unique objects |
| Total | ~4,000 unique objects |
| Categories | 13 |
| Views per object | 5 rendered views |
| Train/Test overlap | **0** (explicitly verified) |

### ShapeNet Categories

| Synset ID | Category |
|---|---|
| 02691156 | Airplane |
| 02828884 | Bench |
| 02933112 | Cabinet |
| 02958343 | Car |
| 03001627 | Chair |
| 03211117 | Display |
| 03636649 | Lamp |
| 03691459 | Loudspeaker |
| 04090263 | Rifle |
| 04256520 | Sofa |
| 04379243 | Table |
| 04401088 | Telephone |
| 04530566 | Watercraft |

> **Note:** The ShapeNet dataset and generated subset files are **not included** in this repository. They are excluded via `.gitignore`. See [Dataset Preparation](#dataset-preparation) to reproduce the subset locally.

---

## Evaluation

### Training Losses / Regularization

The model training is intended to use the following loss components:

| Loss | Purpose |
|---|---|
| **Chamfer Distance** | Measures bidirectional closest-point distance between predicted and ground-truth surfaces |
| **Laplacian Regularization** | Encourages smooth surfaces by penalizing large deviations from local neighborhood averages |
| **Edge-Length Regularization** | Prevents degenerate faces by penalizing excessively long edges |

### Evaluation Metrics

| Metric | Description |
|---|---|
| **Chamfer Distance** | Quantifies geometric accuracy of the reconstructed mesh |
| **F-Score** | Measures the percentage of predicted points within a distance threshold of the ground truth (and vice versa) |
| **Normal Consistency** | Evaluates surface orientation agreement between predicted and ground-truth normals |

> **Status:** ⏳ *Planned* — Evaluation pipeline implementation is in progress. No numerical results are available yet.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Deep Learning** | Python, PyTorch, PyTorch3D |
| **3D Processing** | trimesh |
| **Backend** | FastAPI |
| **Frontend** | React, JavaScript, Three.js, Tailwind CSS |
| **HTTP Client** | Axios |
| **Version Control** | Git, GitHub |

---

## Repository Structure

```
3d-product-reconstructor/
│
├── Pixel2Mesh/                     # Core model implementation area
│   ├── checkpoints/                # Saved model weights (empty — planned)
│   ├── configs/                    # Training/model configuration (empty — planned)
│   ├── datasets/                   # Dataset loading and metadata
│   │   └── data/shapenet/          # ShapeNet data root (git-ignored)
│   │       ├── meta/               # Original train/test list files
│   │       └── small/              # Prepared subset (generated locally)
│   ├── experiments/                # Experiment tracking (empty — planned)
│   ├── functions/                  # Utility functions (empty — planned)
│   ├── logs/                       # Training logs (empty — planned)
│   ├── models/                     # Neural network definitions (empty — planned)
│   └── outputs/                    # Inference outputs (empty — planned)
│
├── dataset_tools/                  # Dataset preparation tooling
│   └── prepare_pixel2mesh_subset.py  # Deterministic subset builder ✅
│
├── docs/                           # Project documentation (planned)
├── notebooks/                      # Jupyter notebooks (planned)
├── scripts/                        # Utility scripts (planned)
│
├── .gitignore                      # Comprehensive ignore rules ✅
└── README.md                       # This file ✅
```

---

## Getting Started

### Prerequisites

- Python 3.8+
- CUDA-capable GPU (recommended for training)
- Git

### Installation

> **Status:** ⏳ *Coming Soon* — A `requirements.txt` will be provided once the model implementation is in place. The core dependencies will include:
>
> - PyTorch
> - PyTorch3D
> - trimesh
> - FastAPI
> - Additional dependencies TBD during implementation

---

## Dataset Preparation

The dataset preparation script builds a balanced, deterministic subset from the full ShapeNet/Pixel2Mesh data. **You must have the original ShapeNet data available locally before running this script.**

### Preparation Workflow

```
Original ShapeNet / Pixel2Mesh Data
        │
        ▼
  Read original train/test split lists
        │
        ▼
  Balanced category selection (even distribution across 13 categories)
        │
        ▼
  Deterministic random sampling (fixed seed = 42)
        │
        ▼
  Train/Test overlap verification (zero tolerance)
        │
        ▼
  Copy selected objects to subset directory
        │
        ▼
  Generate metadata (metadata.csv) + subset report (subset_report.txt)
```

### Key Script

**[`dataset_tools/prepare_pixel2mesh_subset.py`](dataset_tools/prepare_pixel2mesh_subset.py)**

This script:
- Reads the original full Pixel2Mesh train/test list files
- Selects a deterministic subset (~3,000 train + ~1,000 test objects) using a fixed random seed
- Balances the selection evenly across all 13 ShapeNet categories
- Explicitly verifies that no object ID appears in both train and test sets
- Copies selected object directories to the output location
- Generates `metadata.csv` (per-object catalog) and `subset_report.txt` (summary statistics)

> **Note:** Before running, update the path constants at the top of the script to match your local data locations. Large datasets and generated artifacts are excluded from version control.

### Reproducibility

- **Deterministic selection:** A fixed random seed (`RANDOM_SEED = 42`) ensures identical subset selection across runs
- **Overlap check:** Train/test overlap is explicitly computed and the script raises an error if any overlap is detected
- **Balanced splits:** Object counts are distributed as evenly as possible across categories (±1 object per category)

---

## Training

> **Status:** ⏳ *Coming Soon* — Training pipeline is planned. This section will include training commands, configuration options, and expected resource requirements.

---

## Inference

> **Status:** ⏳ *Coming Soon* — Inference pipeline is planned. This section will document single-image reconstruction commands and mesh export options.

---

## API

The project plans to serve the reconstruction model through a **FastAPI** backend.

### Planned Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Health check |
| `POST` | `/api/v1/reconstruct` | Upload an image and receive a reconstructed 3D mesh |
| `GET` | `/api/v1/report/{request_id}` | Retrieve the quality report for a reconstruction |

> **Status:** ⏳ *Planned* — Backend implementation has not started yet.

---

## Frontend

The planned frontend provides an end-to-end user workflow built with **React** and **Three.js**:

1. **Upload** a single RGB product image
2. **Send** the image to the FastAPI backend
3. **Run** 3D reconstruction
4. **Receive** the reconstructed mesh
5. **View** the 3D mesh interactively (rotate, zoom, pan)
6. **Inspect** the quality report (reconstruction metrics)

> **Status:** ⏳ *Planned* — Frontend implementation has not started yet.

---

## Documentation

- [Project PRD](docs/PRD/3D_Object_Reconstruction_PRD.pdf) — Product Requirements Document

---

## Roadmap

- [x] Project foundation (repository structure, `.gitignore`)
- [x] Dataset preparation tooling (`prepare_pixel2mesh_subset.py`)
- [ ] Model implementation (Graph CNN, mesh deformation, unpooling)
- [ ] Training pipeline
- [ ] Evaluation pipeline
- [ ] Inference pipeline
- [ ] FastAPI backend
- [ ] React + Three.js frontend
- [ ] End-to-end integration
- [ ] Final documentation

---

## Limitations

- **Single-view ambiguity** — Reconstruction from one image cannot directly observe occluded or hidden surfaces; the model must hallucinate unseen geometry.
- **Training data dependency** — Reconstruction quality is bounded by the diversity and quality of the training data and the input image.
- **Domain gap** — Models trained on ShapeNet (synthetic renders) may not generalize perfectly to arbitrary real-world product photographs without domain adaptation.
- **GPU requirement** — Practical model training requires CUDA-capable GPU hardware.
- **Geometry focus** — This project reconstructs surface geometry (mesh); photorealistic texture generation is not a current objective.

---

## References

- **Pixel2Mesh: Generating 3D Mesh Models from Single RGB Images** — Nanyang Wang, Yinda Zhang, Zhuwen Li, Yanwei Fu, Wei Liu, Yu-Gang Jiang — ECCV 2018 — [arXiv:1804.01654](https://arxiv.org/abs/1804.01654)
- **Original Pixel2Mesh Implementation** — [github.com/nywang16/Pixel2Mesh](https://github.com/nywang16/Pixel2Mesh)
- **ShapeNet** — [shapenet.org](https://shapenet.org/)

---

## License

*License information to be added.*
