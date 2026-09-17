from pathlib import Path
import pickle

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset, DataLoader


# ============================================================
# CONFIGURATION
# ============================================================

DATASET_ROOT = Path(r"C:\Pixel2MeshData\reconstructor_dataset")

TRAIN_ROOT = DATASET_ROOT / "train"
TEST_ROOT = DATASET_ROOT / "test"

TRAIN_LIST = DATASET_ROOT / "train_list.txt"
TEST_LIST = DATASET_ROOT / "test_list.txt"


# ============================================================
# DATASET
# ============================================================

class ReconstructorDataset(Dataset):
    """
    Dataset loader for the prepared Pixel2Mesh dataset.

    Each list entry looks like:

    Data/ShapeNetP2M/02691156/<object_id>/rendering/00.dat

    The corresponding image is:

    Data/ShapeNetP2M/02691156/<object_id>/rendering/00.png

    Each .dat file contains an N x 6 numpy array:
        first 3 columns = XYZ coordinates
        last 3 columns  = normals
    """

    def __init__(self, split: str):
        if split not in {"train", "test"}:
            raise ValueError("split must be 'train' or 'test'")

        self.split = split

        if split == "train":
            self.split_root = TRAIN_ROOT
            self.list_file = TRAIN_LIST
        else:
            self.split_root = TEST_ROOT
            self.list_file = TEST_LIST

        if not self.split_root.exists():
            raise FileNotFoundError(
                f"Dataset split directory not found: {self.split_root}"
            )

        if not self.list_file.exists():
            raise FileNotFoundError(
                f"List file not found: {self.list_file}"
            )

        with self.list_file.open("r", encoding="utf-8") as f:
            self.file_list = [
                line.strip()
                for line in f
                if line.strip()
            ]

        if not self.file_list:
            raise RuntimeError(
                f"No entries found in {self.list_file}"
            )

        print(f"[Dataset] Split     : {self.split}")
        print(f"[Dataset] List      : {self.list_file}")
        print(f"[Dataset] Samples   : {len(self.file_list)}")

    def __len__(self):
        return len(self.file_list)

    def __getitem__(self, index):
        relative_dat_path = Path(self.file_list[index])

        dat_path = self.split_root / relative_dat_path

        if not dat_path.exists():
            raise FileNotFoundError(
                f".dat file not found:\n{dat_path}"
            )

        image_path = dat_path.with_suffix(".png")

        if not image_path.exists():
            raise FileNotFoundError(
                f".png file not found:\n{image_path}"
            )

        # --------------------------------------------------------
        # LOAD .DAT
        # --------------------------------------------------------

        with dat_path.open("rb") as f:
            data = pickle.load(f, encoding="latin1")

        if not isinstance(data, np.ndarray):
            raise TypeError(
                f"Expected numpy.ndarray, got {type(data)}"
            )

        if data.ndim != 2:
            raise ValueError(
                f"Expected 2D array, got shape {data.shape}"
            )

        if data.shape[1] != 6:
            raise ValueError(
                f"Expected 6 columns, got shape {data.shape}"
            )

        points = data[:, :3].astype(np.float32)
        normals = data[:, 3:6].astype(np.float32)

        # --------------------------------------------------------
        # LOAD IMAGE
        # --------------------------------------------------------

        image = Image.open(image_path).convert("RGB")

        image_np = np.asarray(image, dtype=np.float32) / 255.0

        # HWC -> CHW
        image_tensor = torch.from_numpy(
            np.transpose(image_np, (2, 0, 1))
        )

        # --------------------------------------------------------
        # TORCH TENSORS
        # --------------------------------------------------------

        points_tensor = torch.from_numpy(points)
        normals_tensor = torch.from_numpy(normals)

        # --------------------------------------------------------
        # PATH INFORMATION
        # --------------------------------------------------------

        # Data / ShapeNetP2M / category / object_id / rendering / file
        parts = relative_dat_path.parts

        category = parts[2]
        object_id = parts[3]
        view = relative_dat_path.stem

        return {
            "image": image_tensor,
            "points": points_tensor,
            "normals": normals_tensor,
            "category": category,
            "object_id": object_id,
            "view": view,
            "dat_path": str(dat_path),
            "image_path": str(image_path),
        }


# ============================================================
# TEST 1: SINGLE SAMPLE
# ============================================================

def test_single_sample():

    print()
    print("=" * 70)
    print("TEST 1: SINGLE SAMPLE")
    print("=" * 70)

    dataset = ReconstructorDataset("train")

    sample = dataset[0]

    print()
    print("Sample information:")
    print("Category     :", sample["category"])
    print("Object ID    :", sample["object_id"])
    print("View         :", sample["view"])

    print()
    print("Tensor information:")
    print("Image        :", sample["image"].shape)
    print("Image dtype  :", sample["image"].dtype)

    print("Points       :", sample["points"].shape)
    print("Points dtype :", sample["points"].dtype)

    print("Normals      :", sample["normals"].shape)
    print("Normals dtype:", sample["normals"].dtype)

    print()
    print("DAT:")
    print(sample["dat_path"])

    print()
    print("IMAGE:")
    print(sample["image_path"])


# ============================================================
# TEST 2: DATALOADER
# ============================================================

def test_dataloader():

    print()
    print("=" * 70)
    print("TEST 2: DATALOADER")
    print("=" * 70)

    dataset = ReconstructorDataset("train")

    loader = DataLoader(
        dataset,
        batch_size=1,
        shuffle=False,
        num_workers=0,
    )

    batch = next(iter(loader))

    print()
    print("Batch loaded successfully!")

    print("Image batch  :", batch["image"].shape)
    print("Points batch :", batch["points"].shape)
    print("Normals batch:", batch["normals"].shape)

    print("Category     :", batch["category"][0])
    print("Object ID    :", batch["object_id"][0])
    print("View         :", batch["view"][0])


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    print()
    print("Pixel2Mesh Reconstructor Dataset Test")
    print("=" * 70)

    test_single_sample()
    test_dataloader()

    print()
    print("=" * 70)
    print("ALL DATA LOADER TESTS PASSED")
    print("=" * 70)