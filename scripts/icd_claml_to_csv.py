#!/usr/bin/env python3
"""
Convert the BfArM ICD-10-GM ClaML/XML systematic directory into a flat CSV,
including the modifier-expanded terminal (endstellige) codes.

Input : the official BfArM ClaML file, e.g.
        icd10gm2026syst_claml_20250912.xml  (in the Klassifikationsdateien folder
        of the icd10gm<year>syst-claml.zip download).
Output: a semicolon-delimited CSV with one row per code:

        code;description;kind;parent;terminal

        - code        ICD code ("E11", "E11.20"), chapter ("I") or block ("A00-A09")
        - description German preferred title (modifier labels appended for expansions)
        - kind        "chapter" | "block" | "category"
        - parent      the SuperClass / originating code
        - terminal    "Y" for billable endstellige codes, "N" otherwise

Why the expansion step matters: in ICD-10-GM ClaML many sub-codes do not exist
as standalone <Class> elements. Instead a <Class> declares one or more
<ModifiedBy> modifiers (e.g. the 4th and 5th digit of E11 Diabetes), and each
option's label lives in a <ModifierClass>. This script applies those modifiers
(their cartesian product) to materialise the real terminal codes such as
E11.20 / E11.90 / I10.90 / J44.99.

Only the standard library is used, so it runs unchanged in Google Colab. The
14 MB file is streamed with iterparse to keep memory low.

Usage:
    python icd_claml_to_csv.py [INPUT.xml] [OUTPUT.csv]
"""
import csv
import sys
from itertools import product
import xml.etree.ElementTree as ET

DEFAULT_INPUT = (
    r"C:\Users\Aya Aidi\Downloads\icd10gm2026syst-claml"
    r"\Klassifikationsdateien\icd10gm2026syst_claml_20250912.xml"
)
DEFAULT_OUTPUT = "icd10gm_full.csv"


def clean(text: str) -> str:
    """Collapse whitespace and strip the delimiter so the simple
    semicolon-split CSV stays unambiguous."""
    return " ".join(text.split()).replace(";", ",").strip()


def preferred_label(el: ET.Element) -> str:
    """German 'preferred' title of a <Class>/<ModifierClass>, with any nested
    elements (e.g. <Reference>) flattened to plain text."""
    label = el.find('./Rubric[@kind="preferred"]/Label')
    return clean("".join(label.itertext())) if label is not None else ""


def collect_modifiers(path: str) -> dict[str, list[tuple[str, str]]]:
    """First pass: map each modifier code to its ordered list of
    (sub-code, label) options, taken from the <ModifierClass> elements."""
    modifiers: dict[str, list[tuple[str, str]]] = {}
    for _evt, el in ET.iterparse(path, events=("end",)):
        if el.tag == "ModifierClass":
            modifiers.setdefault(el.get("modifier", ""), []).append(
                (el.get("code", ""), preferred_label(el))
            )
            el.clear()
    return modifiers


def convert(input_path: str, output_path: str) -> None:
    modifiers = collect_modifiers(input_path)
    counts = {"chapter": 0, "block": 0, "category": 0, "expanded": 0}

    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["code", "description", "kind", "parent", "terminal"])

        # Second pass: stream the <Class> elements.
        for _evt, el in ET.iterparse(input_path, events=("end",)):
            if el.tag != "Class":
                continue

            code = el.get("code", "")
            kind = el.get("kind", "")
            label = preferred_label(el)
            parent = (el.find("./SuperClass").get("code", "")
                      if el.find("./SuperClass") is not None else "")
            modified_by = [m.get("code", "") for m in el.findall("./ModifiedBy")]
            has_subclass = el.find("./SubClass") is not None

            # A class is itself billable only when it is a leaf category that is
            # neither further subdivided nor modified.
            base_terminal = kind == "category" and not modified_by and not has_subclass
            writer.writerow([code, label, kind, parent, "Y" if base_terminal else "N"])
            counts[kind] = counts.get(kind, 0) + 1

            # Materialise the modifier-expanded terminal codes.
            if modified_by:
                option_lists = [modifiers.get(m, []) for m in modified_by]
                for combo in product(*option_lists):
                    sub_code = "".join(opt[0] for opt in combo)
                    sub_labels = [opt[1] for opt in combo if opt[1]]
                    writer.writerow([
                        code + sub_code,
                        ", ".join([label, *sub_labels]),
                        "category",
                        code,
                        "Y",
                    ])
                    counts["expanded"] += 1

            el.clear()

    total = sum(counts.values())
    print(f"Wrote {total} rows to {output_path}")
    print(f"  chapters: {counts['chapter']}  blocks: {counts['block']}  "
          f"base categories: {counts['category']}  "
          f"modifier-expanded terminal codes: {counts['expanded']}")
    print('Filter terminal == "Y" for the billable endstellige codes.')


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INPUT
    dst = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUTPUT
    convert(src, dst)
