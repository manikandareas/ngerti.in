use std::{cmp::Ordering, ops::Range};

pub const TEXT_PREVIEW_BYTES: usize = 128_000;
pub const HIGHLIGHT_CHARACTERS: usize = 100_000;
pub const SOURCE_VIRTUAL_LINES: usize = 500;
pub const PDF_BYTES: u64 = 16 * 1024 * 1024;
pub const PDF_PAGES: usize = 500;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PreviewError {
    TooLarge,
    Truncated,
    InvalidUtf8,
    MalformedTable,
    Unsupported,
}
impl std::fmt::Display for PreviewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::TooLarge => "This preview exceeds its size limit. Download the original file.",
            Self::Truncated => "The preview is incomplete. Download the original file.",
            Self::InvalidUtf8 => {
                "This file is not readable UTF-8 text. Download the original file."
            }
            Self::MalformedTable => {
                "This table could not be read. Retry or download the original file."
            }
            Self::Unsupported => "This format cannot be previewed. Download the original file.",
        })
    }
}
impl std::error::Error for PreviewError {}
pub fn text_preview(bytes: &[u8], truncated: bool) -> Result<&str, PreviewError> {
    if truncated {
        return Err(PreviewError::Truncated);
    }
    if bytes.len() > TEXT_PREVIEW_BYTES {
        return Err(PreviewError::TooLarge);
    }
    decode_preview(bytes, false)
}
fn decode_preview(bytes: &[u8], truncated: bool) -> Result<&str, PreviewError> {
    if bytes.len() > TEXT_PREVIEW_BYTES {
        return Err(PreviewError::TooLarge);
    }
    let text = match std::str::from_utf8(bytes) {
        Ok(text) => text,
        Err(error) if truncated && error.error_len().is_none() => {
            std::str::from_utf8(&bytes[..error.valid_up_to()])
                .map_err(|_| PreviewError::InvalidUtf8)?
        }
        Err(_) => return Err(PreviewError::InvalidUtf8),
    };
    if text
        .chars()
        .any(|c| matches!(c, '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}'))
    {
        return Err(PreviewError::InvalidUtf8);
    }
    Ok(text)
}
#[derive(Clone, Debug)]
pub struct SourceDocument {
    pub original: String,
    pub display: String,
    pub language: &'static str,
    pub highlighted: bool,
    pub highlights: std::sync::Arc<super::syntax::Highlights>,
    pub lines: usize,
    pub virtualized: bool,
    pub truncated: bool,
}
impl SourceDocument {
    pub fn new(name: &str, bytes: &[u8], truncated: bool) -> Result<Self, PreviewError> {
        let original = decode_preview(bytes, truncated)?.to_owned();
        let display = original.replace("\r\n", "\n").replace('\r', "\n");
        let lines = display.split('\n').count();
        let language = language(name);
        let highlighted =
            language != "text" && original.encode_utf16().count() <= HIGHLIGHT_CHARACTERS;
        let highlights = std::sync::Arc::new(if highlighted {
            super::syntax::prepare(language, &display)
        } else {
            vec![]
        });
        Ok(Self {
            highlighted,
            highlights,
            language,
            virtualized: lines > SOURCE_VIRTUAL_LINES,
            truncated,
            lines,
            original,
            display,
        })
    }
    pub fn find(&self, query: &str) -> Vec<Range<usize>> {
        if query.is_empty() || query.contains('\n') {
            return vec![];
        }
        let needle = query.to_lowercase();
        let mut matches = vec![];
        let mut line_offset = 0;
        for line in self.display.split_inclusive('\n') {
            let text = line.strip_suffix('\n').unwrap_or(line);
            let lower = text.to_lowercase();
            // Lowercasing can expand a scalar (for example dotted capital I).
            // Map back to whole original scalars before passing a UTF-8 range
            // to the native editor. Search remains literal and per-line.
            let mut offsets = vec![];
            for (at, character) in text.char_indices() {
                let length = character.to_lowercase().map(char::len_utf8).sum::<usize>();
                offsets.extend(std::iter::repeat_n((at, at + character.len_utf8()), length));
            }
            for (at, found) in lower.match_indices(&needle) {
                if let (Some(start), Some(end)) =
                    (offsets.get(at), offsets.get(at + found.len() - 1))
                {
                    matches.push(line_offset + start.0..line_offset + end.1);
                }
            }
            line_offset += line.len();
        }
        matches
    }
}
pub fn language(name: &str) -> &'static str {
    let name = name.rsplit('/').next().unwrap_or(name).to_ascii_lowercase();
    if name == "dockerfile"
        || name == "containerfile"
        || name.starts_with("dockerfile.")
        || name.starts_with("containerfile.")
    {
        return "dockerfile";
    }
    if name == "makefile"
        || name == "gnumakefile"
        || name.starts_with("makefile.")
        || name.starts_with("gnumakefile.")
        || name.ends_with(".mk")
    {
        return "makefile";
    }
    if matches!(
        name.as_str(),
        ".bashrc" | ".bash_profile" | ".zshrc" | ".zprofile" | ".env"
    ) || name.starts_with(".env.")
    {
        return "bash";
    }
    match name.rsplit('.').next().unwrap_or("") {
        "js" => "javascript",
        "mjs" => "javascript",
        "cjs" => "javascript",
        "jsx" => "jsx",
        "ts" => "typescript",
        "mts" => "typescript",
        "cts" => "typescript",
        "tsx" => "tsx",
        "json" => "json",
        "jsonc" => "jsonc",
        "json5" => "json5",
        "go" => "go",
        "py" => "python",
        "rb" => "ruby",
        "rs" => "rust",
        "php" => "php",
        "java" => "java",
        "kt" => "kotlin",
        "kts" => "kotlin",
        "swift" => "swift",
        "dart" => "dart",
        "r" => "r",
        "lua" => "lua",
        "c" => "c",
        "h" => "c",
        "cpp" => "cpp",
        "cc" => "cpp",
        "cxx" => "cpp",
        "hpp" => "cpp",
        "cs" => "csharp",
        "sh" => "bash",
        "bash" => "bash",
        "zsh" => "bash",
        "fish" => "fish",
        "ps1" => "powershell",
        "html" => "html",
        "htm" => "html",
        "css" => "css",
        "scss" => "scss",
        "sass" => "sass",
        "less" => "less",
        "yaml" => "yaml",
        "yml" => "yaml",
        "toml" => "toml",
        "xml" => "xml",
        "svg" => "xml",
        "md" => "markdown",
        "mdx" => "mdx",
        "sql" => "sql",
        "graphql" => "graphql",
        "gql" => "graphql",
        "proto" => "proto",
        "diff" => "diff",
        "patch" => "diff",
        "dockerfile" => "dockerfile",
        _ => "text",
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Sort {
    pub column: usize,
    pub descending: bool,
}
#[derive(Clone, Copy, Debug)]
pub struct ColumnLayout {
    pub width: f32,
    pub minimum: f32,
    pub numeric: bool,
}
pub fn is_table_number(text: &str) -> bool {
    static NUMBER: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"(?i)^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?$")
            .expect("Number grammar")
    });
    NUMBER.is_match(text.trim())
}
#[derive(Clone, Debug)]
pub struct TableDocument {
    pub original: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}
impl TableDocument {
    pub fn columns(&self) -> Vec<ColumnLayout> {
        self.headers
            .iter()
            .enumerate()
            .map(|(i, title)| {
                let texts = std::iter::once(title.as_str())
                    .chain(
                        self.rows
                            .iter()
                            .take(100)
                            .map(|r| r.get(i).map_or("", String::as_str)),
                    )
                    .collect::<Vec<_>>();
                let longest = texts
                    .iter()
                    .flat_map(|text| text.split_whitespace())
                    .map(|word| word.chars().count())
                    .max()
                    .unwrap_or(0)
                    .clamp(4, 12);
                let width = title.encode_utf16().count().max(
                    self.rows
                        .iter()
                        .take(100)
                        .map(|r| r.get(i).map_or(0, |s| s.encode_utf16().count().min(40)))
                        .max()
                        .unwrap_or(0),
                );
                let values = self
                    .rows
                    .iter()
                    .take(200)
                    .map(|r| r.get(i).map_or("", String::as_str).trim())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>();
                ColumnLayout {
                    width: (width as f32 * 7. + 40.).clamp(140., 320.),
                    minimum: (longest as f32 * 7.5).round(),
                    numeric: !values.is_empty() && values.iter().all(|v| is_table_number(v)),
                }
            })
            .collect()
    }
    pub fn parse(bytes: &[u8], delimiter: char, truncated: bool) -> Result<Self, PreviewError> {
        if !matches!(delimiter, ',' | '\t') {
            return Err(PreviewError::Unsupported);
        }
        let original = text_preview(bytes, truncated)?.to_owned();
        let mut records = vec![];
        let mut row = vec![];
        let mut field = String::new();
        let mut quoted = false;
        let mut closed = false;
        let mut chars = original.trim_start_matches('\u{feff}').chars().peekable();
        while let Some(c) = chars.next() {
            if quoted {
                if c == '"' {
                    if chars.peek() == Some(&'"') {
                        chars.next();
                        field.push('"');
                    } else {
                        quoted = false;
                        closed = true;
                    }
                } else {
                    field.push(c);
                }
                continue;
            }
            match c {
                '"' if field.is_empty() && !closed => quoted = true,
                c if c == delimiter => {
                    row.push(std::mem::take(&mut field));
                    closed = false;
                }
                '\n' | '\r' => {
                    if c == '\r' && chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    row.push(std::mem::take(&mut field));
                    records.push(std::mem::take(&mut row));
                    closed = false;
                }
                c if closed && c.is_whitespace() => {}
                _ if closed => return Err(PreviewError::MalformedTable),
                _ => field.push(c),
            }
        }
        if quoted {
            return Err(PreviewError::MalformedTable);
        }
        if !field.is_empty() || !row.is_empty() || closed {
            row.push(field);
            records.push(row);
        }
        records.retain(|row| row.len() != 1 || !row[0].is_empty());
        if records.is_empty() {
            return Ok(Self {
                original,
                headers: vec![],
                rows: vec![],
            });
        }
        let headers = records.remove(0);
        if headers.len() > 200
            || records.len() > 100_000
            || headers.len() + records.iter().map(Vec::len).sum::<usize>() > 500_000
            || records.iter().any(|row| row.len() > 200)
        {
            return Err(PreviewError::TooLarge);
        }
        if records.iter().any(|row| row.len() != headers.len()) {
            return Err(PreviewError::MalformedTable);
        }
        Ok(Self {
            original,
            headers,
            rows: records,
        })
    }
    pub fn order(&self, query: &str, sort: Option<Sort>) -> Vec<usize> {
        let query = query.trim().to_lowercase();
        let mut order = (0..self.rows.len())
            .filter(|i| {
                query.is_empty()
                    || self.rows[*i]
                        .iter()
                        .any(|s| s.to_lowercase().contains(&query))
            })
            .collect::<Vec<_>>();
        if let Some(sort) = sort {
            order.sort_by(|a, b| {
                let left = self.rows[*a].get(sort.column).map_or("", String::as_str);
                let right = self.rows[*b].get(sort.column).map_or("", String::as_str);
                if left.trim().is_empty() || right.trim().is_empty() {
                    return left
                        .trim()
                        .is_empty()
                        .cmp(&right.trim().is_empty())
                        .then(a.cmp(b));
                }
                let compare = compare_cells(left, right);
                (if sort.descending {
                    compare.reverse()
                } else {
                    compare
                })
                .then(a.cmp(b))
            });
        }
        order
    }
    pub fn csv(&self, order: &[usize]) -> String {
        std::iter::once(&self.headers)
            .chain(order.iter().filter_map(|i| self.rows.get(*i)))
            .map(|row| {
                row.iter()
                    .map(|v| csv_field(v, ',', true))
                    .collect::<Vec<_>>()
                    .join(",")
            })
            .collect::<Vec<_>>()
            .join("\r\n")
    }
    pub fn selection(
        &self,
        order: &[usize],
        anchor: (usize, usize),
        focus: (usize, usize),
    ) -> String {
        let (r0, r1) = (
            anchor.0.min(focus.0),
            anchor.0.max(focus.0).min(order.len().saturating_sub(1)),
        );
        let (c0, c1) = (
            anchor.1.min(focus.1),
            anchor
                .1
                .max(focus.1)
                .min(self.headers.len().saturating_sub(1)),
        );
        (r0..=r1)
            .filter_map(|r| order.get(r).and_then(|i| self.rows.get(*i)))
            .map(|row| {
                (c0..=c1)
                    .map(|c| csv_field(row.get(c).map_or("", String::as_str), '\t', false))
                    .collect::<Vec<_>>()
                    .join("\t")
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}
fn csv_field(value: &str, delimiter: char, escape_formula: bool) -> String {
    let value = if escape_formula && value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.into()
    };
    if value.contains([delimiter, '"', '\r', '\n'])
        || value.starts_with(' ')
        || value.ends_with(' ')
    {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value
    }
}
fn integer_parts(s: &str) -> Option<(bool, &str)> {
    let s = s.trim();
    let negative = s.starts_with('-');
    let digits = s.strip_prefix(['+', '-']).unwrap_or(s);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let digits = digits.trim_start_matches('0');
    Some((negative && !digits.is_empty(), digits))
}
fn compare_cells(a: &str, b: &str) -> Ordering {
    if let (Some((an, a)), Some((bn, b))) = (integer_parts(a), integer_parts(b)) {
        if an != bn {
            return bn.cmp(&an);
        }
        let compare = a.len().cmp(&b.len()).then(a.cmp(b));
        return if an { compare.reverse() } else { compare };
    }
    if let (Ok(a), Ok(b)) = (a.trim().parse::<f64>(), b.trim().parse::<f64>())
        && a.is_finite()
        && b.is_finite()
    {
        return a.total_cmp(&b);
    }
    compare_text(a, b)
}
#[cfg(target_os = "macos")]
fn compare_text(a: &str, b: &str) -> Ordering {
    use objc2_foundation::{NSLocale, NSRange, NSString, NSStringCompareOptions};
    let a = NSString::from_str(a);
    let b = NSString::from_str(b);
    let locale = NSLocale::currentLocale();
    // SAFETY: the locale object is an NSLocale and the range covers the receiver's UTF-16 string.
    unsafe {
        a.compare_options_range_locale(
            &b,
            NSStringCompareOptions::CaseInsensitiveSearch
                | NSStringCompareOptions::DiacriticInsensitiveSearch
                | NSStringCompareOptions::NumericSearch,
            NSRange::new(0, a.length()),
            Some(AsRef::<objc2::runtime::AnyObject>::as_ref(&*locale)),
        )
    }
    .into()
}
#[cfg(not(target_os = "macos"))]
fn compare_text(a: &str, b: &str) -> Ordering {
    let a = a.to_lowercase();
    let b = b.to_lowercase();
    let mut a = a.chars().peekable();
    let mut b = b.chars().peekable();
    loop {
        match (a.peek(), b.peek()) {
            (None, None) => return Ordering::Equal,
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let x = a.by_ref().take_while_ref(|c| c.is_ascii_digit());
                let y = b.by_ref().take_while_ref(|c| c.is_ascii_digit());
                let x = x.trim_start_matches('0');
                let y = y.trim_start_matches('0');
                let cmp = x.len().cmp(&y.len()).then(x.cmp(y));
                if cmp != Ordering::Equal {
                    return cmp;
                }
            }
            _ => {
                let cmp = a.next().cmp(&b.next());
                if cmp != Ordering::Equal {
                    return cmp;
                }
            }
        }
    }
}
#[cfg(not(target_os = "macos"))]
trait Digits {
    fn take_while_ref(&mut self, predicate: impl Fn(char) -> bool) -> String;
}
#[cfg(not(target_os = "macos"))]
impl<I: Iterator<Item = char>> Digits for std::iter::Peekable<I> {
    fn take_while_ref(&mut self, p: impl Fn(char) -> bool) -> String {
        let mut s = String::new();
        while self.peek().is_some_and(|c| p(*c)) {
            s.push(self.next().expect("Peeked character"));
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_and_table_behavior_matches_current_client_vectors() {
        let reference: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../verification/nma-067/content-reference.json"
        ))
        .unwrap();
        for case in reference["file_cases"].as_array().unwrap() {
            assert_eq!(
                language(case["name"].as_str().unwrap()),
                case["language"].as_str().unwrap()
            );
        }
        let data = &reference["table"];
        for case in reference["file_tables"].as_array().unwrap() {
            let parsed = TableDocument::parse(
                case["text"].as_str().unwrap().as_bytes(),
                case["delimiter"].as_str().unwrap().chars().next().unwrap(),
                false,
            );
            assert_eq!(
                parsed.is_ok(),
                case["accepted"].as_bool().unwrap(),
                "{case}"
            );
            if let Ok(table) = parsed {
                assert_eq!(
                    serde_json::json!({"headers": table.headers, "rows": table.rows}),
                    case["table"]
                );
            }
        }
        let table = TableDocument {
            original: String::new(),
            headers: serde_json::from_value(data["headers"].clone()).unwrap(),
            rows: serde_json::from_value(data["rows"].clone()).unwrap(),
        };
        for case in data["orders"].as_array().unwrap() {
            assert_eq!(
                table.order(
                    "",
                    Some(Sort {
                        column: 0,
                        descending: case["descending"].as_bool().unwrap()
                    })
                ),
                serde_json::from_value::<Vec<usize>>(case["order"].clone()).unwrap()
            );
        }
        assert_eq!(
            table.csv(&(0..table.rows.len()).collect::<Vec<_>>()),
            data["csv"].as_str().unwrap()
        );
        assert_eq!(
            table
                .columns()
                .iter()
                .map(|c| c.minimum as u64)
                .collect::<Vec<_>>(),
            serde_json::from_value::<Vec<u64>>(data["minimums"].clone()).unwrap()
        );
        assert_eq!(
            table
                .rows
                .iter()
                .map(|r| is_table_number(&r[0]))
                .collect::<Vec<_>>(),
            serde_json::from_value::<Vec<bool>>(data["numbers"].clone()).unwrap()
        );
        let source = "first\r\nsecond\rthird\n";
        let document = SourceDocument::new("file.ts", source.as_bytes(), false).unwrap();
        assert_eq!(document.lines, 4);
        assert_eq!(document.original, source);
        assert_eq!(document.display, "first\nsecond\nthird\n");
        assert_eq!(document.find("third"), vec![13..18]);
    }
    #[test]
    fn csv_quotes_sort_filter_selection_and_original_are_preserved() {
        let source = "name,value\r\n\"Alpha, one\",9007199254740993\r\nBeta,9007199254740992\r\nGamma,\r\n\"two\nlines\",\"a\"\"b\"\r\n";
        let table = TableDocument::parse(source.as_bytes(), ',', false).unwrap();
        assert_eq!(table.original, source);
        assert_eq!(table.rows[3][0], "two\nlines");
        assert_eq!(table.rows[3][1], "a\"b");
        assert_eq!(table.order("beta", None), vec![1]);
        let sorted = table.order(
            "",
            Some(Sort {
                column: 1,
                descending: false,
            }),
        );
        assert!(sorted.iter().position(|i| *i == 1) < sorted.iter().position(|i| *i == 0));
        assert_eq!(*sorted.last().unwrap(), 2);
        assert_eq!(
            table.selection(&[0, 1], (0, 0), (1, 1)),
            "Alpha, one\t9007199254740993\nBeta\t9007199254740992"
        );
        assert!(TableDocument::parse(b"a,b\n\"unclosed", ',', false).is_err());
        assert!(TableDocument::parse(b"a,b\n1", ',', false).is_err());
        assert!(TableDocument::parse(b"a\n1,2", ',', false).is_err());
        assert!(TableDocument::parse(["x"; 201].join(",").as_bytes(), ',', false,).is_err());
        assert_eq!(
            TableDocument::parse(b"\na,b\n\n1,2\n", ',', false)
                .unwrap()
                .rows,
            vec![vec!["1".to_owned(), "2".to_owned()]]
        );
    }
    #[test]
    fn source_limits_language_unicode_find_and_virtualization() {
        let doc = SourceDocument::new("index.mts", "Éxample\nEXAMPLE".as_bytes(), false).unwrap();
        assert_eq!(doc.language, "typescript");
        assert_eq!(doc.find("example").len(), 1);
        assert_eq!(doc.find("éxample").len(), 1);
        assert!(doc.find("xample\nEX").is_empty());
        let unicode = SourceDocument::new("x", "ſ İ".as_bytes(), false).unwrap();
        assert!(unicode.find("s").is_empty());
        assert_eq!(unicode.find("i"), vec![3..5]);
        assert!(SourceDocument::new("x", &vec![b'a'; 128001], false).is_err());
        assert!(
            !SourceDocument::new("x.ts", &vec![b'a'; 100001], false)
                .unwrap()
                .highlighted
        );
        assert!(
            SourceDocument::new("Containerfile", &"x\n".repeat(501).into_bytes(), false)
                .unwrap()
                .virtualized
        );
        assert!(TableDocument::parse(b"a,b", ',', true).is_err());
        let preview = SourceDocument::new("index.ts", b"const label = '\xe6\x97", true).unwrap();
        assert_eq!(preview.original, "const label = '");
        assert!(preview.truncated);
        assert!(SourceDocument::new("index.ts", b"invalid\xff", true).is_err());
        assert!(SourceDocument::new("index.ts", b"binary\0", false).is_err());
        assert!(SourceDocument::new("index.ts", b"partial\xe6\x97", false).is_err());
        assert_eq!(language("Dockerfile.prod"), "dockerfile");
    }
}
