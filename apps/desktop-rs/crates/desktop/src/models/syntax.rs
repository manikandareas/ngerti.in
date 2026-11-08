//! Read-only source preparation. Parsing runs with file preparation, never editor paint.
//! Parse/scope adaptation: gpui-component 0.9.0, highlighter/syntect_backend.rs,
//! Apache-2.0. Exact package checksum is retained in Cargo.lock/source adoption.
use std::{collections::HashMap, ops::Range, sync::LazyLock};
use syntect::{
    parsing::{ParseState, Scope, ScopeStack, SyntaxReference, SyntaxSet},
    util::LinesWithEndings,
};
static SYNTAXES: LazyLock<SyntaxSet> = LazyLock::new(two_face::syntax::extra_newlines);
pub type Highlights = Vec<(Range<usize>, &'static str)>;
pub fn prepare(language: &str, text: &str) -> Highlights {
    let alias = match language {
        "csharp" => "cs",
        "make" => "Makefile",
        "dockerfile" => "Dockerfile",
        "text" => return vec![],
        other => other,
    };
    let Some(syntax) = SYNTAXES.find_syntax_by_token(alias) else {
        return vec![];
    };
    parse(syntax, text)
}
fn parse(syntax: &SyntaxReference, text: &str) -> Highlights {
    let syntaxes = &*SYNTAXES;
    let mut parser = ParseState::new(syntax);
    let mut scopes = ScopeStack::new();
    let mut names = HashMap::<Scope, Option<&'static str>>::new();
    let mut highlights = Highlights::new();
    let mut offset = 0;

    let mut push = |range: Range<usize>, scopes: &ScopeStack, highlights: &mut Highlights| {
        if range.is_empty() {
            return;
        }
        // The innermost scope that names something wins, so the quotes of a
        // string — `punctuation.definition.string` inside `string` — color as
        // the string rather than as punctuation.
        let name = scopes
            .scopes
            .iter()
            .rev()
            .find_map(|scope| *names.entry(*scope).or_insert_with(|| semantic_name(*scope)));
        if let Some(name) = name {
            match highlights.last_mut() {
                Some((last, last_name)) if last.end == range.start && *last_name == name => {
                    last.end = range.end;
                }
                _ => highlights.push((range, name)),
            }
        }
    };

    for line in LinesWithEndings::from(text) {
        // A line syntect cannot parse keeps the scopes it started with; the
        // next line starts over from them rather than losing the document.
        if let Ok(operations) = parser.parse_line(line, syntaxes) {
            let mut cursor = 0;
            for (index, operation) in operations {
                push(offset + cursor..offset + index, &scopes, &mut highlights);
                let _ = scopes.apply(&operation);
                cursor = index;
            }
            push(
                offset + cursor..offset + line.len(),
                &scopes,
                &mut highlights,
            );
        }
        offset += line.len();
    }
    highlights
}

/// The theme's highlight name for a TextMate scope, or `None` to let an
/// enclosing scope decide.
fn semantic_name(scope: Scope) -> Option<&'static str> {
    let scope = scope.build_string();
    let is = |prefix: &str| {
        scope == prefix
            || scope
                .strip_prefix(prefix)
                .is_some_and(|rest| rest.starts_with('.'))
    };

    let name = if is("punctuation.definition.string")
        || is("punctuation.definition.comment")
        || is("invalid")
        || is("meta")
        || is("source")
        || is("text")
    {
        // Delimiters belong to what they delimit; the rest are containers
        // with no color of their own.
        return None;
    } else if is("comment.block.documentation") || is("comment.line.documentation") {
        "comment.doc"
    } else if is("comment") {
        "comment"
    } else if is("constant.character.escape") {
        "string.escape"
    } else if is("string.regexp") {
        "string.regex"
    } else if is("string") {
        "string"
    } else if is("constant.numeric") {
        "number"
    } else if is("constant.language.boolean") {
        "boolean"
    } else if is("constant") || is("support.constant") || is("entity.name.constant") {
        "constant"
    } else if is("keyword.operator") {
        "operator"
    } else if is("keyword.control.import") || is("meta.preprocessor") {
        "preproc"
    } else if is("keyword") || is("storage.modifier") {
        "keyword"
    } else if is("storage.type") {
        // `fn`, `class` and `let` are declarations, `int` and `bool` are types.
        if [
            "class",
            "enum",
            "function",
            "impl",
            "interface",
            "module",
            "namespace",
            "struct",
            "trait",
            "type",
            "let",
            "var",
            "const",
        ]
        .iter()
        .any(|word| scope.contains(word))
        {
            "keyword"
        } else {
            "type"
        }
    } else if is("entity.name.function")
        || is("support.function")
        || is("variable.function")
        || is("meta.function-call")
    {
        "function"
    } else if is("entity.name.type")
        || is("entity.name.class")
        || is("entity.name.struct")
        || is("entity.name.enum")
        || is("entity.name.trait")
        || is("entity.name.interface")
        || is("entity.other.inherited-class")
        || is("support.type")
        || is("support.class")
    {
        "type"
    } else if is("entity.name.tag") {
        "tag"
    } else if is("entity.other.attribute-name") {
        "attribute"
    } else if is("entity.name.label") {
        "label"
    } else if is("entity.name.section") || is("markup.heading") {
        "title"
    } else if is("variable.language") {
        "variable.special"
    } else if is("variable.other.member")
        || is("variable.other.property")
        || is("support.variable.property")
        || is("meta.mapping.key")
    {
        "property"
    } else if is("variable") {
        "variable"
    } else if is("markup.bold") {
        "emphasis.strong"
    } else if is("markup.italic") {
        "emphasis"
    } else if is("markup.underline.link") {
        "link_uri"
    } else if is("markup.raw") {
        "text.literal"
    } else if is("markup.list") {
        "punctuation.list_marker"
    } else if is("punctuation.section") || is("punctuation.definition.block") {
        "punctuation.bracket"
    } else if is("punctuation.separator") || is("punctuation.terminator") {
        "punctuation.delimiter"
    } else if is("punctuation") {
        "punctuation"
    } else {
        return None;
    };
    Some(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn supported_source_grammars_prepare_ordered_unicode_safe_runs() {
        for (language, source) in [
            ("typescript", "// 日本語\nexport const name = \"hello\";"),
            ("toml", "# config\nready = true"),
            ("rust", "fn main() { let x = 42; }"),
            ("dockerfile", "FROM alpine:3\nRUN echo hello"),
            ("go", "package main\nfunc main() {}"),
        ] {
            let runs = prepare(language, source);
            assert!(!runs.is_empty(), "{language}");
            let mut end = 0;
            for (range, _) in runs {
                assert!(range.start >= end && range.end <= source.len());
                assert!(source.is_char_boundary(range.start) && source.is_char_boundary(range.end));
                end = range.end;
            }
        }
    }
}
