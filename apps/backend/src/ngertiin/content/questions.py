"""Five supported interactions, with answer keys kept in server-only objects."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
Identifier = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")]
QuestionType = Literal["multiple_choice", "true_false", "short_answer", "ordering", "word_bank"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Choice(Contract):
    id: Identifier = Field(description="Stable ID supplied by the host, never a positional key.")
    text: Text = Field(description="Learner-visible option, ordering element, or token.")


class NumericKey(Contract):
    value: float = Field(description="Finite canonical value in the declared unit.")
    unit: Text | None = Field(description="Required unit symbol; null for dimensionless results.")
    tolerance: float = Field(
        ge=0, description="Absolute tolerance in the same unit; zero if exact."
    )


class DefinitiveKey(Contract):
    canonical_answer: Text = Field(description="One definitive target answer, at most ten words.")
    accepted_variants: list[Text] = Field(
        max_length=20, description="Explicit equivalent answers; [] when none. No essay rubric."
    )
    numeric: NumericKey | None = Field(description="Numeric/unit policy, or null for a term/claim.")


class QuestionBase(Contract):
    id: Identifier = Field(description="Question slot ID fixed in the approved blueprint.")
    criterion_ids: list[Identifier] = Field(
        min_length=1, description="Observable mastery criteria this question intends to assess."
    )
    explanation: Text = Field(description="Private grounded correction, released after evaluation.")


class DistractorReason(Contract):
    option_id: Identifier = Field(description="Incorrect option ID.")
    reason: Text = Field(description="Private misconception/error represented by this option.")


class MultipleChoice(QuestionBase):
    type: Literal["multiple_choice"] = Field(description="Always multiple_choice.")
    prompt: Text = Field(description="One contextualized problem with one best answer.")
    options: list[Choice] = Field(min_length=3, max_length=5, description="Homogeneous choices.")
    correct_option_id: Identifier = Field(description="Private ID of the one best option.")
    distractor_reasons: list[DistractorReason] = Field(
        description="Private misconception/error behind each incorrect option."
    )


class TrueFalse(QuestionBase):
    type: Literal["true_false"] = Field(description="Always true_false.")
    statement: Text = Field(description="One bounded claim, at most 25 words.")
    correct_answer: bool = Field(
        description="Private truth value; explanation corrects false claims."
    )


class ShortAnswer(QuestionBase):
    type: Literal["short_answer"] = Field(description="Always short_answer.")
    prompt: Text = Field(description="Ask for one term, value, or concise proposition.")
    key: DefinitiveKey = Field(
        description="Private definitive answer policy, never an essay rubric."
    )


class Ordering(QuestionBase):
    type: Literal["ordering"] = Field(description="Always ordering.")
    prompt: Text = Field(description="State the ordering criterion; ordering must be unambiguous.")
    items: list[Choice] = Field(min_length=4, max_length=6, description="Shuffled display order.")
    correct_order: list[Identifier] = Field(
        min_length=4, max_length=6, description="Private permutation of every displayed item ID."
    )


class Blank(Contract):
    id: Identifier = Field(description="Stable blank ID supplied in the planned response format.")
    text: Text = Field(description="One contextual sentence with exactly one {{blank}} marker.")


class BlankAnswer(Contract):
    blank_id: Identifier = Field(description="ID of a displayed blank.")
    token_id: Identifier = Field(description="Private ID of its unique semantic matching token.")


class WordBank(QuestionBase):
    type: Literal["word_bank"] = Field(description="Always word_bank.")
    prompt: Text = Field(description="Explain that each selected token can be used at most once.")
    blanks: list[Blank] = Field(min_length=1, max_length=6, description="Contextualized blanks.")
    tokens: list[Choice] = Field(
        min_length=3, max_length=9, description="Answers plus 2–3 distractors."
    )
    answers: list[BlankAnswer] = Field(
        min_length=1, max_length=6, description="Private blank keys."
    )


Question = Annotated[
    MultipleChoice | TrueFalse | ShortAnswer | Ordering | WordBank, Field(discriminator="type")
]


class PracticeDraft(Contract):
    """Provider output; IDs/revisions/hashes for its envelope are owned by the host."""

    questions: list[Question] = Field(
        min_length=4, max_length=6, description="Complementary questions, at least three formats."
    )


def public_question(question: Question) -> dict:
    """Allowlist learner fields; never serialize a private model and remove a few keys."""
    result = {"id": question.id, "type": question.type}
    fields: dict[str, object]
    if isinstance(question, MultipleChoice):
        fields = {"prompt": question.prompt, "options": [o.model_dump() for o in question.options]}
    elif isinstance(question, TrueFalse):
        fields = {"statement": question.statement}
    elif isinstance(question, ShortAnswer):
        fields = {"prompt": question.prompt}
    elif isinstance(question, Ordering):
        fields = {"prompt": question.prompt, "items": [i.model_dump() for i in question.items]}
    else:
        fields = {
            "prompt": question.prompt,
            "blanks": [b.model_dump() for b in question.blanks],
            "tokens": [t.model_dump() for t in question.tokens],
        }
    return {**result, **fields}
