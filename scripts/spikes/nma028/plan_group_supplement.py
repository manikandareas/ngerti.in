"""Run the original group oracle with accepted product mention punctuation.

This is a separately frozen supplemental batch, never substituted into the
99-cell corpus. The original fixture put a sentence-ending period directly after
a handle; the current product's strict ingress rejects that mention before any
admission. Only the disposable client's wording is changed here.
"""

import complete_baseline
from plan_baseline import main

OriginalProduct = complete_baseline.Product


class ValidMentionProduct(OriginalProduct):
    def send(self, conversation, text):
        for agent in conversation["agents"]:
            text = text.replace(
                "@" + agent["handle"] + ".",
                "@" + agent["handle"] + " for verification.",
            )
        return super().send(conversation, text)


if __name__ == "__main__":
    complete_baseline.Product = ValidMentionProduct
    main()
