//! 凭证 scrubber — 把可能是 secret 的内容从送入本地 LLM 的 prompt 中移除。
//!
//! 设计：两条策略（SPEC §5 AI 增量）
//! - `redact_user_input`：用户自己输入的文本。正则命中硬擦，entropy 启发命中只标 warning。
//!   理由：entropy 误伤"形似密钥但其实是 hash/uuid"时不阻塞用户继续送，给 UI 一个 chip 提示。
//! - `redact_probe_output`：探针回带的远端输出 / 文件内容 / 终端历史。
//!   正则命中硬擦，**entropy 命中也硬擦** — 因为若 AI 看到会放大到下一轮 prompt。
//!
//! 正则覆盖 AWS / PEM / URI credential / Authorization Bearer+Basic / X-Api-Key / JWT。
//! 未来扩展请先补 fixture 再改实现（见 `.claude/rules/core-security.md` "日志脱敏" + SPEC §Never）。
//!
//! **禁止** 把原始正则直接 log；测试时用 `assert!(!out.contains(secret))` 做字节级断言。

use std::sync::OnceLock;

use regex::Regex;

pub const REDACTED_PLACEHOLDER: &str = "<REDACTED>";

/// 用户侧 scrub 结果：保留可读文本 + 触发的 warning 列表供 UI 展示。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScrubResult {
    pub text: String,
    pub warnings: Vec<ScrubWarning>,
}

/// Scrub 告警类型（用于 UI inline badge）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScrubWarning {
    /// 匹配到明确的 secret pattern（AWS/PEM/JWT/...）。
    PatternHit(&'static str),
    /// 触发高熵启发（可能是密钥/token，也可能是 hash/uuid）。
    HighEntropyToken,
}

struct NamedRegex {
    name: &'static str,
    re: Regex,
}

/// 共享正则层。顺序有意义：先 PEM 整块擦，否则后面的 base64 行会被 JWT/entropy 干扰。
fn patterns() -> &'static [NamedRegex] {
    static PATTERNS: OnceLock<Vec<NamedRegex>> = OnceLock::new();
    PATTERNS.get_or_init(build_patterns)
}

fn build_patterns() -> Vec<NamedRegex> {
    let build = |name: &'static str, pattern: &str| NamedRegex {
        name,
        re: Regex::new(pattern).expect("scrubber pattern compiles"),
    };
    vec![
        // PEM: 多行 BEGIN...END 块（RSA/EC/OPENSSH/PGP/CERTIFICATE/... 任意标签）
        build(
            "pem-block",
            r"(?s)-----BEGIN [A-Z0-9 ]+-----.*?-----END [A-Z0-9 ]+-----",
        ),
        // AWS access key id（AKIA/ASIA/AGPA/... 共 5 种前缀 × 16 base32 chars）
        build(
            "aws-access-key",
            r"\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b",
        ),
        // AWS secret access key（40 chars base64/`/`+`），只在 secret= / aws_secret= 附近兜底
        build(
            "aws-secret-assignment",
            r"(?i)aws[_-]?secret(?:[_-]?access)?[_-]?key\s*[:=]\s*[A-Za-z0-9+/]{40}",
        ),
        // URI 里的 [user]:pass@host（含 ssh:// / https:// / postgres:// ...）
        // user 可空（如 rediss://:secret@host）
        build(
            "uri-credentials",
            r"(?i)[a-z][a-z0-9+.-]*://[^\s/@:]*:[^\s/@]+@[^\s/]+",
        ),
        // Authorization: Bearer <token>
        build(
            "authorization-bearer",
            r"(?i)authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]+",
        ),
        // Authorization: Basic <b64>
        build(
            "authorization-basic",
            r"(?i)authorization\s*:\s*basic\s+[A-Za-z0-9+/=]+",
        ),
        // X-Api-Key 或 Api-Key 或 Apikey header（允许 JSON/YAML 风格的引号 + 空白包围）
        build(
            "api-key-header",
            r#"(?i)(?:x-api-key|api[_-]?key|apikey)['"\s]*[:=]['"\s]*[A-Za-z0-9._~+/=-]+"#,
        ),
        // JWT（三段点分 base64url），每段至少 4 字符（`eyJ` 前缀已是强信号）
        build(
            "jwt",
            r"\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b",
        ),
    ]
}

/// Scrub user-typed text. 正则命中硬擦；entropy 启发只标 warning。
pub fn redact_user_input(input: &str) -> ScrubResult {
    let (text, mut warnings) = apply_patterns(input);
    if contains_high_entropy_token(&text) {
        warnings.push(ScrubWarning::HighEntropyToken);
    }
    ScrubResult { text, warnings }
}

/// Scrub untrusted material flowing INTO the prompt (probe stdout / file content).
/// Both regex and high-entropy tokens are hard-replaced — don't let the model see them.
pub fn redact_probe_output(input: &str) -> String {
    let (text, _) = apply_patterns(input);
    redact_high_entropy_tokens(&text)
}

fn apply_patterns(input: &str) -> (String, Vec<ScrubWarning>) {
    let mut current = input.to_string();
    let mut warnings = Vec::new();
    for entry in patterns().iter() {
        if entry.re.is_match(&current) {
            warnings.push(ScrubWarning::PatternHit(entry.name));
            current = entry
                .re
                .replace_all(&current, REDACTED_PLACEHOLDER)
                .into_owned();
        }
    }
    (current, warnings)
}

// ---- Shannon entropy ----------------------------------------------------------------

/// 最小长度：短字符串（≤ 19）熵天然不高，跳过
const ENTROPY_MIN_LEN: usize = 20;
/// 触发阈值：随机 base64 约 5.5–6.0；UUID/hash 约 3.9–4.0；我们选 4.5 以上
const ENTROPY_THRESHOLD: f64 = 4.5;

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=' | '_' | '-')
}

fn shannon_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let mut counts = [0u32; 256];
    let mut total = 0u32;
    for b in s.bytes() {
        counts[b as usize] += 1;
        total += 1;
    }
    let total_f = total as f64;
    let mut entropy = 0.0;
    for &c in counts.iter() {
        if c == 0 {
            continue;
        }
        let p = c as f64 / total_f;
        entropy -= p * p.log2();
    }
    entropy
}

fn iter_tokens(input: &str) -> impl Iterator<Item = &str> {
    input
        .split(|c: char| !is_token_char(c))
        .filter(|t| !t.is_empty())
}

fn contains_high_entropy_token(input: &str) -> bool {
    for tok in iter_tokens(input) {
        if tok.len() >= ENTROPY_MIN_LEN && shannon_entropy(tok) >= ENTROPY_THRESHOLD {
            return true;
        }
    }
    false
}

fn redact_high_entropy_tokens(input: &str) -> String {
    // 按 token 边界重建字符串，命中的 token 替换为 placeholder，分隔符保留原样。
    let mut out = String::with_capacity(input.len());
    let mut last = 0;
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        // 跳过非 token 字符，直接拷贝
        if !is_token_char(bytes[i] as char) {
            i += 1;
            continue;
        }
        // 找 token 终点
        let start = i;
        while i < bytes.len() && is_token_char(bytes[i] as char) {
            i += 1;
        }
        let tok = &input[start..i];
        // flush 前面的分隔符
        out.push_str(&input[last..start]);
        if tok.len() >= ENTROPY_MIN_LEN && shannon_entropy(tok) >= ENTROPY_THRESHOLD {
            out.push_str(REDACTED_PLACEHOLDER);
        } else {
            out.push_str(tok);
        }
        last = i;
    }
    out.push_str(&input[last..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- user-input 策略：正则硬擦，entropy 只标 warning ----------------------------

    #[test]
    fn user_input_hard_erases_aws_access_key() {
        let inputs = [
            "my key is AKIAIOSFODNN7EXAMPLE please don't share",
            "asia? try ASIAABCDEFGHIJKLMNOP",
            "ad-hoc key: AGPAQQQQQQQQQQQQQQQQ here",
            "AIDAIOSFODNN7EXAMPLE inline",
            "AROAIOSFODNN7EXAMPLE at end",
        ];
        for s in inputs {
            let r = redact_user_input(s);
            assert!(!r.text.contains("AKIA"), "AWS key leaked: {:?}", r.text);
            assert!(!r.text.contains("ASIA"));
            assert!(!r.text.contains("AGPA"));
            assert!(!r.text.contains("AIDA"));
            assert!(!r.text.contains("AROA"));
        }
    }

    #[test]
    fn user_input_hard_erases_pem_block() {
        let pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\nlines\n-----END RSA PRIVATE KEY-----";
        let openssh = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
        let ec = "-----BEGIN EC PRIVATE KEY-----\nxyz\n-----END EC PRIVATE KEY-----";
        let cert = "-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----";
        let pgp =
            "-----BEGIN PGP PRIVATE KEY BLOCK-----\nlines\n-----END PGP PRIVATE KEY BLOCK-----";
        for pem in [pem, openssh, ec, cert, pgp] {
            let r = redact_user_input(pem);
            assert!(!r.text.contains("BEGIN"), "PEM leaked: {:?}", r.text);
            assert!(r.text.contains(REDACTED_PLACEHOLDER));
            assert!(r
                .warnings
                .iter()
                .any(|w| matches!(w, ScrubWarning::PatternHit("pem-block"))));
        }
    }

    #[test]
    fn user_input_hard_erases_uri_credentials() {
        let samples = [
            "connect to ssh://alice:secret@host.example.com:2222",
            "postgres://user:p%40ss@db.internal/prod",
            "https://john:hunter2@api.example.com/v1",
            "sftp://me:SeCrEt123@box",
            "rediss://:totallysecret@redis.prod:6380/0",
        ];
        for s in samples {
            let r = redact_user_input(s);
            assert!(!r.text.contains(":p"), "creds leaked: {:?}", r.text);
            assert!(!r.text.contains("secret"));
            assert!(!r.text.contains("hunter2"));
            assert!(!r.text.contains("SeCrEt123"));
            assert!(!r.text.contains("totallysecret"));
        }
    }

    #[test]
    fn user_input_hard_erases_authorization_headers() {
        let samples = [
            "Authorization: Bearer abcdef.ghijkl.mnopqr",
            "authorization: bearer token_xyz_123",
            "Authorization: Basic dXNlcjpwYXNzd29yZA==",
            "authorization: BASIC Zm9vOmJhcg==",
            "X-Api-Key: sk_live_abcdef123456",
            "Api-Key: ABC123DEF456GHI789",
            "ApiKey: foo.bar.baz",
        ];
        for s in samples {
            let r = redact_user_input(s);
            assert!(
                !r.text.to_lowercase().contains("bearer ")
                    && !r.text.to_lowercase().contains("basic "),
                "auth scheme leaked: {:?}",
                r.text
            );
            assert!(r.text.contains(REDACTED_PLACEHOLDER));
        }
    }

    #[test]
    fn user_input_hard_erases_jwt() {
        let samples = [
            "token = eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
            "Authorization: Bearer eyJhbGciOi.eyJzdWIi.Sig_Check",
            "plain eyJabcd1234._abcd-.payload_sig",
            "id_token=eyJabcdefg.eyJhijklmn.OpQrStUv",
            "logged { jwt: eyJzAbcd1234.eyJpAbcd1234.AbCdEfGhIj }",
        ];
        for s in samples {
            let r = redact_user_input(s);
            assert!(!r.text.contains("eyJ"), "JWT leaked: {:?}", r.text);
        }
    }

    #[test]
    fn user_input_high_entropy_token_warns_but_keeps_text() {
        // 长 base64，明显高熵但非正则 pattern — user-input 策略：标 warning，不擦
        let random_token = "kM3rN8pT6qLfRwB2aZyH5jPx7vQd4sX1uEiVoY0c9W";
        let s = format!("plz debug {}", random_token);
        let r = redact_user_input(&s);
        assert!(
            r.text.contains(random_token),
            "user-input entropy path 不应该硬擦"
        );
        assert!(r
            .warnings
            .iter()
            .any(|w| matches!(w, ScrubWarning::HighEntropyToken)));
    }

    #[test]
    fn user_input_low_entropy_does_not_warn() {
        // UUID 熵约 3.9 —— 低于阈值 4.5，不触发
        let r = redact_user_input("id=550e8400-e29b-41d4-a716-446655440000");
        assert!(
            r.warnings.is_empty(),
            "UUID 不应触发熵告警: {:?}",
            r.warnings
        );
    }

    // ---- probe-output 策略：正则 + entropy 都硬擦 ------------------------------------

    #[test]
    fn probe_output_hard_erases_high_entropy_token() {
        let token = "kM3rN8pT6qLfRwB2aZyH5jPx7vQd4sX1uEiVoY0c9W";
        let s = format!("env var SUPER_SECRET={}", token);
        let out = redact_probe_output(&s);
        assert!(!out.contains(token), "probe-output 必须硬擦高熵: {:?}", out);
        assert!(out.contains(REDACTED_PLACEHOLDER));
    }

    #[test]
    fn probe_output_hard_erases_aws_key_and_jwt() {
        let s = "creds: AKIAIOSFODNN7EXAMPLE jwt: eyJabcde12345.eyJfghij67890.AbCdEfGh";
        let out = redact_probe_output(s);
        assert!(!out.contains("AKIA"));
        assert!(!out.contains("eyJ"));
    }

    #[test]
    fn probe_output_preserves_plain_text() {
        let s = "the file /etc/nginx/nginx.conf has 200 lines";
        let out = redact_probe_output(s);
        assert_eq!(out, s);
    }

    #[test]
    fn probe_output_preserves_low_entropy_short_tokens() {
        // 路径、IP、普通单词必须原样保留 — 不能被 entropy 误擦
        let s = "192.168.1.1 ls -la /etc/passwd returned 12 rows";
        let out = redact_probe_output(s);
        assert_eq!(out, s);
    }

    // ---- HTTP auth header 专项 ≥ 5 fixtures -----------------------------------------

    #[test]
    fn http_auth_header_fixtures_all_scrubbed() {
        let fixtures = [
            "GET /api\nAuthorization: Bearer sk_live_abcdefghijklmnop\n",
            "curl -H 'Authorization: Basic YWRtaW46c2VjcmV0'",
            "headers: { 'x-api-key': 'test_key_123' }",
            "Api-Key: 9a8b7c6d5e4f3g2h1i",
            "ApiKey: eyJalg.body.sig",
            "X-API-KEY: ABC-def_ghi.jkl",
        ];
        for s in fixtures {
            let r = redact_user_input(s);
            let lower = r.text.to_lowercase();
            assert!(
                !lower.contains("bearer sk_")
                    && !lower.contains("basic ywrtaw46")
                    && !lower.contains("'test_key_123'")
                    && !lower.contains("9a8b7c6d5e4f3g2h1i"),
                "auth header leaked in {:?}",
                r.text
            );
            assert!(r.text.contains(REDACTED_PLACEHOLDER));
        }
    }

    // ---- 两策略独立性：user-input 的 warning 路径不污染 probe-output 的硬擦路径 -----

    #[test]
    fn dual_strategy_isolation_entropy_behavior_diverges() {
        let random_token = "kM3rN8pT6qLfRwB2aZyH5jPx7vQd4sX1uEiVoY0c9W";
        let s = format!("data: {}", random_token);

        let user = redact_user_input(&s);
        let probe = redact_probe_output(&s);

        // user-input 留原文 + warning
        assert!(user.text.contains(random_token));
        assert!(!user.warnings.is_empty());

        // probe-output 硬擦
        assert!(!probe.contains(random_token));
    }

    // ---- shannon_entropy 基础属性 ---------------------------------------------------

    #[test]
    fn entropy_of_empty_is_zero() {
        assert_eq!(shannon_entropy(""), 0.0);
    }

    #[test]
    fn entropy_of_uniform_random_is_high() {
        let random = "kM3rN8pT6qLfRwB2aZyH5jPx7vQd4sX1uEiVoY0c9W";
        assert!(shannon_entropy(random) > 4.5);
    }

    #[test]
    fn entropy_of_repeating_is_low() {
        let repeating = "aaaaaaaaaaaaaaaaaaaa";
        assert!(shannon_entropy(repeating) < 1.0);
    }
}
