"""Host-only receipts and work envelopes; no queue or scheduler implementation."""

from typing import Literal

from pydantic import Field

from ngertiin.content.contracts import LessonRevision, NodePacket, fingerprint
from ngertiin.content.questions import Contract, Identifier, Text, public_question
from ngertiin.content.validation import check_blueprint, check_lesson, check_practice


class WorkItem(Contract):
    generation_id: Identifier = Field(
        description="Host execution ID, separate from chat/thread ID."
    )
    blueprint_hash: str = Field(pattern="^[0-9a-f]{64}$", description="Frozen approved blueprint.")
    kind: Literal["lesson_group", "practice", "review", "repair"] = Field(
        description="Work boundary."
    )
    target_ids: list[Identifier] = Field(min_length=1, description="Host-planned artifact slots.")
    lesson_dependencies: list[LessonRevision] = Field(
        description="Exact required published inputs."
    )
    priority: Literal["first_lesson", "next_lesson", "active_practice", "background"] = Field(
        description="Admission class; first-Lesson review and publish retain foreground priority."
    )
    idempotency_key: Text = Field(
        description="Host key scoped by owner, execution, kind and revisions."
    )


class NodeReadiness(Contract):
    packet_hash: str = Field(
        pattern="^[0-9a-f]{64}$", description="Host binding to the current private packet."
    )
    lesson_ready_ids: list[Identifier] = Field(
        description="Current approved Lesson IDs in plan order."
    )
    practice_ready: bool = Field(
        description="Approved Practice matches every current Lesson snapshot."
    )
    node_content_ready: bool = Field(description="All required Lessons and Practice are available.")


def node_readiness(
    packet: NodePacket,
    published_lessons: list[LessonRevision],
    published_practice: LessonRevision | None,
) -> NodeReadiness:
    """Receipts are issued by #09 only after a ready decision and a revision-checked DB commit."""
    baseline_errors = check_blueprint(packet.blueprint, [e.id for e in packet.evidence])
    lessons = {x.id: x for x in packet.lessons}
    receipts = {x.id: x for x in published_lessons}
    invalid_identities = (
        len(receipts) != len(published_lessons)
        or len(lessons) != len(packet.lessons)
        or len(packet.evidence) != len({e.id for e in packet.evidence})
    )
    ready: list[str] = []
    if not baseline_errors and not invalid_identities:
        for spec in packet.blueprint.lessons:
            lesson, receipt = lessons.get(spec.id), receipts.get(spec.id)
            if (
                lesson is not None
                and receipt is not None
                and receipt.revision == lesson.revision
                and receipt.content_hash == fingerprint(lesson)
                and set(spec.depends_on) <= set(ready)
                and not check_lesson(packet, spec.id)
            ):
                ready.append(spec.id)
    practice = packet.practice
    practice_ready = bool(
        practice is not None
        and published_practice is not None
        and len(ready) == len(packet.blueprint.lessons)
        and published_practice.id == practice.id
        and published_practice.revision == practice.revision
        and published_practice.content_hash == fingerprint(practice)
        and not check_practice(packet)
    )
    return NodeReadiness(
        packet_hash=fingerprint(packet),
        lesson_ready_ids=ready,
        practice_ready=practice_ready,
        node_content_ready=practice_ready,
    )


def public_lesson(packet: NodePacket, lesson_id: str, ready: NodeReadiness) -> dict:
    if ready.packet_hash != fingerprint(packet) or lesson_id not in ready.lesson_ready_ids:
        raise ValueError("Lesson has not been published")
    lesson = next(x for x in packet.lessons if x.id == lesson_id)
    return {
        "id": lesson.id,
        "revision": lesson.revision,
        "title": lesson.draft.title,
        "body": lesson.draft.body,
    }


def public_practice(packet: NodePacket, ready: NodeReadiness) -> dict:
    if (
        ready.packet_hash != fingerprint(packet)
        or not ready.practice_ready
        or packet.practice is None
    ):
        raise ValueError("Practice has not been published")
    practice = packet.practice
    return {
        "id": practice.id,
        "revision": practice.revision,
        "questions": [public_question(q) for q in practice.draft.questions],
    }
