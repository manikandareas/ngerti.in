"""Compile fixed question slots before exporting through the installed LangChain adapter."""

import re
from typing import Any

from langchain_core.utils.function_calling import convert_to_openai_function
from pydantic import Field, TypeAdapter, create_model

from ngertiin.content.questions import (
    Contract,
    Identifier,
    MultipleChoice,
    Ordering,
    PracticeDraft,
    QuestionType,
    ShortAnswer,
    TrueFalse,
    WordBank,
)

QUESTION_MODELS: dict[QuestionType, type[Contract]] = {
    "multiple_choice": MultipleChoice,
    "true_false": TrueFalse,
    "short_answer": ShortAnswer,
    "ordering": Ordering,
    "word_bank": WordBank,
}
ID_ADAPTER = TypeAdapter(Identifier)


def practice_output_model(slots: list[tuple[str, QuestionType]]) -> type[Contract]:
    """One named, fixed-type slot per approved question; no root/discriminator oneOf."""
    if not 4 <= len(slots) <= 6 or len({s[0] for s in slots}) != len(slots):
        raise ValueError("Practice requires 4–6 unique planned slots")
    fields: dict[str, Any] = {}
    for index, (slot_id, question_type) in enumerate(slots, 1):
        ID_ADAPTER.validate_python(slot_id)
        model = create_model(
            f"QuestionSlot{index}",
            __base__=QUESTION_MODELS[question_type],
            id=(
                str,
                Field(pattern=f"^{re.escape(slot_id)}$", description=f"Always {slot_id}."),
            ),
        )
        fields[f"question_{index}"] = (
            model,
            Field(description=f"Approved slot {slot_id}, fixed type {question_type}."),
        )
    return create_model(
        "PracticeSlots",
        __base__=Contract,
        __doc__="One coordinated assessment package with host-locked question slots.",
        **fields,
    )


def parse_practice_output(slots: list[tuple[str, QuestionType]], output: object) -> PracticeDraft:
    parsed = practice_output_model(slots).model_validate(output)
    return PracticeDraft.model_validate(
        {"questions": list(parsed.model_dump(mode="json").values())}
    )


def provider_schema(model: type[Contract]) -> dict:
    """Export the actual provider schema, keeping runtime readers separate from authoring."""
    return convert_to_openai_function(model, strict=True)
