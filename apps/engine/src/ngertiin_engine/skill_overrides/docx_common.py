# MIT License. Shared helpers for the docx skill scripts.
"""Shared helpers: paragraph iteration and run-preserving text replacement."""

from __future__ import annotations


def iter_all_paragraphs(doc, include_headers_footers: bool = True):
    """Yield every paragraph in body, tables (recursively), headers, footers."""
    yield from _iter_container(doc)
    if include_headers_footers:
        for section in doc.sections:
            for part in (
                section.header,
                section.footer,
                section.first_page_header,
                section.first_page_footer,
                section.even_page_header,
                section.even_page_footer,
            ):
                if part is not None:
                    yield from _iter_container(part)


def _iter_container(container):
    yield from container.paragraphs
    for table in container.tables:
        yield from _iter_table(table)


def _iter_table(table):
    for row in table.rows:
        for cell in row.cells:
            yield from cell.paragraphs
            for nested in cell.tables:
                yield from _iter_table(nested)


def iter_part_roots(doc):
    """Yield the XML root of the body plus every header/footer part."""
    yield doc.element.body
    seen = set()
    for section in doc.sections:
        for part in (
            section.header,
            section.footer,
            section.first_page_header,
            section.first_page_footer,
            section.even_page_header,
            section.even_page_footer,
        ):
            if part is not None and id(part._element) not in seen:
                seen.add(id(part._element))
                yield part._element


def replace_in_paragraph(para, old: str, new: str) -> int:
    """Replace each original match once, retaining its first run's formatting.

    Adapted from the pinned Hermes MIT skill. Applying original spans from right
    to left avoids reprocessing inserted text, including when new contains old.
    """
    if not old:
        return 0
    runs = para.runs
    full = "".join(run.text for run in runs)
    matches, offset = [], 0
    while (start := full.find(old, offset)) >= 0:
        matches.append((start, start + len(old)))
        offset = start + len(old)
    positions, offset = [], 0
    for run in runs:
        positions.append((offset, offset + len(run.text)))
        offset += len(run.text)
    for start, end in reversed(matches):
        first = True
        for run, (left, right) in zip(runs, positions):
            if right <= start or left >= end:
                continue
            begin, stop = max(start, left) - left, min(end, right) - left
            run.text = run.text[:begin] + (new if first else "") + run.text[stop:]
            first = False
    return len(matches)
