"""Deterministic checks establish structure and references, not pedagogical truth."""

import re
from collections.abc import Iterable

from pydantic import Field

from ngertiin.content.answer_keys import key_problems, normalized_text
from ngertiin.content.contracts import CourseBlueprint, NodeBlueprint, NodePacket, fingerprint
from ngertiin.content.questions import (
    Contract,
    MultipleChoice,
    Ordering,
    Question,
    ShortAnswer,
    Text,
    TrueFalse,
    WordBank,
)


class Issue(Contract):
    code: Text = Field(description="Stable machine-readable rule code.")
    path: Text = Field(description="Affected field/slot, safe for repair targeting.")
    message: Text = Field(
        description="Concrete structural failure; never a semantic quality claim."
    )


def issue(code: str, path: str, message: str) -> Issue:
    return Issue(code=code, path=path, message=message)


def references(values: list[str], allowed: Iterable[str], path: str) -> list[Issue]:
    errors = []
    if len(values) != len(set(values)):
        errors.append(issue("DUPLICATE_REFERENCE", path, "IDs must be unique."))
    if unknown := set(values) - set(allowed):
        errors.append(issue("UNKNOWN_REFERENCE", path, f"Unknown IDs: {sorted(unknown)}"))
    return errors


def check_blueprint(plan: NodeBlueprint, evidence_ids: Iterable[str]) -> list[Issue]:
    evidence_ids = set(evidence_ids)
    errors = []
    criteria = [c.id for c in plan.criteria]
    slots = [s.id for s in plan.lessons] + [s.id for s in plan.questions]
    if len(criteria) != len(set(criteria)) or len(slots) != len(set(slots)):
        errors.append(
            issue("DUPLICATE_ID", "blueprint", "Criterion and activity IDs must be unique.")
        )
    earlier: set[str] = set()
    for lesson in plan.lessons:
        path = f"blueprint.lessons.{lesson.id}"
        errors += references(lesson.criterion_ids, criteria, f"{path}.criterion_ids")
        errors += references(lesson.evidence_ids, evidence_ids, f"{path}.evidence_ids")
        errors += references(lesson.depends_on, earlier, f"{path}.depends_on")
        earlier.add(lesson.id)
    for question in plan.questions:
        errors += references(question.criterion_ids, criteria, f"blueprint.questions.{question.id}")
    coverage_sets = {
        "teaching": {c for slot in plan.lessons for c in slot.criterion_ids},
        "assessment": {c for slot in plan.questions for c in slot.criterion_ids},
    }
    for field, covered in coverage_sets.items():
        if missing := set(criteria) - covered:
            errors.append(issue("CRITERION_UNMAPPED", f"blueprint.{field}", str(sorted(missing))))
    if (
        len({q.type for q in plan.questions}) < 3
        or sum(q.type == "true_false" for q in plan.questions) > 1
    ):
        errors.append(
            issue("QUESTION_DIVERSITY", "blueprint.questions", "Need 3 types and ≤1 T/F.")
        )
    if not {"relationship", "application"} <= {q.demand for q in plan.questions}:
        errors.append(
            issue("COGNITIVE_COVERAGE", "blueprint.questions", "Reason and apply required.")
        )
    return errors


def check_course(course: CourseBlueprint, evidence_ids: Iterable[str]) -> list[Issue]:
    evidence_ids = set(evidence_ids)
    errors = []
    earlier: set[str] = set()
    activity_ids: set[str] = set()
    for node in course.nodes:
        plan = node.blueprint
        if plan.id in earlier:
            errors.append(issue("DUPLICATE_ID", "course.nodes", plan.id))
        errors += references(node.depends_on_nodes, earlier, f"course.nodes.{plan.id}.depends_on")
        errors += check_blueprint(plan, evidence_ids)
        for slot_id in [s.id for s in plan.lessons] + [s.id for s in plan.questions]:
            if slot_id in activity_ids:
                errors.append(issue("DUPLICATE_ID", "course.activities", slot_id))
            activity_ids.add(slot_id)
        earlier.add(plan.id)
    return errors


def check_lesson(packet: NodePacket, lesson_id: str) -> list[Issue]:
    lesson = next((x for x in packet.lessons if x.id == lesson_id), None)
    spec = next((x for x in packet.blueprint.lessons if x.id == lesson_id), None)
    path = f"lessons.{lesson_id}"
    if lesson is None or spec is None:
        return [issue("UNKNOWN_LESSON", path, "Lesson must exist in the approved blueprint.")]
    errors = references(lesson.draft.evidence_ids, [e.id for e in packet.evidence], path)
    if set(lesson.draft.evidence_ids) != set(spec.evidence_ids):
        errors.append(issue("EVIDENCE_SET_MISMATCH", path, "Retain the slot's required evidence."))
    if not lesson.draft.body.strip():
        errors.append(issue("EMPTY_LESSON", path, "Whitespace is not teaching content."))
    if re.search(r"</?[a-zA-Z][^>]*>", lesson.draft.body):
        errors.append(issue("RAW_HTML", path, "Standard v1 uses Markdown, without raw HTML."))
    if re.search(r"!\[[^\]]*\]\(", lesson.draft.body):
        errors.append(issue("UNREGISTERED_VISUAL", path, "No unregistered Markdown image assets."))
    return errors


def check_question(question: Question) -> list[Issue]:
    path = f"questions.{question.id}"
    errors = []
    if isinstance(question, MultipleChoice):
        ids = [o.id for o in question.options]
        errors += references([question.correct_option_id], ids, f"{path}.key")
        reason_ids = [r.option_id for r in question.distractor_reasons]
        if set(reason_ids) != set(ids) - {question.correct_option_id} or len(reason_ids) != len(
            set(reason_ids)
        ):
            errors.append(
                issue("DISTRACTOR_KEYS", path, "One reason per incorrect option required.")
            )
        texts = [normalized_text(o.text) for o in question.options]
        if len(ids) != len(set(ids)) or len(texts) != len(set(texts)):
            errors.append(
                issue("DUPLICATE_OPTION", path, "Options must have distinct IDs and text.")
            )
        if any(
            re.fullmatch(
                r"(?:all|none) of the above|semua jawaban benar|tidak ada jawaban yang benar",
                t.rstrip(".!"),
            )
            for t in texts
        ):
            errors.append(
                issue("META_OPTION", path, "Explicit all/none meta-options are prohibited.")
            )
    elif isinstance(question, TrueFalse):
        if len(question.statement.split()) > 25:
            errors.append(issue("STATEMENT_WORD_LIMIT", path, "At most 25 words."))
    elif isinstance(question, ShortAnswer):
        errors += [
            issue(code, f"{path}.key", "Definitive key policy violated.")
            for code in key_problems(question.key)
        ]
    elif isinstance(question, Ordering):
        ids = [i.id for i in question.items]
        if len(ids) != len(set(ids)) or sorted(ids) != sorted(question.correct_order):
            errors.append(issue("ORDERING_PERMUTATION", path, "Key must permute every item once."))
        if ids == question.correct_order:
            errors.append(issue("ORDERING_NOT_SHUFFLED", path, "Display must not reveal the key."))
    elif isinstance(question, WordBank):
        blanks, tokens = [b.id for b in question.blanks], [t.id for t in question.tokens]
        answers = [a.blank_id for a in question.answers]
        used = [a.token_id for a in question.answers]
        if len(blanks) != len(set(blanks)) or len(tokens) != len(set(tokens)):
            errors.append(issue("DUPLICATE_ID", path, "Blank/token IDs must be unique."))
        if sorted(answers) != sorted(blanks) or len(used) != len(set(used)):
            errors.append(
                issue("WORD_BANK_BIJECTION", path, "Fill each blank; use each token at most once.")
            )
        errors += references(used, tokens, f"{path}.answers")
        if len(tokens) - len(blanks) not in (2, 3):
            errors.append(issue("WORD_BANK_DISTRACTORS", path, "Need 2–3 unused distractors."))
        if any(b.text.count("{{blank}}") != 1 for b in question.blanks):
            errors.append(issue("BLANK_MARKER", path, "Exactly one {{blank}} per contextual slot."))
        texts = [normalized_text(t.text) for t in question.tokens]
        if len(texts) != len(set(texts)):
            errors.append(issue("DUPLICATE_TOKEN", path, "Token texts must be distinct."))
    return errors


def check_practice(packet: NodePacket) -> list[Issue]:
    practice = packet.practice
    if practice is None:
        return [issue("MISSING_PRACTICE", "practice", "Practice is not generated yet.")]
    errors = []
    actual = {lesson.id: (lesson.revision, fingerprint(lesson)) for lesson in packet.lessons}
    required = {s.id for s in packet.blueprint.lessons}
    refs = practice.lesson_revisions
    if {r.id for r in refs} != required or len(refs) != len(required) or set(actual) != required:
        errors.append(
            issue(
                "LESSON_SNAPSHOT",
                "practice.lesson_revisions",
                "Need every planned Lesson exactly once.",
            )
        )
    if any(actual.get(ref.id) != (ref.revision, ref.content_hash) for ref in refs):
        errors.append(
            issue("STALE_LESSON_REVISION", "practice.lesson_revisions", "Lesson snapshot changed.")
        )
    specs = {s.id: s for s in packet.blueprint.questions}
    questions = practice.draft.questions
    if {q.id for q in questions} != set(specs) or len(questions) != len(specs):
        errors.append(
            issue("QUESTION_SLOTS", "practice.questions", "Preserve every planned question slot.")
        )
    seen: set[str] = set()
    for question in questions:
        spec = specs.get(question.id)
        if spec and (
            question.type != spec.type or set(question.criterion_ids) != set(spec.criterion_ids)
        ):
            errors.append(
                issue(
                    "QUESTION_PLAN_MISMATCH", f"questions.{question.id}", "Type/criteria changed."
                )
            )
        errors += check_question(question)
        signature = normalized_text(
            question.statement if isinstance(question, TrueFalse) else question.prompt
        )
        if signature in seen:
            errors.append(
                issue("DUPLICATE_QUESTION", f"questions.{question.id}", "Identical question text.")
            )
        seen.add(signature)
    return errors


def check_identities(packet: NodePacket) -> list[Issue]:
    evidence_ids = [e.id for e in packet.evidence]
    if len(evidence_ids) != len(set(evidence_ids)) or len(packet.lessons) != len(
        {x.id for x in packet.lessons}
    ):
        return [issue("DUPLICATE_ID", "packet", "Evidence/Lesson IDs must be unique.")]
    return []


def check_packet(packet: NodePacket, *, complete: bool = False) -> list[Issue]:
    errors = check_identities(packet)
    errors += check_blueprint(packet.blueprint, [e.id for e in packet.evidence])
    for lesson in packet.lessons:
        errors += check_lesson(packet, lesson.id)
    if complete or packet.practice is not None:
        errors += check_practice(packet)
    return errors
