from pathlib import Path
import csv
import random
import shutil
from collections import defaultdict


# ============================================================
# Pixel2Mesh Incremental Dataset Expander
#
# EXISTING DATASET:
#   3000 TRAIN + 1000 TEST
#
# FINAL DATASET:
#   5200 TRAIN + 1300 TEST
#
# PER CATEGORY:
#   400 TRAIN
#   100 TEST
#
# IMPORTANT:
#   - Existing objects are preserved.
#   - Existing objects are NEVER selected again.
#   - Only new/unused objects are copied from the original
#     full Pixel2Mesh dataset.
#   - Existing train_list.txt and test_list.txt are replaced
#     with the FINAL complete lists.
#   - No new list filenames are created.
#   - Train/Test overlap is checked.
#   - Existing destination objects are never overwritten.
# ============================================================


# ------------------------------------------------------------
# ORIGINAL FULL DATASET
# ------------------------------------------------------------

DATASET_ROOT = Path(
    r"C:\Pixel2MeshData\dataset\ShapeNetP2M"
)


# ------------------------------------------------------------
# ORIGINAL FULL Pixel2Mesh LISTS
# These are the source lists containing all available objects.
# ------------------------------------------------------------

TRAIN_LIST_ORIGINAL = Path(
    r"C:\Users\kalas\OneDrive\Desktop\3D-Reconstruct OJT\Pixel2Mesh\datasets\data\shapenet\meta\train_Original_list.txt"
)

TEST_LIST_ORIGINAL = Path(
    r"C:\Users\kalas\OneDrive\Desktop\3D-Reconstruct OJT\Pixel2Mesh\datasets\data\shapenet\meta\test_Original_list.txt"
)


# ------------------------------------------------------------
# CURRENT / FINAL WORKING DATASET
#
# IMPORTANT:
# This is intentionally outside OneDrive.
# ------------------------------------------------------------

OUTPUT_ROOT = Path(
    r"C:\Pixel2MeshData\reconstructor_dataset"
)


# ------------------------------------------------------------
# SAME LIST FILENAMES
# These will contain the FINAL complete lists.
# ------------------------------------------------------------

TRAIN_LIST_OUT = (
    OUTPUT_ROOT / "train_list.txt"
)

TEST_LIST_OUT = (
    OUTPUT_ROOT / "test_list.txt"
)


# ------------------------------------------------------------
# FINAL TARGET PER CATEGORY
#
# 13 categories × 400 = 5200 TRAIN
# 13 categories × 100 = 1300 TEST
# ------------------------------------------------------------

TARGET_TRAIN_PER_CATEGORY = 400
TARGET_TEST_PER_CATEGORY = 100


# ------------------------------------------------------------
# Fixed random seed for reproducible selection
# ------------------------------------------------------------

RANDOM_SEED = 42


# ------------------------------------------------------------
# Pixel2Mesh / ShapeNet categories
# ------------------------------------------------------------

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


# ============================================================
# PARSE ORIGINAL LIST
# ============================================================

def parse_list(path):
    """
    Read an original Pixel2Mesh list.

    Returns:
        {
            category_id: set(object_ids)
        }

    Only unique object IDs are stored.
    """

    by_category = defaultdict(set)

    if not path.exists():
        raise FileNotFoundError(
            f"\nFile not found:\n{path}"
        )

    with path.open(
        "r",
        encoding="utf-8",
        errors="ignore"
    ) as f:

        for raw_line in f:

            line = (
                raw_line
                .strip()
                .replace("\\", "/")
            )

            if not line:
                continue

            parts = line.split("/")

            try:
                index = parts.index(
                    "ShapeNetP2M"
                )
            except ValueError:
                continue

            if len(parts) <= index + 2:
                continue

            category = parts[index + 1]
            object_id = parts[index + 2]

            if category in CATEGORIES:
                by_category[category].add(
                    object_id
                )

    return {
        category: set(
            by_category[category]
        )
        for category in CATEGORIES
    }


# ============================================================
# SCAN EXISTING WORKING DATASET
# ============================================================

def scan_existing_split(split):
    """
    Scan the currently prepared dataset.

    Expected structure:

        OUTPUT_ROOT/
            train/
                Data/
                    ShapeNetP2M/
                        category/
                            object_id/

    Returns:
        {
            category_id: set(existing_object_ids)
        }
    """

    result = defaultdict(set)

    root = (
        OUTPUT_ROOT
        / split
        / "Data"
        / "ShapeNetP2M"
    )

    if not root.exists():

        return {
            category: set()
            for category in CATEGORIES
        }

    for category in CATEGORIES:

        category_dir = (
            root / category
        )

        if not category_dir.exists():
            continue

        for item in category_dir.iterdir():

            if item.is_dir():
                result[category].add(
                    item.name
                )

    return {
        category: set(
            result[category]
        )
        for category in CATEGORIES
    }


# ============================================================
# COPY ONE OBJECT
# ============================================================

def copy_object(
    category,
    object_id,
    split
):
    """
    Copy one complete object directory
    from the original dataset.

    Safety:
        Existing destination objects are NEVER
        overwritten.
    """

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
            f"\nSource object directory missing:\n"
            f"{source}"
        )

    destination.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    if destination.exists():

        raise RuntimeError(
            "\nSAFETY STOP: destination object "
            "already exists.\n"
            "The script will not overwrite it.\n\n"
            f"{destination}"
        )

    shutil.copytree(
        source,
        destination
    )


# ============================================================
# WRITE FINAL TRAIN / TEST LIST
# ============================================================

def write_list(
    output_path,
    selected
):
    """
    Write the complete FINAL list.

    Every selected object contributes 5 views:

        00.dat
        01.dat
        02.dat
        03.dat
        04.dat
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

            for object_id in sorted(
                selected[category]
            ):

                for view in range(5):

                    f.write(
                        "Data/ShapeNetP2M/"
                        f"{category}/"
                        f"{object_id}/"
                        "rendering/"
                        f"{view:02d}.dat\n"
                    )

                    entries += 1

    return entries


# ============================================================
# WRITE METADATA
# ============================================================

def write_metadata(
    output_path,
    train_selected,
    test_selected
):
    """
    Write one metadata row per unique object.
    """

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

                for object_id in sorted(
                    selected[category]
                ):

                    writer.writerow([
                        split,
                        category,
                        object_id,
                        5
                    ])


# ============================================================
# WRITE FINAL REPORT
# ============================================================

def write_report(
    output_path,
    train_selected,
    test_selected,
    train_entries,
    test_entries,
    overlap
):
    """
    Write a human-readable dataset report.
    """

    train_total = sum(
        len(train_selected[category])
        for category in CATEGORIES
    )

    test_total = sum(
        len(test_selected[category])
        for category in CATEGORIES
    )

    with output_path.open(
        "w",
        encoding="utf-8"
    ) as f:

        f.write(
            "Pixel2Mesh Expanded Dataset\n"
        )

        f.write(
            "===========================\n\n"
        )

        f.write(
            f"Train objects: {train_total}\n"
        )

        f.write(
            f"Test objects: {test_total}\n"
        )

        f.write(
            f"Total unique objects: "
            f"{train_total + test_total}\n"
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
            f"Train/Test overlap: "
            f"{len(overlap)}\n\n"
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


# ============================================================
# MAIN
# ============================================================

def main():

    print("\n" + "=" * 70)
    print("PIXEL2MESH INCREMENTAL DATASET EXPANSION")
    print("=" * 70)

    print(
        f"\nOriginal dataset:\n"
        f"{DATASET_ROOT}"
    )

    print(
        f"\nWorking dataset:\n"
        f"{OUTPUT_ROOT}"
    )


    # ========================================================
    # PATH VALIDATION
    # ========================================================

    if not DATASET_ROOT.exists():

        raise FileNotFoundError(
            "\nOriginal Pixel2Mesh dataset does not exist:\n"
            f"{DATASET_ROOT}"
        )

    if not OUTPUT_ROOT.exists():

        raise FileNotFoundError(
            "\nCurrent working dataset does not exist:\n"
            f"{OUTPUT_ROOT}"
        )

    if not TRAIN_LIST_ORIGINAL.exists():

        raise FileNotFoundError(
            "\nOriginal TRAIN list does not exist:\n"
            f"{TRAIN_LIST_ORIGINAL}"
        )

    if not TEST_LIST_ORIGINAL.exists():

        raise FileNotFoundError(
            "\nOriginal TEST list does not exist:\n"
            f"{TEST_LIST_ORIGINAL}"
        )


    # ========================================================
    # READ ORIGINAL FULL LISTS
    # ========================================================

    print(
        "\nReading original TRAIN list..."
    )

    original_train = parse_list(
        TRAIN_LIST_ORIGINAL
    )

    print(
        "Reading original TEST list..."
    )

    original_test = parse_list(
        TEST_LIST_ORIGINAL
    )


    # ========================================================
    # READ CURRENT EXISTING OBJECTS
    # ========================================================

    print(
        "\nScanning existing TRAIN objects..."
    )

    existing_train = scan_existing_split(
        "train"
    )

    print(
        "Scanning existing TEST objects..."
    )

    existing_test = scan_existing_split(
        "test"
    )


    existing_train_total = sum(
        len(existing_train[category])
        for category in CATEGORIES
    )

    existing_test_total = sum(
        len(existing_test[category])
        for category in CATEGORIES
    )


    # ========================================================
    # PRINT CURRENT COUNTS
    # ========================================================

    print(
        "\nCurrent dataset:"
    )

    print(
        f"  TRAIN: {existing_train_total}"
    )

    print(
        f"  TEST:  {existing_test_total}"
    )

    print(
        f"  TOTAL: "
        f"{existing_train_total + existing_test_total}"
    )


    print(
        "\nCurrent TRAIN distribution:"
    )

    for category in CATEGORIES:

        print(
            f"  {category}: "
            f"{len(existing_train[category])}"
        )


    print(
        "\nCurrent TEST distribution:"
    )

    for category in CATEGORIES:

        print(
            f"  {category}: "
            f"{len(existing_test[category])}"
        )


    # ========================================================
    # INITIAL OVERLAP CHECK
    # ========================================================

    existing_train_pairs = {
        (category, object_id)
        for category in CATEGORIES
        for object_id in existing_train[category]
    }

    existing_test_pairs = {
        (category, object_id)
        for category in CATEGORIES
        for object_id in existing_test[category]
    }

    initial_overlap = (
        existing_train_pairs
        &
        existing_test_pairs
    )

    if initial_overlap:

        raise RuntimeError(
            "\nExisting TRAIN/TEST overlap detected!\n"
            f"Overlap count: {len(initial_overlap)}\n"
            "Expansion has been stopped."
        )


    # ========================================================
    # START FINAL SELECTION WITH EXISTING OBJECTS
    # ========================================================

    final_train = {
        category: set(
            existing_train[category]
        )
        for category in CATEGORIES
    }

    final_test = {
        category: set(
            existing_test[category]
        )
        for category in CATEGORIES
    }


    # ========================================================
    # GLOBAL USED-ID SET
    #
    # IMPORTANT:
    # Existing train + existing test objects
    # can NEVER be selected again.
    # ========================================================

    already_used = {
        category:
        (
            existing_train[category]
            |
            existing_test[category]
        )
        for category in CATEGORIES
    }


    # ========================================================
    # REPRODUCIBLE RANDOM SELECTION
    # ========================================================

    rng = random.Random(
        RANDOM_SEED
    )


    # ========================================================
    # ADD NEW TRAIN OBJECTS
    # ========================================================

    print(
        "\n" + "-" * 70
    )

    print(
        "ADDING NEW TRAIN OBJECTS"
    )

    print(
        "-" * 70
    )

    total_new_train = 0


    for category in CATEGORIES:

        current_count = len(
            final_train[category]
        )

        needed = (
            TARGET_TRAIN_PER_CATEGORY
            -
            current_count
        )


        if needed < 0:

            raise RuntimeError(
                f"\nCategory {category} already has "
                f"{current_count} TRAIN objects.\n"
                f"Target is only "
                f"{TARGET_TRAIN_PER_CATEGORY}."
            )


        if needed == 0:

            print(
                f"  {category}: "
                f"already complete "
                f"({current_count})"
            )

            continue


        # ----------------------------------------------------
        # ONLY UNUSED TRAIN OBJECTS
        # ----------------------------------------------------

        candidates = sorted(
            original_train[category]
            -
            already_used[category]
        )


        if len(candidates) < needed:

            raise RuntimeError(
                "\nNOT ENOUGH UNUSED TRAIN OBJECTS\n"
                f"Category: {category}\n"
                f"Required new objects: {needed}\n"
                f"Available unused objects: "
                f"{len(candidates)}"
            )


        rng.shuffle(candidates)

        additions = candidates[
            :needed
        ]


        # ----------------------------------------------------
        # Copy only genuinely NEW objects
        # ----------------------------------------------------

        for object_id in additions:

            copy_object(
                category,
                object_id,
                "train"
            )


        final_train[category].update(
            additions
        )

        already_used[category].update(
            additions
        )

        total_new_train += len(
            additions
        )


        print(
            f"  {category}: "
            f"{current_count} -> "
            f"{len(final_train[category])} "
            f"(added {len(additions)})"
        )


    # ========================================================
    # ADD NEW TEST OBJECTS
    #
    # IMPORTANT:
    # already_used already contains ALL existing
    # objects + newly added TRAIN objects.
    # ========================================================

    print(
        "\n" + "-" * 70
    )

    print(
        "ADDING NEW TEST OBJECTS"
    )

    print(
        "-" * 70
    )

    total_new_test = 0


    for category in CATEGORIES:

        current_count = len(
            final_test[category]
        )

        needed = (
            TARGET_TEST_PER_CATEGORY
            -
            current_count
        )


        if needed < 0:

            raise RuntimeError(
                f"\nCategory {category} already has "
                f"{current_count} TEST objects.\n"
                f"Target is only "
                f"{TARGET_TEST_PER_CATEGORY}."
            )


        if needed == 0:

            print(
                f"  {category}: "
                f"already complete "
                f"({current_count})"
            )

            continue


        # ----------------------------------------------------
        # ONLY UNUSED TEST OBJECTS
        #
        # This also excludes newly added TRAIN objects.
        # ----------------------------------------------------

        candidates = sorted(
            original_test[category]
            -
            already_used[category]
        )


        if len(candidates) < needed:

            raise RuntimeError(
                "\nNOT ENOUGH UNUSED TEST OBJECTS\n"
                f"Category: {category}\n"
                f"Required new objects: {needed}\n"
                f"Available unused objects: "
                f"{len(candidates)}"
            )


        rng.shuffle(candidates)

        additions = candidates[
            :needed
        ]


        # ----------------------------------------------------
        # Copy only genuinely NEW objects
        # ----------------------------------------------------

        for object_id in additions:

            copy_object(
                category,
                object_id,
                "test"
            )


        final_test[category].update(
            additions
        )

        already_used[category].update(
            additions
        )

        total_new_test += len(
            additions
        )


        print(
            f"  {category}: "
            f"{current_count} -> "
            f"{len(final_test[category])} "
            f"(added {len(additions)})"
        )


    # ========================================================
    # FINAL TRAIN / TEST OBJECT SETS
    # ========================================================

    final_train_pairs = {
        (category, object_id)
        for category in CATEGORIES
        for object_id in final_train[category]
    }

    final_test_pairs = {
        (category, object_id)
        for category in CATEGORIES
        for object_id in final_test[category]
    }


    # ========================================================
    # FINAL LEAKAGE CHECK
    # ========================================================

    overlap = (
        final_train_pairs
        &
        final_test_pairs
    )


    if overlap:

        raise RuntimeError(
            "\nFINAL TRAIN/TEST LEAKAGE DETECTED!\n"
            f"Overlap count: {len(overlap)}"
        )


    # ========================================================
    # FINAL CATEGORY COUNT CHECK
    # ========================================================

    for category in CATEGORIES:

        train_count = len(
            final_train[category]
        )

        test_count = len(
            final_test[category]
        )


        if train_count != TARGET_TRAIN_PER_CATEGORY:

            raise RuntimeError(
                "\nFINAL TRAIN CATEGORY COUNT ERROR\n"
                f"Category: {category}\n"
                f"Expected: "
                f"{TARGET_TRAIN_PER_CATEGORY}\n"
                f"Found: {train_count}"
            )


        if test_count != TARGET_TEST_PER_CATEGORY:

            raise RuntimeError(
                "\nFINAL TEST CATEGORY COUNT ERROR\n"
                f"Category: {category}\n"
                f"Expected: "
                f"{TARGET_TEST_PER_CATEGORY}\n"
                f"Found: {test_count}"
            )


    # ========================================================
    # FINAL TOTAL COUNT CHECK
    # ========================================================

    final_train_total = len(
        final_train_pairs
    )

    final_test_total = len(
        final_test_pairs
    )


    expected_train_total = (
        TARGET_TRAIN_PER_CATEGORY
        *
        len(CATEGORIES)
    )

    expected_test_total = (
        TARGET_TEST_PER_CATEGORY
        *
        len(CATEGORIES)
    )


    if final_train_total != expected_train_total:

        raise RuntimeError(
            "\nFINAL TRAIN TOTAL IS WRONG\n"
            f"Expected: {expected_train_total}\n"
            f"Found: {final_train_total}"
        )


    if final_test_total != expected_test_total:

        raise RuntimeError(
            "\nFINAL TEST TOTAL IS WRONG\n"
            f"Expected: {expected_test_total}\n"
            f"Found: {final_test_total}"
        )


    # ========================================================
    # WRITE THE SAME LIST FILES
    # ========================================================

    print(
        "\nWriting final train_list.txt..."
    )

    train_entries = write_list(
        TRAIN_LIST_OUT,
        final_train
    )


    print(
        "Writing final test_list.txt..."
    )

    test_entries = write_list(
        TEST_LIST_OUT,
        final_test
    )


    # ========================================================
    # WRITE METADATA
    # ========================================================

    print(
        "Writing metadata.csv..."
    )

    write_metadata(
        OUTPUT_ROOT / "metadata.csv",
        final_train,
        final_test
    )


    # ========================================================
    # WRITE REPORT
    # ========================================================

    print(
        "Writing subset_report.txt..."
    )

    write_report(
        OUTPUT_ROOT / "subset_report.txt",
        final_train,
        final_test,
        train_entries,
        test_entries,
        overlap
    )


    # ========================================================
    # FINAL OUTPUT
    # ========================================================

    print(
        "\n" + "=" * 70
    )

    print(
        "EXPANSION SUCCESSFUL"
    )

    print(
        "=" * 70
    )

    print(
        f"\nExisting TRAIN objects: "
        f"{existing_train_total}"
    )

    print(
        f"New TRAIN objects added: "
        f"{total_new_train}"
    )

    print(
        f"Final TRAIN objects: "
        f"{final_train_total}"
    )


    print(
        f"\nExisting TEST objects: "
        f"{existing_test_total}"
    )

    print(
        f"New TEST objects added: "
        f"{total_new_test}"
    )

    print(
        f"Final TEST objects: "
        f"{final_test_total}"
    )


    print(
        f"\nTOTAL unique objects: "
        f"{final_train_total + final_test_total}"
    )


    print(
        f"TRAIN/TEST overlap: "
        f"{len(overlap)}"
    )


    print(
        f"\nTRAIN list entries: "
        f"{train_entries}"
    )

    print(
        f"TEST list entries: "
        f"{test_entries}"
    )


    print(
        f"\nFinal dataset:\n"
        f"{OUTPUT_ROOT}"
    )


    print(
        "\nOriginal source dataset was NOT deleted."
    )

    print(
        "Expansion completed successfully."
    )


if __name__ == "__main__":
    main()