//! Scrubber pre-send 黑盒集成测试（T1.10 / SPEC §6 v0.1 验收）。
//!
//! 这是"密钥不泄漏给本地 LLM"的**唯一字节级防线**。针对 5 类常见 secret
//! （AWS / PEM / JWT / Authorization Bearer / URI credentials）× 3 个注入
//! 位置（user_text / context.pwd / context.recent_output）= 15 个 case，
//! 每个都断言组装后的 prompt 中**不包含**原始 secret 字节。
//!
//! 运行：`cargo test --test scrubber_blackbox`
//!
//! ⚠️ 不得修改 secret fixture 使其"更容易通过" —— 若需弱化，必须同时
//! 新增等强或更强的 case。参考 `docs/checkpoint-b-rubric.md` G5。

use tunnelfiles_lib::services::ai::prompt::{build, ContextSnapshot, PromptInput, PromptMode};

// ---- Secret fixtures --------------------------------------------------------
// 所有常量都是**已公开的示例值**（AWS 文档 / RFC 7519 示例 / 明显测试数据），
// 不得替换为任何真实凭据。

const AWS_KEY: &str = "AKIAIOSFODNN7EXAMPLE";
const PEM_BLOCK: &str = "-----BEGIN RSA PRIVATE KEY-----\n\
MIIEowIBAAKCAQEAyVNiwXn+tQJXabcdEfGhIjKlMnoPqRsTuVwXyZ0123456789\n\
AbCdEfGhIjKlMnoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZAbCdEfGhIjKl\n\
-----END RSA PRIVATE KEY-----";
const JWT_TOKEN: &str =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0VXNlcklkIiwiaWF0IjoxNjAwfQ.signaturePartXYZ";
const BEARER_HEADER: &str = "Authorization: Bearer sk_live_abcDEF0123456789XYZ_keepOut";
const URI_CREDS: &str = "postgres://admin:supersecretPasswordHere@db.example.com:5432/app";

struct Fixture {
    name: &'static str,
    secret: &'static str,
    /// 提取唯一子串用于断言 —— 避免格式化后"Authorization:"前缀意外命中
    witness: &'static str,
}

fn fixtures() -> [Fixture; 5] {
    [
        Fixture {
            name: "aws-access-key",
            secret: AWS_KEY,
            witness: "AKIAIOSFODNN7EXAMPLE",
        },
        Fixture {
            name: "pem-block",
            secret: PEM_BLOCK,
            // PEM base64 内部 60 字符子串，极低碰撞概率
            witness: "MIIEowIBAAKCAQEAyVNiwXn+tQJXabcdEfGhIjKlMnoPqRsTuVwXyZ0123456789",
        },
        Fixture {
            name: "jwt",
            secret: JWT_TOKEN,
            witness: "signaturePartXYZ",
        },
        Fixture {
            name: "authorization-bearer",
            secret: BEARER_HEADER,
            witness: "sk_live_abcDEF0123456789XYZ_keepOut",
        },
        Fixture {
            name: "uri-credentials",
            secret: URI_CREDS,
            witness: "supersecretPasswordHere",
        },
    ]
}

fn assert_secret_absent(prompt: &str, fixture: &Fixture, placement: &str) {
    assert!(
        !prompt.contains(fixture.witness),
        "secret '{}' leaked into prompt (placement: {}):\nwitness = {:?}\nprompt = {:?}",
        fixture.name,
        placement,
        fixture.witness,
        prompt,
    );
}

// ---- user_text placement ----------------------------------------------------

#[test]
fn secret_in_user_text_is_redacted_for_all_fixtures() {
    for fixture in fixtures().iter() {
        let input = PromptInput {
            user_text: format!("debug why auth fails: {}", fixture.secret),
            context: None,
            history: vec![],
        };
        let prompt = build(&input, PromptMode::Chat);
        assert_secret_absent(&prompt, fixture, "user_text");
    }
}

// ---- context.pwd placement --------------------------------------------------

#[test]
fn secret_in_context_pwd_is_redacted_for_all_fixtures() {
    for fixture in fixtures().iter() {
        // pwd 场景不太会有 PEM 那种多行，但测试目的是边界覆盖：
        // 任何组件上游把 secret 误塞到 pwd 字段都要被挡住。
        let input = PromptInput {
            user_text: "where am I".to_string(),
            context: Some(ContextSnapshot {
                pwd: format!("/work/{}", fixture.secret),
                recent_output: "ok".to_string(),
            }),
            history: vec![],
        };
        let prompt = build(&input, PromptMode::Chat);
        assert_secret_absent(&prompt, fixture, "context.pwd");
    }
}

// ---- context.recent_output placement ----------------------------------------

#[test]
fn secret_in_context_recent_output_is_redacted_for_all_fixtures() {
    for fixture in fixtures().iter() {
        let input = PromptInput {
            user_text: "summarize that".to_string(),
            context: Some(ContextSnapshot {
                pwd: "/tmp".to_string(),
                recent_output: format!(
                    "$ env | grep -i key\nAPI_TOKEN={}\n$ history | tail",
                    fixture.secret
                ),
            }),
            history: vec![],
        };
        let prompt = build(&input, PromptMode::Chat);
        assert_secret_absent(&prompt, fixture, "context.recent_output");
    }
}

// ---- Negative control: ensure assertion helper actually catches a leak ------

#[test]
fn leak_detector_actually_catches_regressions() {
    // 如果 scrubber 哪天被改坏了（比如误配 feature flag 禁用正则），这个
    // negative case 也会误过。这里手动构造一个未走 scrubber 的 prompt 确认
    // 断言工具链本身能检测到 leak。
    let fake_prompt = format!("{} {}", "leading", AWS_KEY);
    let caught = std::panic::catch_unwind(|| {
        assert_secret_absent(
            &fake_prompt,
            &fixtures()[0],
            "synthetic-leak-to-verify-detector",
        );
    });
    assert!(
        caught.is_err(),
        "assert_secret_absent failed to catch a manufactured leak — T1.10 defense is broken"
    );
}

// ---- Smoke: user-input entropy warning path doesn't leak regex matches ------

#[test]
fn user_input_high_entropy_path_still_redacts_regex_matches() {
    // user_text 模式对 entropy 只警告不擦（SPEC §5）。但正则命中必须仍然硬擦。
    // 同一输入里既有 AWS key（正则命中）也有随机 entropy token（只警告）—
    // AWS 部分必须不出现，entropy 部分可以出现（模型看到的是原始字符串）。
    let entropy_noise = "abcdefghij0123456789ABCDEFGHIJKLMNOP";
    let input = PromptInput {
        user_text: format!("please check {} with noise {}", AWS_KEY, entropy_noise),
        context: None,
        history: vec![],
    };
    let prompt = build(&input, PromptMode::Chat);
    assert!(
        !prompt.contains(AWS_KEY),
        "AWS regex hit must be hard-erased"
    );
}
