import pickle
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset
from torch.utils.data.dataloader import default_collate
from torchvision.transforms import Normalize

import config


class ReconstructorTrainingDataset(Dataset):
    """
    Dataset adapter for the prepared:
    C:/Pixel2MeshData/reconstructor_dataset

    Raw images are 137x137, but Pixel2Mesh processes them at config.IMG_SIZE
    (224x224), matching the reference data_tf loader.
    """

    def __init__(self, file_root, split, mesh_pos, normalization, shapenet_options):
        self.file_root = Path(file_root)
        self.split = split
        self.split_root = self.file_root / split
        self.normalization = normalization
        self.mesh_pos = np.asarray(mesh_pos, dtype=np.float32)
        self.image_normalize = Normalize(
            mean=config.IMG_NORM_MEAN,
            std=config.IMG_NORM_STD
        )

        list_file = self.file_root / f"{split}_list.txt"

        if not self.split_root.exists():
            raise FileNotFoundError(f"Dataset split not found: {self.split_root}")

        if not list_file.exists():
            raise FileNotFoundError(f"List file not found: {list_file}")

        with list_file.open("r", encoding="utf-8") as fp:
            self.file_names = [line.strip() for line in fp if line.strip()]

        if not self.file_names:
            raise RuntimeError(f"No samples found in {list_file}")

        categories = sorted({Path(name).parts[2] for name in self.file_names})
        self.labels_map = {name: idx for idx, name in enumerate(categories)}

        print(f"[Reconstructor] Split   : {split}")
        print(f"[Reconstructor] Samples : {len(self.file_names)}")
        print(f"[Reconstructor] Root    : {self.file_root}")

    def __len__(self):
        return len(self.file_names)

    def __getitem__(self, index):
        relative_dat = Path(self.file_names[index])

        dat_path = self.split_root / relative_dat
        image_path = dat_path.with_suffix(".png")

        if not dat_path.exists():
            raise FileNotFoundError(f".dat not found: {dat_path}")
        if not image_path.exists():
            raise FileNotFoundError(f".png not found: {image_path}")

        with dat_path.open("rb") as fp:
            data = pickle.load(fp, encoding="latin1")

        if not isinstance(data, np.ndarray):
            raise TypeError(f"Expected numpy.ndarray, got {type(data)}")
        if data.ndim != 2 or data.shape[1] != 6:
            raise ValueError(f"Expected Nx6 .dat array, got {data.shape}")

        points = data[:, :3].astype(np.float32) - self.mesh_pos
        normals = data[:, 3:6].astype(np.float32)

        image = Image.open(image_path).convert("RGB")
        image = image.resize(
            (config.IMG_SIZE, config.IMG_SIZE),
            Image.Resampling.BILINEAR
        )

        image_np = np.asarray(image, dtype=np.float32) / 255.0
        image_tensor = torch.from_numpy(
            np.transpose(image_np, (2, 0, 1))
        )

        images = (
            self.image_normalize(image_tensor)
            if self.normalization
            else image_tensor
        )

        parts = relative_dat.parts
        label = parts[2]

        return {
            "images": images,
            "images_orig": image_tensor,
            "points": torch.from_numpy(points),
            "normals": torch.from_numpy(normals),
            "labels": self.labels_map[label],
            "filename": str(relative_dat),
            "length": len(points),
        }


def get_reconstructor_collate(num_points):
    def collate(batch):
        if len(batch) > 1:
            lengths = [item["length"] for item in batch]

            if len(set(lengths)) > 1:
                points_orig = []
                normals_orig = []

                for item in batch:
                    points = item["points"].numpy()
                    normals = item["normals"].numpy()
                    length = len(points)

                    choices = np.resize(
                        np.random.permutation(length),
                        num_points
                    )

                    item["points"] = torch.from_numpy(
                        points[choices].astype(np.float32)
                    )
                    item["normals"] = torch.from_numpy(
                        normals[choices].astype(np.float32)
                    )

                    points_orig.append(
                        torch.from_numpy(points.astype(np.float32))
                    )
                    normals_orig.append(
                        torch.from_numpy(normals.astype(np.float32))
                    )

                ret = default_collate(batch)
                ret["points_orig"] = points_orig
                ret["normals_orig"] = normals_orig
                return ret

        ret = default_collate(batch)
        ret["points_orig"] = ret["points"]
        ret["normals_orig"] = ret["normals"]
        return ret

    return collate
