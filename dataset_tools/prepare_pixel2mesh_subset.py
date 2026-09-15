from pathlib import Path
import csv
import random
import shutil
from collections import defaultdict

# ============================================================
# Pixel2Mesh subset builder
# Target: ~3000 TRAIN + ~1000 TEST unique objects
# Train/Test object overlap = 0
# ============================================================

DATASET_ROOT = Path(
    r"C:\Pixel2MeshData\dataset\ShapeNetP2M"
)

TRAIN_LIST = Path(
    r"C:\Users\kalas\OneDrive\Desktop\3D-Reconstruct OJT\Pixel2Mesh\datasets\data\shapenet\meta\train_Original_list.txt"
)

TEST_LIST = Path(
    r"C:\Users\kalas\OneDrive\Desktop\3D-Reconstruct OJT\Pixel2Mesh\datasets\data\shapenet\meta\test_Original_list.txt"
)

OUTPUT_ROOT = Path(
    r"C:\Users\kalas\OneDrive\Desktop\3D-Reconstruct OJT\Pixel2Mesh\datasets\data\shapenet\small"
)

TARGET_TRAIN = 3000
TARGET_TEST = 1000
RANDOM_SEED = 42

CATEGORIES = [
    "02691156",
    "02828884",
    "02933112",
    "02958343",
    "03001627",
    "03211117",
    "03636649",
    "03691459",
    "04090263",
    "04256520",
    "04379243",
    "04401088",
    "04530566",
]


def parse_list(path):
    """
    Read a Pixel2Mesh list and return:
        category_id -> unique object IDs
    """
    by_category = defaultdict(set)

    if not path.exists():
        raise FileNotFoundError(f"File not found:\n{path}")

    with path.open(
        "r",
        encoding="utf-8",
        errors="ignore"
    ) as f:

        for raw_line in f:
            line = raw_line.strip().replace("\\", "/")

            if not line:
                continue

            parts = line.split("/")

            try:
                index = parts.index("ShapeNetP2M")
            except ValueError:
                continue

            if len(parts) <= index + 2:
                continue

            category = parts[index + 1]
            object_id = parts[index + 2]

            if category in CATEGORIES:
                by_category[category].add(object_id)

    return {
        category: sorted(by_category[category])
        for category in CATEGORIES
    }


def make_balanced_quota(total):
    """
    Distribute total objects as evenly as possible
    across 13 categories.
    """
    base, remainder = divmod(
        total,
        len(CATEGORIES)
    )

    return {
        category: base + (1 if i < remainder else 0)
        for i, category in enumerate(CATEGORIES)
    }


def print_available_counts(name, data):
    print(f"\n{name} unique-object counts:")

    for category in CATEGORIES:
        print(
            f"  {category}: "
            f"{len(data[category])}"
        )


def write_list(output_path, selected):
    """
    Write 5 views per selected object.
    """
    output_path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    entries = 0

    with output_path.open(
        "w",
        encoding="utf-8",
        newline="\n"
    ) as f:

        for category in CATEGORIES:
            for object_id in selected[category]:

                for view in range(5):

                    f.write(
                        "Data/ShapeNetP2M/"
                        f"{category}/"
                        f"{object_id}/"
                        f"rendering/"
                        f"{view:02d}.dat\n"
                    )

                    entries += 1

    return entries


def copy_objects(selected, split):
    """
    Copy selected object directories from the full dataset
    into the reduced dataset.
    """

    total = sum(
        len(objects)
        for objects in selected.values()
    )

    completed = 0

    for category in CATEGORIES:

        for object_id in selected[category]:

            source = (
                DATASET_ROOT
                / category
                / object_id
            )

            destination = (
                OUTPUT_ROOT
                / split
                / "Data"
                / "ShapeNetP2M"
                / category
                / object_id
            )

            if not source.is_dir():
                raise FileNotFoundError(
                    f"Object directory missing:\n{source}"
                )

            destination.parent.mkdir(
                parents=True,
                exist_ok=True
            )

            if not destination.exists():
                shutil.copytree(
                    source,
                    destination
                )

            completed += 1

            if (
                completed % 100 == 0
                or completed == total
            ):
                print(
                    f"  {split}: "
                    f"{completed}/{total}"
                )


def write_metadata(
    output_path,
    train_selected,
    test_selected
):

    with output_path.open(
        "w",
        encoding="utf-8",
        newline=""
    ) as f:

        writer = csv.writer(f)

        writer.writerow([
            "split",
            "category_id",
            "object_id",
            "views"
        ])

        for split, selected in [
            ("train", train_selected),
            ("test", test_selected)
        ]:

            for category in CATEGORIES:

                for object_id in selected[category]:

                    writer.writerow([
                        split,
                        category,
                        object_id,
                        5
                    ])


def main():

    print("Reading ORIGINAL FULL Pixel2Mesh lists...\n")

    print(f"TRAIN LIST:\n{TRAIN_LIST}")
    print(f"TEST LIST:\n{TEST_LIST}")

    # --------------------------------------------------------
    # Read lists
    # --------------------------------------------------------

    train_available = parse_list(
        TRAIN_LIST
    )

    test_available = parse_list(
        TEST_LIST
    )

    # --------------------------------------------------------
    # Show actual counts BEFORE selection
    # --------------------------------------------------------

    print_available_counts(
        "TRAIN",
        train_available
    )

    print_available_counts(
        "TEST",
        test_available
    )

    # --------------------------------------------------------
    # Quotas
    # --------------------------------------------------------

    train_quota = make_balanced_quota(
        TARGET_TRAIN
    )

    test_quota = make_balanced_quota(
        TARGET_TEST
    )

    print("\nTrain quotas:")
    print(train_quota)

    print("\nTest quotas:")
    print(test_quota)

    # --------------------------------------------------------
    # Random but reproducible selection
    # --------------------------------------------------------

    rng = random.Random(
        RANDOM_SEED
    )

    train_selected = {}
    test_selected = {}

    # --------------------------------------------------------
    # TRAIN selection
    # --------------------------------------------------------

    for category in CATEGORIES:

        available = train_available[
            category
        ].copy()

        required = train_quota[
            category
        ]

        if len(available) < required:

            raise RuntimeError(
                f"\nNOT ENOUGH TRAIN OBJECTS\n"
                f"Category: {category}\n"
                f"Required: {required}\n"
                f"Found: {len(available)}\n"
                f"File used: {TRAIN_LIST}"
            )

        rng.shuffle(available)

        train_selected[
            category
        ] = sorted(
            available[:required]
        )

    # --------------------------------------------------------
    # TEST selection
    # --------------------------------------------------------
    # Never select a test object that is also in TRAIN.
    # --------------------------------------------------------

    for category in CATEGORIES:

        train_ids = set(
            train_selected[category]
        )

        candidates = [
            object_id
            for object_id
            in test_available[category]
            if object_id not in train_ids
        ]

        required = test_quota[
            category
        ]

        if len(candidates) < required:

            raise RuntimeError(
                f"\nNOT ENOUGH LEAKAGE-FREE TEST OBJECTS\n"
                f"Category: {category}\n"
                f"Required: {required}\n"
                f"Found: {len(candidates)}\n"
            )

        rng.shuffle(candidates)

        test_selected[
            category
        ] = sorted(
            candidates[:required]
        )

    # --------------------------------------------------------
    # Leakage check
    # --------------------------------------------------------

    train_pairs = {
        (category, object_id)
        for category in CATEGORIES
        for object_id in train_selected[category]
    }

    test_pairs = {
        (category, object_id)
        for category in CATEGORIES
        for object_id in test_selected[category]
    }

    overlap = train_pairs & test_pairs

    if overlap:

        raise RuntimeError(
            f"TRAIN/TEST LEAKAGE DETECTED: "
            f"{len(overlap)} objects"
        )

    # --------------------------------------------------------
    # Print selection result
    # --------------------------------------------------------

    print("\n========================================")
    print("SELECTION SUCCESSFUL")
    print("========================================")

    print(
        f"Train unique objects: "
        f"{len(train_pairs)}"
    )

    print(
        f"Test unique objects:  "
        f"{len(test_pairs)}"
    )

    print(
        f"Total unique objects: "
        f"{len(train_pairs) + len(test_pairs)}"
    )

    print(
        f"Train/Test overlap: "
        f"{len(overlap)}"
    )

    # --------------------------------------------------------
    # Create output directories
    # --------------------------------------------------------

    train_output = (
        OUTPUT_ROOT / "train"
    )

    test_output = (
        OUTPUT_ROOT / "test"
    )

    train_output.mkdir(
        parents=True,
        exist_ok=True
    )

    test_output.mkdir(
        parents=True,
        exist_ok=True
    )

    # --------------------------------------------------------
    # Copy actual object data
    # --------------------------------------------------------

    print("\nCopying TRAIN objects...")

    copy_objects(
        train_selected,
        "train"
    )

    print("\nCopying TEST objects...")

    copy_objects(
        test_selected,
        "test"
    )

    # --------------------------------------------------------
    # Write selected list files
    # --------------------------------------------------------

    train_entries = write_list(
        OUTPUT_ROOT / "train_list.txt",
        train_selected
    )

    test_entries = write_list(
        OUTPUT_ROOT / "test_list.txt",
        test_selected
    )

    # --------------------------------------------------------
    # Metadata
    # --------------------------------------------------------

    write_metadata(
        OUTPUT_ROOT / "metadata.csv",
        train_selected,
        test_selected
    )

    # --------------------------------------------------------
    # Report
    # --------------------------------------------------------

    report_path = (
        OUTPUT_ROOT
        / "subset_report.txt"
    )

    with report_path.open(
        "w",
        encoding="utf-8"
    ) as f:

        f.write(
            "Pixel2Mesh Reduced Dataset\n"
        )
        f.write(
            "==========================\n\n"
        )

        f.write(
            f"Train objects: "
            f"{len(train_pairs)}\n"
        )

        f.write(
            f"Test objects: "
            f"{len(test_pairs)}\n"
        )

        f.write(
            f"Total objects: "
            f"{len(train_pairs) + len(test_pairs)}\n"
        )

        f.write(
            f"Train list entries: "
            f"{train_entries}\n"
        )

        f.write(
            f"Test list entries: "
            f"{test_entries}\n"
        )

        f.write(
            "Train/Test overlap: 0\n\n"
        )

        f.write(
            "Category distribution:\n"
        )

        for category in CATEGORIES:

            f.write(
                f"{category}: "
                f"train="
                f"{len(train_selected[category])}, "
                f"test="
                f"{len(test_selected[category])}\n"
            )

    # --------------------------------------------------------
    # Final output
    # --------------------------------------------------------

    print("\n========================================")
    print("DONE")
    print("========================================")

    print(
        f"Output folder:\n{OUTPUT_ROOT}"
    )

    print(
        f"\nTrain objects: "
        f"{len(train_pairs)}"
    )

    print(
        f"Test objects: "
        f"{len(test_pairs)}"
    )

    print(
        f"Train/Test overlap: "
        f"{len(overlap)}"
    )

    print(
        f"\nTrain list entries: "
        f"{train_entries}"
    )

    print(
        f"Test list entries: "
        f"{test_entries}"
    )


if __name__ == "__main__":
    main()
